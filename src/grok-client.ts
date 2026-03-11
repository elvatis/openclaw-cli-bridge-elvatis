/**
 * grok-client.ts
 *
 * HTTP client that sends chat completion requests to grok.com's internal REST API
 * using an authenticated browser session (cookies).
 *
 * Endpoint: POST https://grok.com/rest/app-chat/conversations/new
 * Response: Server-Sent Events (SSE) stream
 *
 * This mimics what the grok.com web UI does internally.
 */

import type { BrowserContext } from "playwright";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GrokCompleteOptions {
  messages: ChatMessage[];
  model?: string;       // "grok-3" | "grok-3-fast" | "grok-3-mini" | "grok-3-mini-fast"
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface GrokCompleteResult {
  content: string;
  model: string;
  finishReason: string;
  /** estimated — grok.com doesn't expose exact token counts */
  promptTokens?: number;
  completionTokens?: number;
}

/** SSE token event from grok.com */
interface GrokTokenEvent {
  result?: {
    response?: {
      token?: string;
      finalMetadata?: {
        inputTokenCount?: number;
        outputTokenCount?: number;
      };
      modelResponse?: {
        responseId?: string;
        message?: string;
      };
    };
    isSoftStop?: boolean;
  };
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Model ID mapping: OpenAI-style → grok.com internal IDs
// ──────────────────────────────────────────────────────────────────────────────

const MODEL_MAP: Record<string, string> = {
  "grok-3": "grok-3",
  "grok-3-fast": "grok-3-fast",
  "grok-3-mini": "grok-3-mini",
  "grok-3-mini-fast": "grok-3-mini-fast",
  // aliases
  "grok": "grok-3",
  "grok-fast": "grok-3-fast",
  "grok-mini": "grok-3-mini",
};

function resolveModel(model?: string): string {
  if (!model) return "grok-3";
  return MODEL_MAP[model] ?? model;
}

// ──────────────────────────────────────────────────────────────────────────────
// Request builder
// ──────────────────────────────────────────────────────────────────────────────

/** Build the request body for grok.com's internal API */
function buildRequestBody(opts: GrokCompleteOptions): Record<string, unknown> {
  const model = resolveModel(opts.model);

  // Combine messages into a single user prompt (grok.com web doesn't expose multi-turn directly)
  // System prompt → prepended to first user message
  const systemMsgs = opts.messages.filter((m) => m.role === "system");
  const convMsgs = opts.messages.filter((m) => m.role !== "system");

  let userPrompt = "";
  if (systemMsgs.length > 0) {
    userPrompt = systemMsgs.map((m) => m.content).join("\n") + "\n\n";
  }

  // Build conversation history for multi-turn
  const history: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < convMsgs.length - 1; i++) {
    history.push({ role: convMsgs[i].role, content: convMsgs[i].content });
  }
  const lastMsg = convMsgs[convMsgs.length - 1];
  userPrompt += lastMsg?.content ?? "";

  return {
    temporary: false,
    modelName: model,
    message: userPrompt,
    fileAttachments: [],
    imageAttachments: [],
    disableSearch: false,
    enableImageGeneration: false,
    returnImageBytes: false,
    returnRawGrokInXaiRequest: false,
    enableSideBySide: false,
    isReasoning: model.includes("mini"), // mini models support reasoning
    conversationHistory: history,
    toolOverrides: {},
    enableCustomization: false,
    deepsearchPreset: "",
    isPreset: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// SSE parser
// ──────────────────────────────────────────────────────────────────────────────

function parseSSELine(line: string): GrokTokenEvent | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data) as GrokTokenEvent;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main client function
// ──────────────────────────────────────────────────────────────────────────────

const GROK_API_URL = "https://grok.com/rest/app-chat/conversations/new";
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Complete a chat via grok.com's internal API using a browser session context.
 * Uses page.evaluate to make the fetch from inside the authenticated browser context.
 */
export async function grokComplete(
  context: BrowserContext,
  opts: GrokCompleteOptions,
  log: (msg: string) => void
): Promise<GrokCompleteResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = resolveModel(opts.model);
  const body = buildRequestBody(opts);

  log(`grok-client: POST ${GROK_API_URL} model=${model}`);

  // Open a background page in the authenticated context
  const page = await context.newPage();

  try {
    // Navigate to grok.com first to ensure cookies are sent correctly
    await page.goto("https://grok.com", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    // Make the API call from within the page (inherits cookies automatically)
    const result = await page.evaluate(
      async ({ url, requestBody, timeout }: { url: string; requestBody: unknown; timeout: number }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify(requestBody),
            credentials: "include",
            signal: controller.signal,
          });

          if (!resp.ok) {
            const errText = await resp.text().catch(() => "");
            return {
              error: `HTTP ${resp.status}: ${errText.substring(0, 300)}`,
              content: "",
            };
          }

          const reader = resp.body!.getReader();
          const decoder = new TextDecoder();
          let fullText = "";
          let buffer = "";
          let inputTokens = 0;
          let outputTokens = 0;
          let finishReason = "stop";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") {
                finishReason = "stop";
                continue;
              }
              try {
                const evt = JSON.parse(data);
                const response = evt?.result?.response;
                if (response?.token) {
                  fullText += response.token;
                }
                if (response?.finalMetadata) {
                  inputTokens = response.finalMetadata.inputTokenCount ?? 0;
                  outputTokens = response.finalMetadata.outputTokenCount ?? 0;
                }
                if (evt?.result?.isSoftStop) {
                  finishReason = "stop";
                }
                if (evt?.error) {
                  return { error: String(evt.error), content: fullText };
                }
              } catch {
                // ignore parse errors on individual SSE lines
              }
            }
          }

          return {
            content: fullText,
            inputTokens,
            outputTokens,
            finishReason,
          };
        } finally {
          clearTimeout(timer);
        }
      },
      { url: GROK_API_URL, requestBody: body, timeout: timeoutMs }
    );

    if ("error" in result && result.error) {
      throw new Error(`grok.com API error: ${result.error}`);
    }

    log(
      `grok-client: done — ${result.outputTokens ?? "?"} output tokens`
    );

    return {
      content: result.content ?? "",
      model,
      finishReason: result.finishReason ?? "stop",
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
    };
  } finally {
    await page.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Streaming variant — yields tokens via callback
// ──────────────────────────────────────────────────────────────────────────────

export async function grokCompleteStream(
  context: BrowserContext,
  opts: GrokCompleteOptions,
  onToken: (token: string) => void,
  log: (msg: string) => void
): Promise<GrokCompleteResult> {
  // grok.com streams via SSE; we accumulate on the JS side and call onToken per chunk.
  // Because page.evaluate can't stream back to Node, we use a polling approach:
  // write tokens to window.__grokTokenBuf, poll from Node side.
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = resolveModel(opts.model);
  const body = buildRequestBody(opts);

  log(`grok-client: streaming POST ${GROK_API_URL} model=${model}`);

  const page = await context.newPage();

  try {
    await page.goto("https://grok.com", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    // Initialize token buffer on the page
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__grokTokenBuf = [];
      (window as unknown as Record<string, unknown>).__grokDone = false;
      (window as unknown as Record<string, unknown>).__grokError = null;
      (window as unknown as Record<string, unknown>).__grokMeta = null;
    });

    // Start the fetch in the page (non-blocking — we poll from Node)
    await page.evaluate(
      async ({ url, requestBody, timeout }: { url: string; requestBody: unknown; timeout: number }) => {
        const w = window as unknown as Record<string, unknown>;
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeout);

        (async () => {
          try {
            const resp = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
              },
              body: JSON.stringify(requestBody),
              credentials: "include",
              signal: controller.signal,
            });

            if (!resp.ok) {
              const errText = await resp.text().catch(() => "");
              w.__grokError = `HTTP ${resp.status}: ${errText.substring(0, 300)}`;
              w.__grokDone = true;
              return;
            }

            const reader = resp.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (data === "[DONE]") continue;
                try {
                  const evt = JSON.parse(data);
                  const response = evt?.result?.response;
                  if (response?.token) {
                    (w.__grokTokenBuf as string[]).push(response.token);
                  }
                  if (response?.finalMetadata) {
                    w.__grokMeta = response.finalMetadata;
                  }
                  if (evt?.error) {
                    w.__grokError = String(evt.error);
                  }
                } catch {
                  // ignore
                }
              }
            }
          } catch (e: unknown) {
            w.__grokError = String(e);
          } finally {
            w.__grokDone = true;
          }
        })();
      },
      { url: GROK_API_URL, requestBody: body, timeout: timeoutMs }
    );

    // Poll the token buffer from Node side
    let fullContent = "";
    const pollInterval = 100; // ms
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const tokens = (w.__grokTokenBuf as string[]).splice(0);
        return {
          tokens,
          done: w.__grokDone as boolean,
          error: w.__grokError as string | null,
          meta: w.__grokMeta as { inputTokenCount?: number; outputTokenCount?: number } | null,
        };
      });

      for (const token of state.tokens) {
        onToken(token);
        fullContent += token;
      }

      if (state.error) {
        throw new Error(`grok.com stream error: ${state.error}`);
      }

      if (state.done) {
        log(
          `grok-client: stream done — ${state.meta?.outputTokenCount ?? "?"} tokens`
        );
        return {
          content: fullContent,
          model,
          finishReason: "stop",
          promptTokens: state.meta?.inputTokenCount,
          completionTokens: state.meta?.outputTokenCount,
        };
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error(`grok.com stream timeout after ${timeoutMs}ms`);
  } finally {
    await page.close();
  }
}
