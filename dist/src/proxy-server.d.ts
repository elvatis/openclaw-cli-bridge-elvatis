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
import { grokComplete, grokCompleteStream } from "./grok-client.js";
import { geminiComplete, geminiCompleteStream } from "./gemini-browser.js";
import { claudeComplete, claudeCompleteStream } from "./claude-browser.js";
import { chatgptComplete, chatgptCompleteStream } from "./chatgpt-browser.js";
import type { BrowserContext } from "playwright";
export type GrokCompleteOptions = Parameters<typeof grokComplete>[1];
export type GrokCompleteStreamOptions = Parameters<typeof grokCompleteStream>[1];
export type GrokCompleteResult = Awaited<ReturnType<typeof grokComplete>>;
export interface ProxyServerOptions {
    port: number;
    apiKey?: string;
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
    /** Returns the current authenticated Gemini BrowserContext (null if not logged in) */
    getGeminiContext?: () => BrowserContext | null;
    /** Async lazy connect — called when getGeminiContext returns null */
    connectGeminiContext?: () => Promise<BrowserContext | null>;
    /** Override for testing — replaces geminiComplete */
    _geminiComplete?: typeof geminiComplete;
    /** Override for testing — replaces geminiCompleteStream */
    _geminiCompleteStream?: typeof geminiCompleteStream;
    /** Returns the current authenticated Claude BrowserContext (null if not logged in) */
    getClaudeContext?: () => BrowserContext | null;
    /** Async lazy connect — called when getClaudeContext returns null */
    connectClaudeContext?: () => Promise<BrowserContext | null>;
    /** Override for testing — replaces claudeComplete */
    _claudeComplete?: typeof claudeComplete;
    /** Override for testing — replaces claudeCompleteStream */
    _claudeCompleteStream?: typeof claudeCompleteStream;
    /** Returns the current authenticated ChatGPT BrowserContext (null if not logged in) */
    getChatGPTContext?: () => BrowserContext | null;
    /** Async lazy connect — called when getChatGPTContext returns null */
    connectChatGPTContext?: () => Promise<BrowserContext | null>;
    /** Override for testing — replaces chatgptComplete */
    _chatgptComplete?: typeof chatgptComplete;
    /** Override for testing — replaces chatgptCompleteStream */
    _chatgptCompleteStream?: typeof chatgptCompleteStream;
    /** Returns human-readable expiry string for each web provider (null = no login yet) */
    getExpiryInfo?: () => {
        grok: string | null;
        gemini: string | null;
        claude: string | null;
        chatgpt: string | null;
    };
    /** Plugin version string for the status page */
    version?: string;
    /** Returns the BitNet llama-server base URL (default: http://127.0.0.1:8082) */
    getBitNetServerUrl?: () => string;
    /** Maps model ID → slash command name for the status page display */
    modelCommands?: Record<string, string>;
    /**
     * Model fallback chain — maps a model prefix to a fallback model.
     * When a CLI model fails (timeout, error), the request is retried once
     * with the fallback model. Example: "cli-gemini/gemini-2.5-pro" → "cli-gemini/gemini-2.5-flash"
     */
    modelFallbacks?: Record<string, string>;
}
/** Available CLI bridge models for GET /v1/models */
export declare const CLI_MODELS: {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
}[];
export declare function startProxyServer(opts: ProxyServerOptions): Promise<http.Server>;
//# sourceMappingURL=proxy-server.d.ts.map