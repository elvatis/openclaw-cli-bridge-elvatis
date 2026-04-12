/**
 * status-template.ts
 *
 * Generates the HTML dashboard for the /status endpoint.
 * Extracted from proxy-server.ts for maintainability.
 */
import type { BrowserContext } from "playwright";
import type { MetricsSnapshot } from "./metrics.js";
import type { ProviderSession } from "./provider-sessions.js";
import type { ActiveRequest } from "./proxy-server.js";
export interface StatusProvider {
    name: string;
    icon: string;
    expiry: string | null;
    loginCmd: string;
    ctx: BrowserContext | null;
}
export interface TimeoutConfigInfo {
    defaults: Record<string, number>;
    baseDefault: number;
    maxEffective: number;
    perExtraMsg: number;
    perTool: number;
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
    modelCommands?: Record<string, string>;
    metrics?: MetricsSnapshot;
    activeRequests?: ActiveRequest[];
    providerSessionsList?: ProviderSession[];
    timeoutConfig?: TimeoutConfigInfo;
}
export declare function renderStatusPage(opts: StatusTemplateOptions): string;
//# sourceMappingURL=status-template.d.ts.map