/**
 * proxy-server.ts
 *
 * Minimal OpenAI-compatible HTTP proxy server.
 * Routes POST /v1/chat/completions to the appropriate CLI tool.
 * Supports both streaming (SSE) and non-streaming responses.
 *
 * OpenClaw connects via the "vllm" provider with baseUrl pointing here.
 */

import http from "node:http";
import { randomBytes } from "node:crypto";
import { type ChatMessage, routeToCliRunner } from "./cli-runner.js";
import { scheduleTokenRefresh, setAuthLogger, stopTokenRefresh } from "./claude-auth.js";
import { grokComplete, grokCompleteStream, type ChatMessage as GrokChatMessage } from "./grok-client.js";
import type { BrowserContext } from "playwright";

export type GrokCompleteOptions = Parameters<typeof grokComplete>[1];
export type GrokCompleteStreamOptions = Parameters<typeof grokCompleteStream>[1];
export type GrokCompleteResult = Awaited<ReturnType<typeof grokComplete>>;

export interface ProxyServerOptions {
  port: number;
  apiKey?: string; // if set, validates Authorization: Bearer <key>
  timeoutMs?: number;
  log: (msg: string) => void;
  warn: (msg: string) => void;
  /** Returns the current authenticated Grok BrowserContext (null if not logged in) */
  getGrokContext?: () => BrowserContext | null;
  /** Async lazy connect — called when getGrokContext returns null */
  connectGrokContext?: () => Promise<BrowserContext | null>;
  /** Override for testing — replaces grokComplete */
  _grokComplete?: typeof grokComplete;
  /** Override for testing — replaces grokCompleteStream */
  _grokCompleteStream?: typeof grokCompleteStream;
}

/** Available CLI bridge models for GET /v1/models */
export const CLI_MODELS = [
  {
    id: "cli-gemini/gemini-2.5-pro",
    name: "Gemini 2.5 Pro (CLI)",
    contextWindow: 1_000_000,
    maxTokens: 8192,
  },
  {
    id: "cli-gemini/gemini-2.5-flash",
    name: "Gemini 2.5 Flash (CLI)",
    contextWindow: 1_000_000,
    maxTokens: 8192,
  },
  {
    id: "cli-gemini/gemini-3-pro",
    name: "Gemini 3 Pro (CLI)",
    contextWindow: 1_000_000,
    maxTokens: 8192,
  },
  {
    id: "cli-claude/claude-opus-4-6",
    name: "Claude Opus 4.6 (CLI)",
    contextWindow: 200_000,
    maxTokens: 8192,
  },
  {
    id: "cli-claude/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (CLI)",
    contextWindow: 200_000,
    maxTokens: 8192,
  },
  {
    id: "cli-claude/claude-haiku-4-5",
    name: "Claude Haiku 4.5 (CLI)",
    contextWindow: 200_000,
    maxTokens: 8192,
  },
  // Grok web-session models (requires /grok-login)
  { id: "web-grok/grok-3",           name: "Grok 3 (web session)",           contextWindow: 131_072, maxTokens: 131_072 },
  { id: "web-grok/grok-3-fast",      name: "Grok 3 Fast (web session)",      contextWindow: 131_072, maxTokens: 131_072 },
  { id: "web-grok/grok-3-mini",      name: "Grok 3 Mini (web session)",      contextWindow: 131_072, maxTokens: 131_072 },
  { id: "web-grok/grok-3-mini-fast", name: "Grok 3 Mini Fast (web session)", contextWindow: 131_072, maxTokens: 131_072 },
];

// ──────────────────────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────────────────────

