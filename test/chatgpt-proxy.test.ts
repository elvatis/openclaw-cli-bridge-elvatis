/**
 * test/chatgpt-proxy.test.ts
 *
 * Tests for ChatGPT web-session routing in the cli-bridge proxy.
 * Uses _chatgptComplete/_chatgptCompleteStream DI overrides (no real browser).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startProxyServer, CLI_MODELS } from "../src/proxy-server.js";
import type { BrowserContext } from "playwright";

type Opts = { messages: { role: string; content: string }[]; model?: string; timeoutMs?: number };
type Result = { content: string; model: string; finishReason: string };

const stubComplete = vi.fn(async (_ctx: BrowserContext, opts: Opts, _log: (m: string) => void): Promise<Result> => ({
  content: `chatgpt mock: ${opts.messages[opts.messages.length - 1]?.content ?? ""}`,
  model: opts.model ?? "web-chatgpt/gpt-4o", finishReason: "stop",
}));
const stubStream = vi.fn(async (_ctx: BrowserContext, opts: Opts, onToken: (t: string) => void, _log: (m: string) => void): Promise<Result> => {
  ["chatgpt ", "stream ", "mock"].forEach(t => onToken(t));
  return { content: "chatgpt stream mock", model: opts.model ?? "web-chatgpt/gpt-4o", finishReason: "stop" };
});

async function post(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((res, rej) => {
    const d = JSON.stringify(body); const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: Number(u.port), path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) } },
      resp => { let raw = ""; resp.on("data", c => raw += c); resp.on("end", () => { try { res({ status: resp.statusCode ?? 0, body: JSON.parse(raw) }); } catch { res({ status: resp.statusCode ?? 0, body: raw }); } }); });
    r.on("error", rej); r.write(d); r.end();
  });
}
async function get(url: string): Promise<{ status: number; body: unknown }> {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: Number(u.port), path: u.pathname, method: "GET" },
      resp => { let raw = ""; resp.on("data", c => raw += c); resp.on("end", () => { try { res({ status: resp.statusCode ?? 0, body: JSON.parse(raw) }); } catch { res({ status: resp.statusCode ?? 0, body: raw }); } }); });
    r.on("error", rej); r.end();
  });
}

const fakeCtx = {} as BrowserContext;
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = await startProxyServer({
    port: 0, log: () => {}, warn: () => {},
    getChatGPTContext: () => fakeCtx,
    // @ts-expect-error stub
    _chatgptComplete: stubComplete,
    // @ts-expect-error stub
    _chatgptCompleteStream: stubStream,
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("ChatGPT routing — model list", () => {
  it("includes web-chatgpt/* models in /v1/models", async () => {
    const res = await get(`${baseUrl}/v1/models`);
    expect(res.status).toBe(200);
    const ids = (res.body as { data: { id: string }[] }).data.map(m => m.id);
    expect(ids).toContain("web-chatgpt/gpt-4o");
    expect(ids).toContain("web-chatgpt/gpt-5");
  });
  it("CLI_MODELS includes web-chatgpt/*", () => {
    expect(CLI_MODELS.some(m => m.id.startsWith("web-chatgpt/"))).toBe(true);
  });
});

describe("ChatGPT routing — non-streaming", () => {
  it("returns assistant message for web-chatgpt/gpt-4o", async () => {
    const res = await post(`${baseUrl}/v1/chat/completions`, {
      model: "web-chatgpt/gpt-4o", messages: [{ role: "user", content: "hello chatgpt" }], stream: false,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).choices[0].message.content).toContain("chatgpt mock");
  });
  it("passes correct model to stub", async () => {
    stubComplete.mockClear();
    await post(`${baseUrl}/v1/chat/completions`, { model: "web-chatgpt/gpt-o3", messages: [{ role: "user", content: "x" }] });
    expect(stubComplete).toHaveBeenCalledOnce();
    expect(stubComplete.mock.calls[0][1].model).toBe("web-chatgpt/gpt-o3");
  });
  it("returns 503 when no context", async () => {
    const s = await startProxyServer({ port: 0, log: () => {}, warn: () => {}, getChatGPTContext: () => null });
    const u = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    const r = await post(`${u}/v1/chat/completions`, { model: "web-chatgpt/gpt-4o", messages: [{ role: "user", content: "hi" }] });
    expect(r.status).toBe(503);
    expect((r.body as any).error.code).toBe("no_chatgpt_session");
    s.close();
  });
});

describe("ChatGPT routing — streaming", () => {
  it("returns SSE stream with [DONE]", () => new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({ model: "web-chatgpt/gpt-4o", messages: [{ role: "user", content: "s" }], stream: true });
    const u = new URL(`${baseUrl}/v1/chat/completions`);
    const r = http.request({ hostname: u.hostname, port: Number(u.port), path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      resp => { let raw = ""; resp.on("data", c => raw += c); resp.on("end", () => { expect(raw).toContain("[DONE]"); resolve(); }); });
    r.on("error", reject); r.write(body); r.end();
  }));
});
