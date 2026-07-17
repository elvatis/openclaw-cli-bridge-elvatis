/**
 * perplexity-api-runner.ts
 *
 * Perplexity API integration. The API is OpenAI-compatible (same /chat/completions
 * schema) but routes to many providers: OpenAI, Anthropic, Google, xAI, NVIDIA,
 * and Perplexity-native models — all under one API key.
 *
 * Model IDs follow the Perplexity convention: "<provider>/<model>"
 * e.g. "anthropic/claude-opus-4-8", "openai/gpt-5.4", "xai/grok-4.5"
 * Within this plugin they are prefixed: "perplexity-api/<provider>/<model>"
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ToolDefinition } from "./tool-protocol.js";
import type { ChatMessage } from "./cli-runner.js";

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface PerplexityResult {
  content: string;
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface PerplexityApiOptions {
  /** Full plugin model id, e.g. "perplexity-api/anthropic/claude-opus-4-8" */
  model: string;
  timeoutMs?: number;
  tools?: ToolDefinition[];
  log?: (msg: string) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// API key resolution
// ──────────────────────────────────────────────────────────────────────────────

let cachedApiKey: string | null = null;

export function getApiKey(): string {
  if (cachedApiKey) return cachedApiKey;

  if (process.env.PERPLEXITY_API_KEY) {
    cachedApiKey = process.env.PERPLEXITY_API_KEY;
    return cachedApiKey;
  }

  const envPath = join(homedir(), ".openclaw", ".env");
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^PERPLEXITY_API_KEY=(.+)$/m);
    if (match?.[1]) {
      cachedApiKey = match[1].trim();
      return cachedApiKey;
    }
  } catch {
    // Fall through
  }

  throw new Error(
    "PERPLEXITY_API_KEY not found. Set it as an environment variable or add it to ~/.openclaw/.env"
  );
}

export function _resetApiKeyCache(): void {
  cachedApiKey = null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Model ID helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Strip the "perplexity-api/" plugin prefix to get the raw Perplexity model ID.
 * "perplexity-api/anthropic/claude-opus-4-8" → "anthropic/claude-opus-4-8"
 */
function toPerplexityModelId(pluginModel: string): string {
  return pluginModel.startsWith("perplexity-api/")
    ? pluginModel.slice("perplexity-api/".length)
    : pluginModel;
}

// ──────────────────────────────────────────────────────────────────────────────
// Completion (non-streaming)
// ──────────────────────────────────────────────────────────────────────────────

export async function perplexityApiComplete(
  messages: ChatMessage[],
  opts: PerplexityApiOptions
): Promise<PerplexityResult> {
  const apiKey = getApiKey();
  const perplexityModel = toPerplexityModelId(opts.model);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  opts.log?.(`[perplexity-api] completing with ${perplexityModel}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: perplexityModel,
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => resp.statusText);
    throw new Error(`Perplexity API error ${resp.status}: ${body}`);
  }

  const data = await resp.json() as {
    choices: Array<{ message: { content: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? "stop",
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Completion (streaming)
// ──────────────────────────────────────────────────────────────────────────────

export async function perplexityApiCompleteStream(
  messages: ChatMessage[],
  opts: PerplexityApiOptions,
  onToken: (token: string) => void
): Promise<PerplexityResult> {
  const apiKey = getApiKey();
  const perplexityModel = toPerplexityModelId(opts.model);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  opts.log?.(`[perplexity-api] streaming with ${perplexityModel}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: perplexityModel,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => resp.statusText);
    throw new Error(`Perplexity API error ${resp.status}: ${body}`);
  }

  if (!resp.body) {
    throw new Error("Perplexity API: no response body for streaming request");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let finishReason = "stop";
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") break;

        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onToken(delta);
          }
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
          if (chunk.usage?.prompt_tokens) promptTokens = chunk.usage.prompt_tokens;
          if (chunk.usage?.completion_tokens) completionTokens = chunk.usage.completion_tokens;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent, finishReason, promptTokens, completionTokens };
}
