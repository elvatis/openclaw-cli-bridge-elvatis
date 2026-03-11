/**
 * test/claude-proxy.test.ts
 *
 * Tests for Claude web-session routing in the cli-bridge proxy.
 * Uses _claudeComplete/_claudeCompleteStream DI overrides (no real browser).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startProxyServer, CLI_MODELS } from "../src/proxy-server.js";
import type { BrowserContext } from "playwright";

// ── Stub types matching claude-browser exports ────────────────────────────────
type ClaudeCompleteOptions = {
  messages: { role: string; content: string }[];
  model?: string;
  timeoutMs?: number;
};
type ClaudeCompleteResult = { content: string; model: string; finishReason: string };

// ── Stubs ─────────────────────────────────────────────────────────────────────
const stubClaudeComplete = vi.fn(async (
  _ctx: BrowserContext,
  opts: ClaudeCompleteOptions,
  _log: (msg: string) => void
): Promise<ClaudeCompleteResult> => ({
  content: `claude mock: ${opts.messages[opts.messages.length - 1]?.content ?? ""}`,
  model: opts.model ?? "web-claude/claude-sonnet",
  finishReason: "stop",
}));

const stubClaudeCompleteStream = vi.fn(async (
  _ctx: BrowserContext,
  opts: ClaudeCompleteOptions,
  onToken: (t: string) => void,
  _log: (msg: string) => void
): Promise<ClaudeCompleteResult> => {
  const tokens = ["claude ", "stream ", "mock"];
  for (const t of tokens) onToken(t);
  return { content: tokens.join(""), model: opts.model ?? "web-claude/claude-sonnet", finishReason: "stop" };
});

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function httpPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = http.request(
      { hostname: urlObj.hostname, port: Number(urlObj.port), path: urlObj.pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: raw }); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function httpGet(url: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      { hostname: urlObj.hostname, port: Number(urlObj.port), path: urlObj.pathname, method: "GET" },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: raw }); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Fake context ──────────────────────────────────────────────────────────────
const fakeClaudeCtx = {} as BrowserContext;

// ── Server setup ──────────────────────────────────────────────────────────────
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = await startProxyServer({
    port: 0,
    log: () => {},
    warn: () => {},
    getClaudeContext: () => fakeClaudeCtx,
    // @ts-expect-error — stub types close enough for testing
    _claudeComplete: stubClaudeComplete,
    // @ts-expect-error — stub types close enough for testing
    _claudeCompleteStream: stubClaudeCompleteStream,
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server.close());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Claude web-session routing — model list", () => {
  it("includes web-claude/* models in /v1/models", async () => {
    const res = await httpGet(`${baseUrl}/v1/models`);
    expect(res.status).toBe(200);
    const data = res.body as { data: { id: string }[] };
    const ids = data.data.map((m) => m.id);
    expect(ids).toContain("web-claude/claude-sonnet");
    expect(ids).toContain("web-claude/claude-opus");
    expect(ids).toContain("web-claude/claude-haiku");
  });

  it("web-claude/* models listed in CLI_MODELS", () => {
    const ids = CLI_MODELS.map((m) => m.id);
    expect(ids.some((id) => id.startsWith("web-claude/"))).toBe(true);
  });
});

describe("Claude web-session routing — non-streaming", () => {
  it("returns assistant message for web-claude/claude-sonnet", async () => {
    const res = await httpPost(`${baseUrl}/v1/chat/completions`, {
      model: "web-claude/claude-sonnet",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    });
    expect(res.status).toBe(200);
    const body = res.body as { choices: { message: { content: string } }[] };
    expect(body.choices[0].message.content).toContain("claude mock");
    expect(body.choices[0].message.content).toContain("hello");
  });

  it("calls stubClaudeComplete with correct model and messages", async () => {
    stubClaudeComplete.mockClear();
    await httpPost(`${baseUrl}/v1/chat/completions`, {
      model: "web-claude/claude-opus",
      messages: [{ role: "user", content: "test" }],
      stream: false,
    });
    expect(stubClaudeComplete).toHaveBeenCalledOnce();
    const call = stubClaudeComplete.mock.calls[0];
    expect(call[0]).toBe(fakeClaudeCtx);
    expect(call[1].model).toBe("web-claude/claude-opus");
  });

  it("returns 503 when no claude context is available", async () => {
    const noCtxServer = await startProxyServer({
      port: 0, log: () => {}, warn: () => {},
      getClaudeContext: () => null,
    });
    const addr = noCtxServer.address() as AddressInfo;
    const noCtxUrl = `http://127.0.0.1:${addr.port}`;
    const res = await httpPost(`${noCtxUrl}/v1/chat/completions`, {
      model: "web-claude/claude-sonnet",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(503);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe("no_claude_session");
    noCtxServer.close();
  });
});

describe("Claude web-session routing — streaming", () => {
  it("returns SSE stream for web-claude/claude-sonnet", async () => {
    return new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({
        model: "web-claude/claude-sonnet",
        messages: [{ role: "user", content: "stream test" }],
        stream: true,
      });
      const urlObj = new URL(`${baseUrl}/v1/chat/completions`);
      const req = http.request(
        { hostname: urlObj.hostname, port: Number(urlObj.port), path: urlObj.pathname, method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toContain("text/event-stream");
          let raw = "";
          res.on("data", (c) => (raw += c));
          res.on("end", () => {
            expect(raw).toContain("data:");
            expect(raw).toContain("[DONE]");
            resolve();
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  });

  it("streams tokens from stub", async () => {
    stubClaudeCompleteStream.mockClear();
    return new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({
        model: "web-claude/claude-haiku",
        messages: [{ role: "user", content: "tokens" }],
        stream: true,
      });
      const urlObj = new URL(`${baseUrl}/v1/chat/completions`);
      const req = http.request(
        { hostname: urlObj.hostname, port: Number(urlObj.port), path: urlObj.pathname, method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
        (res) => {
          let raw = "";
          res.on("data", (c) => (raw += c));
          res.on("end", () => {
            expect(stubClaudeCompleteStream).toHaveBeenCalledOnce();
            // Verify stream contains token chunks
            expect(raw).toContain("claude stream mock".split(" ")[0]);
            resolve();
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  });
});