export function startProxyServer(opts: ProxyServerOptions): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handleRequest(req, res, opts).catch((err: Error) => {
        opts.warn(`[cli-bridge] Unhandled request error: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: err.message, type: "internal_error" } }));
        }
      });
    });

    // Stop the token refresh interval when the server closes (timer-leak prevention)
    server.on("close", () => {
      stopTokenRefresh();
    });

    server.on("error", (err) => reject(err));
    server.listen(opts.port, "127.0.0.1", () => {
      opts.log(
        `[cli-bridge] proxy server listening on http://127.0.0.1:${opts.port}`
      );
      // Start proactive OAuth token refresh scheduler for Claude Code CLI.
      setAuthLogger(opts.log);
      void scheduleTokenRefresh();
      resolve(server);
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Request router
// ──────────────────────────────────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  opts: ProxyServerOptions
): Promise<void> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const url = req.url ?? "/";

  // Health check
  if (url === "/health" || url === "/v1/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "openclaw-cli-bridge" }));
    return;
  }

  // Model list
  if (url === "/v1/models" && req.method === "GET") {
    const now = Math.floor(Date.now() / 1000);
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
    res.end(
      JSON.stringify({
        object: "list",
        data: CLI_MODELS.map((m) => ({
          id: m.id,
          object: "model",
          created: now,
          owned_by: "openclaw-cli-bridge",
        })),
      })
    );
    return;
  }

  // Chat completions
  if (url === "/v1/chat/completions" && req.method === "POST") {
    // Auth check
    if (opts.apiKey) {
      const auth = req.headers.authorization ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token !== opts.apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Unauthorized", type: "auth_error" } }));
        return;
      }
    }

    const body = await readBody(req);
    let parsed: {
      model: string;
      messages: ChatMessage[];
      stream?: boolean;
    };

    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }));
      return;
    }

    const { model, messages, stream = false } = parsed;

    if (!model || !messages?.length) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "model and messages are required", type: "invalid_request_error" } }));
      return;
    }

    opts.log(`[cli-bridge] ${model} · ${messages.length} msg(s) · stream=${stream}`);

    const id = `chatcmpl-cli-${randomBytes(6).toString("hex")}`;
    const created = Math.floor(Date.now() / 1000);

    // ── Grok web-session routing ──────────────────────────────────────────────
    if (model.startsWith("web-grok/")) {
      let grokCtx = opts.getGrokContext?.() ?? null;
      // Lazy connect: if context is null but a connector is provided, try now
      if (!grokCtx && opts.connectGrokContext) {
        grokCtx = await opts.connectGrokContext();
      }
      if (!grokCtx) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "No active grok.com session. Use /grok-login to authenticate.", code: "no_grok_session" } }));
        return;
      }
      const grokModel = model.replace("web-grok/", "");
      const timeoutMs = opts.timeoutMs ?? 120_000;
      const grokMessages = messages as GrokChatMessage[];
      const doGrokComplete = opts._grokComplete ?? grokComplete;
      const doGrokCompleteStream = opts._grokCompleteStream ?? grokCompleteStream;
      try {
        if (stream) {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", ...corsHeaders() });
          sendSseChunk(res, { id, created, model, delta: { role: "assistant" }, finish_reason: null });
          const result = await doGrokCompleteStream(
            grokCtx,
            { messages: grokMessages, model: grokModel, timeoutMs },
            (token) => sendSseChunk(res, { id, created, model, delta: { content: token }, finish_reason: null }),
            opts.log
          );
          sendSseChunk(res, { id, created, model, delta: {}, finish_reason: result.finishReason });
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          const result = await doGrokComplete(grokCtx, { messages: grokMessages, model: grokModel, timeoutMs }, opts.log);
          res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
          res.end(JSON.stringify({
            id, object: "chat.completion", created, model,
            choices: [{ index: 0, message: { role: "assistant", content: result.content }, finish_reason: result.finishReason }],
            usage: { prompt_tokens: result.promptTokens ?? 0, completion_tokens: result.completionTokens ?? 0, total_tokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0) },
          }));
        }
      } catch (err) {
        const msg = (err as Error).message;
        opts.warn(`[cli-bridge] Grok error for ${model}: ${msg}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: msg, type: "grok_error" } }));
        }
      }
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── CLI runner routing (Gemini / Claude Code) ─────────────────────────────
    let content: string;
    try {
      content = await routeToCliRunner(model, messages, opts.timeoutMs ?? 120_000);
    } catch (err) {
      const msg = (err as Error).message;
      opts.warn(`[cli-bridge] CLI error for ${model}: ${msg}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: msg, type: "cli_error" } }));
      return;
    }

    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders(),
      });

      // Role chunk
      sendSseChunk(res, { id, created, model, delta: { role: "assistant" }, finish_reason: null });

      // Content in chunks (~50 chars each for natural feel)
      const chunkSize = 50;
      for (let i = 0; i < content.length; i += chunkSize) {
        sendSseChunk(res, {
          id,
          created,
          model,
          delta: { content: content.slice(i, i + chunkSize) },
          finish_reason: null,
        });
      }

      // Stop chunk
      sendSseChunk(res, { id, created, model, delta: {}, finish_reason: "stop" });
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const response = {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
      res.end(JSON.stringify(response));
    }

    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: `Not found: ${url}`, type: "not_found" } }));
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function sendSseChunk(
  res: http.ServerResponse,
  params: {
    id: string;
    created: number;
    model: string;
    delta: Record<string, unknown>;
    finish_reason: string | null;
  }
): void {
  const chunk = {
    id: params.id,
    object: "chat.completion.chunk",
    created: params.created,
    model: params.model,
    choices: [
      { index: 0, delta: params.delta, finish_reason: params.finish_reason },
    ],
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (d: Buffer) => chunks.push(d));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
