/**
 * metrics.ts
 *
 * Persistent metrics collector for the CLI bridge proxy.
 * Tracks request counts, errors, latency, and token usage per model.
 * All operations are O(1) — cannot block the event loop.
 *
 * Metrics are persisted to disk on every recordRequest() call (debounced)
 * and restored on startup so stats survive gateway restarts.
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
/**
 * Rough token count estimate: ~4 characters per token.
 * This matches the commonly used GPT tokenizer heuristic and is
 * accurate within ~15% for English text / code.
 */
export declare function estimateTokens(text: string): number;
declare class MetricsCollector {
    private startedAt;
    private data;
    private flushTimer;
    private dirty;
    constructor();
    recordRequest(model: string, durationMs: number, success: boolean, promptTokens?: number, completionTokens?: number): void;
    getMetrics(): MetricsSnapshot;
    reset(): void;
    private load;
    private scheduleSave;
    saveNow(): void;
}
export declare const metrics: MetricsCollector;
export {};
//# sourceMappingURL=metrics.d.ts.map