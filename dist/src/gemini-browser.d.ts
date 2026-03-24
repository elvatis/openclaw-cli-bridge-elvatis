/**
 * gemini-browser.ts
 *
 * Gemini web automation via Playwright DOM-polling.
 * Strategy identical to grok-client.ts / claude-browser.ts.
 *
 * DOM structure (confirmed 2026-03-11):
 *   Editor:   .ql-editor (Quill — use page.type(), NOT execCommand)
 *   Response: message-content (custom element, innerText = clean response)
 *   Also:     .markdown (same content, markdown-rendered)
 */
import type { BrowserContext, Page } from "playwright";
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface GeminiBrowserOptions {
    messages: ChatMessage[];
    model?: string;
    timeoutMs?: number;
}
export interface GeminiBrowserResult {
    content: string;
    model: string;
    finishReason: string;
}
/**
 * Get or create a Gemini page in the given context.
 */
export declare function getOrCreateGeminiPage(context: BrowserContext): Promise<{
    page: Page;
    owned: boolean;
}>;
export declare function geminiComplete(context: BrowserContext, opts: GeminiBrowserOptions, log: (msg: string) => void): Promise<GeminiBrowserResult>;
export declare function geminiCompleteStream(context: BrowserContext, opts: GeminiBrowserOptions, onToken: (token: string) => void, log: (msg: string) => void): Promise<GeminiBrowserResult>;
//# sourceMappingURL=gemini-browser.d.ts.map