/**
 * status-template.ts
 *
 * Generates the HTML dashboard for the /status endpoint.
 * v3.0: Sidebar navigation, section-based layout, JS polling, live log viewer.
 */
import type { BrowserContext } from "playwright";
import type { MetricsSnapshot, RequestLogEntry, FallbackEvent } from "./metrics.js";
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
export declare function renderProviders(providers: StatusProvider[]): string;
export declare function renderActiveRequests(active: ActiveRequest[]): string;
export declare function renderRecentRequestLog(entries: RequestLogEntry[]): string;
export declare function renderFallbackHistory(events: FallbackEvent[]): string;
export declare function renderProviderSessions(sessions: ProviderSession[]): string;
export declare function renderTimeoutConfig(config: TimeoutConfigInfo): string;
export declare function renderMetricsSection(m: MetricsSnapshot): string;
export interface DashboardSections {
    providers: string;
    metrics: string;
    active: string;
    recent: string;
    fallbacks: string;
    sessions: string;
    timeouts: string;
    models: string;
}
export declare function renderDashboardData(opts: StatusTemplateOptions): DashboardSections;
export declare function renderStatusPage(opts: StatusTemplateOptions): string;
//# sourceMappingURL=status-template.d.ts.map