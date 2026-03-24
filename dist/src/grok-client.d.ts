/**
 * grok-client.ts
 *
 * Grok.com integration via Playwright DOM automation.
 *
 * Strategy: inject messages via the ProseMirror editor, poll `.message-bubble`
 * DOM elements for the response. This bypasses Cloudflare anti-bot checks
 * on direct API calls (which require signed x-statsig-id headers generated
 * inside the page's own bundle — not accessible externally).
 *
 * Works by connecting to the running OpenClaw browser (CDP port 18800) which
 * already has an authenticated grok.com session open.
 */
import type { BrowserContext, Page } from "playwright";
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface GrokCompleteOptions {
    messages: ChatMessage[];
    model?: string;
    timeoutMs?: number;
}
export interface GrokCompleteResult {
    content: string;
    model: string;
    finishReason: string;
    promptTokens?: number;
    completionTokens?: number;
}
/**
 * Get an existing grok.com page from the context, or navigate to grok.com.
 */
export declare function getOrCreateGrokPage(context: BrowserContext): Promise<{
    page: Page;
    owned: boolean;
}>;
/**
 * Non-streaming completion.
 */
export declare function grokComplete(context: BrowserContext, opts: GrokCompleteOptions, log: (msg: string) => void): Promise<GrokCompleteResult>;
/**
 * Streaming completion — polls the DOM and calls onToken when new text arrives.
 */
export declare function grokCompleteStream(context: BrowserContext, opts: GrokCompleteOptions, onToken: (token: string) => void, log: (msg: string) => void): Promise<GrokCompleteResult>;
//# sourceMappingURL=grok-client.d.ts.map