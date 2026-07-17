/**
 * openrouter-runner.ts
 *
 * OpenRouter API integration. OpenAI-compatible endpoint that aggregates
 * hundreds of models from Anthropic, OpenAI, Google, xAI, Meta, Mistral,
 * DeepSeek, and more — all under one API key.
 *
 * Model IDs follow OpenRouter convention: "<provider>/<model>"
 * e.g. "anthropic/claude-opus-4-8", "openai/gpt-4o", "deepseek/deepseek-r1"
 * Within this plugin they are prefixed: "openrouter-api/<provider>/<model>"
 *
 * Docs: https://openrouter.ai/docs/api-reference/chat-completions
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ToolDefinition } from "./tool-protocol.js";
import type { ChatMessage } from "./cli-runner.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_REFERER = "https://elvatis.com";
const OPENROUTER_TITLE = "openclaw-cli-bridge";

export interface OpenRouterResult {
  content: string;
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface OpenRouterApiOptions {
  /** Full plugin model id, e.g. "openrouter-api/anthropic/claude-opus-4-8" */
  model: string;
  timeoutMs?: number;
  tools?: ToolDefinition[];
  log?: (msg: string) => void;
}

let cachedApiKey: string | null = null;

export function getApiKey(): string {
  if (cachedApiKey) return cachedApiKey;

  if (process.env.OPENROUTER_API_KEY) {
    cachedApiKey = process.env.OPENROUTER_API_KEY;
    return cachedApiKey;
  }

  const envPath = join(homedir(), ".openclaw", ".env");
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^OPENROUTER_API_KEY=(.+)$/m);
    if (match?.[1]) {
      cachedApiKey = match[1].trim();
      return cachedApiKey;
    }
  } catch {
    // fall through
  }

  throw new Error(
    "OPENROUTER_API_KEY not found. Set it in ~/.openclaw/.env as OPENROUTER_API_KEY=sk-or-v1-..."
  );
}

export function _resetApiKeyCache(): void {
  cachedApiKey = null;
}

function toOpenRouterModelId(pluginModel: string): string {
  return pluginModel.startsWith("openrouter-api/")
    ? pluginModel.slice("openrouter-api/".length)
    : pluginModel;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": OPENROUTER_REFERER,
    "X-Title": OPENROUTER_TITLE,
  };
}

export async function openrouterApiComplete(
  messages: ChatMessage[],
  opts: OpenRouterApiOptions
): Promise<OpenRouterResult> {
  const apiKey = getApiKey();
  const orModel = toOpenRouterModelId(opts.model);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  opts.log?.(`[openrouter-api] completing with ${orModel}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ model: orModel, messages, stream: false }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => resp.statusText);
    throw new Error(`OpenRouter API error ${resp.status}: ${body}`);
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

export async function openrouterApiCompleteStream(
  messages: ChatMessage[],
  opts: OpenRouterApiOptions,
  onToken: (token: string) => void
): Promise<OpenRouterResult> {
  const apiKey = getApiKey();
  const orModel = toOpenRouterModelId(opts.model);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  opts.log?.(`[openrouter-api] streaming with ${orModel}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ model: orModel, messages, stream: true }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => resp.statusText);
    throw new Error(`OpenRouter API error ${resp.status}: ${body}`);
  }

  if (!resp.body) {
    throw new Error("OpenRouter API: no response body for streaming request");
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
          // skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent, finishReason, promptTokens, completionTokens };
}
