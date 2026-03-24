/**
 * claude-browser.ts
 *
 * Claude.ai browser automation via Playwright DOM-polling.
 * Identical strategy to grok-client.ts — no direct API calls,
 * everything runs through the authenticated browser page.
 *
 * DOM structure (as of 2026-03-11):
 *   Editor:   .ProseMirror (tiptap)
 *   Messages: [data-test-render-count] divs, alternating user/assistant
 *             Assistant messages: child div with class "group" (no "mb-1 mt-6")
 */
import type { BrowserContext, Page } from "playwright";
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface ClaudeBrowserOptions {
    messages: ChatMessage[];
    model?: string;
    timeoutMs?: number;
}
export interface ClaudeBrowserResult {
    content: string;
    model: string;
    finishReason: string;
}
/**
 * Get or create a claude.ai/new page in the given context.
 */
export declare function getOrCreateClaudePage(context: BrowserContext): Promise<{
    page: Page;
    owned: boolean;
}>;
export declare function claudeComplete(context: BrowserContext, opts: ClaudeBrowserOptions, log: (msg: string) => void): Promise<ClaudeBrowserResult>;
export declare function claudeCompleteStream(context: BrowserContext, opts: ClaudeBrowserOptions, onToken: (token: string) => void, log: (msg: string) => void): Promise<ClaudeBrowserResult>;
//# sourceMappingURL=claude-browser.d.ts.map