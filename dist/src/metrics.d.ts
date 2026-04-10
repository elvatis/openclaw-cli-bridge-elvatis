/**
 * metrics.ts
 *
 * In-memory metrics collector for the CLI bridge proxy.
 * Tracks request counts, errors, latency, and token usage per model.
 * All operations are O(1) — cannot block the event loop.
 */
export interface ModelMetrics {
    model: string;
    requests: number;
    errors: number;
    totalLatencyMs: number;
    promptTokens: number;
    completionTokens: number;
    lastRequestAt: number | null;
}
export interface MetricsSnapshot {
    startedAt: number;
    totalRequests: number;
    totalErrors: number;
    models: ModelMetrics[];
}
declare class MetricsCollector {
    private startedAt;
    private data;
    recordRequest(model: string, durationMs: number, success: boolean, promptTokens?: number, completionTokens?: number): void;
    getMetrics(): MetricsSnapshot;
    reset(): void;
}
export declare const metrics: MetricsCollector;
export {};
//# sourceMappingURL=metrics.d.ts.map