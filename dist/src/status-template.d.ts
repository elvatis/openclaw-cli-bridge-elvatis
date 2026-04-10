/**
 * status-template.ts
 *
 * Generates the HTML dashboard for the /status endpoint.
 * Extracted from proxy-server.ts for maintainability.
 */
import type { BrowserContext } from "playwright";
import type { MetricsSnapshot } from "./metrics.js";
export interface StatusProvider {
    name: string;
    icon: string;
    expiry: string | null;
    loginCmd: string;
    ctx: BrowserContext | null;
}
export interface StatusTemplateOptions {
    version: string;
    port: number;
    providers: StatusProvider[];
    models: Array<{
        id: string;
        name: string;
        contextWindow: number;
        maxTokens: number;
    }>;
    /** Maps model ID → slash command name (e.g. "openai-codex/gpt-5.3-codex" → "/cli-codex") */
    modelCommands?: Record<string, string>;
    /** In-memory metrics snapshot — optional for backward compat */
    metrics?: MetricsSnapshot;
}
export declare function renderStatusPage(opts: StatusTemplateOptions): string;
//# sourceMappingURL=status-template.d.ts.map