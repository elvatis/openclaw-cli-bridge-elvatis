/**
 * chatgpt-browser.ts
 *
 * ChatGPT web automation via Playwright DOM-polling.
 * Strategy identical to claude-browser.ts / grok-client.ts.
 *
 * DOM structure (confirmed 2026-03-11):
 *   Editor:   #prompt-textarea (ProseMirror — use execCommand)
 *   Send btn: button[data-testid="send-button"]
 *   Response: [data-message-author-role="assistant"] (last element)
 *   Streaming indicator: button[data-testid="stop-button"]
 */
import type { BrowserContext, Page } from "playwright";
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface ChatGPTBrowserOptions {
    messages: ChatMessage[];
    model?: string;
    timeoutMs?: number;
}
export interface ChatGPTBrowserResult {
    content: string;
    model: string;
    finishReason: string;
}
/**
 * Get or create a chatgpt.com page in the given context.
 */
export declare function getOrCreateChatGPTPage(context: BrowserContext): Promise<{
    page: Page;
    owned: boolean;
}>;
export declare function chatgptComplete(context: BrowserContext, opts: ChatGPTBrowserOptions, log: (msg: string) => void): Promise<ChatGPTBrowserResult>;
export declare function chatgptCompleteStream(context: BrowserContext, opts: ChatGPTBrowserOptions, onToken: (token: string) => void, log: (msg: string) => void): Promise<ChatGPTBrowserResult>;
//# sourceMappingURL=chatgpt-browser.d.ts.map