/**
 * lm-studio-runner.ts
 *
 * LM Studio local inference integration.
 * LM Studio exposes an OpenAI-compatible API — no auth required, no subprocess.
 *
 * Configuration (in ~/.openclaw/.env):
 *   LM_STUDIO_URL=http://192.168.177.4:1234   # default: http://127.0.0.1:1234
 *
 * Model IDs:
 *   Within this plugin: "lm-studio/<model-name>"
 *   Sent to LM Studio:  "<model-name>"  (the exact ID from LM Studio's /v1/models)
 *   Use "lm-studio/auto" to let LM Studio pick whichever model is loaded.
 *
 * Docs: https://lmstudio.ai/docs/api/openai-api
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ChatMessage } from "./cli-runner.js";

const DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234";

// ──────────────────────────────────────────────────────────────────────────────
// URL resolution
// ──────────────────────────────────────────────────────────────────────────────

let cachedUrl: string | null = null;

export function getLmStudioUrl(): string {
  if (cachedUrl) return cachedUrl;

  if (process.env.LM_STUDIO_URL) {
    cachedUrl = process.env.LM_STUDIO_URL.replace(/\/$/, "");
    return cachedUrl;
  }

  const envPath = join(homedir(), ".openclaw", ".env");
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^LM_STUDIO_URL=(.+)$/m);
    if (match?.[1]) {
      cachedUrl = match[1].trim().replace(/\/$/, "");
      return cachedUrl;
    }
  } catch {
    // fall through to default
  }

  cachedUrl = DEFAULT_LM_STUDIO_URL;
  return cachedUrl;
}

export function _resetUrlCache(): void {
  cachedUrl = null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Model ID helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Strip the "lm-studio/" plugin prefix. "lm-studio/auto" → "" (LM Studio picks). */
function toLmStudioModelId(pluginModel: string): string {
  const raw = pluginModel.startsWith("lm-studio/")
    ? pluginModel.slice("lm-studio/".length)
    : pluginModel;
  return raw === "auto" ? "" : raw;
}

// ──────────────────────────────────────────────────────────────────────────────
// Model discovery
// ──────────────────────────────────────────────────────────────────────────────

export interface LmStudioModel {
  id: string;
  object: string;
  owned_by?: string;
}

/**
 * Fetch the list of currently loaded models from LM Studio.
 * Returns an empty array if LM Studio is unreachable.
 */
export async function discoverLmStudioModels(timeoutMs = 5_000): Promise<LmStudioModel[]> {
  const url = getLmStudioUrl();
  try {
    const resp = await fetch(`${url}/v1/models`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { data?: LmStudioModel[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

/** Check if LM Studio is reachable. */
export async function isLmStudioReachable(timeoutMs = 3_000): Promise<boolean> {
  const models = await discoverLmStudioModels(timeoutMs);
  return models.length >= 0; // even empty list means it responded
}

// ──────────────────────────────────────────────────────────────────────────────
// Result type
// ──────────────────────────────────────────────────────────────────────────────

export interface LmStudioResult {
  content: string;
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
}

export interface LmStudioOptions {
  /** Plugin model id, e.g. "lm-studio/auto" or "lm-studio/llama-3.1-8b" */
  model: string;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Completion (non-streaming)
// ──────────────────────────────────────────────────────────────────────────────

export async function lmStudioComplete(
  messages: ChatMessage[],
  opts: LmStudioOptions
): Promise<LmStudioResult> {
  const baseUrl = getLmStudioUrl();
  const lmModel = toLmStudioModelId(opts.model);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  opts.log?.(`[lm-studio] completing with model="${lmModel || "auto"}" at ${baseUrl}`);

  const body: Record<string, unknown> = { messages, stream: false };
  if (lmModel) body.model = lmModel;

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => resp.statusText);
    throw new Error(`LM Studio error ${resp.status}: ${errBody}`);
  }

  const data = await resp.json() as {
    choices: Array<{ message: { content: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };

  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? "stop",
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    model: data.model,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Completion (streaming)
// ──────────────────────────────────────────────────────────────────────────────

export async function lmStudioCompleteStream(
  messages: ChatMessage[],
  opts: LmStudioOptions,
  onToken: (token: string) => void
): Promise<LmStudioResult> {
  const baseUrl = getLmStudioUrl();
  const lmModel = toLmStudioModelId(opts.model);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  opts.log?.(`[lm-studio] streaming with model="${lmModel || "auto"}" at ${baseUrl}`);

  const body: Record<string, unknown> = { messages, stream: true };
  if (lmModel) body.model = lmModel;

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => resp.statusText);
    throw new Error(`LM Studio error ${resp.status}: ${errBody}`);
  }

  if (!resp.body) {
    throw new Error("LM Studio: no response body for streaming request");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let finishReason = "stop";
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let activeModel: string | undefined;

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
            model?: string;
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) { fullContent += delta; onToken(delta); }
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
          if (chunk.usage?.prompt_tokens) promptTokens = chunk.usage.prompt_tokens;
          if (chunk.usage?.completion_tokens) completionTokens = chunk.usage.completion_tokens;
          if (chunk.model) activeModel = chunk.model;
        } catch { /* skip malformed chunks */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent, finishReason, promptTokens, completionTokens, model: activeModel };
}
