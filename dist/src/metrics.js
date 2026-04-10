/**
 * metrics.ts
 *
 * In-memory metrics collector for the CLI bridge proxy.
 * Tracks request counts, errors, latency, and token usage per model.
 * All operations are O(1) — cannot block the event loop.
 */
class MetricsCollector {
    startedAt = Date.now();
    data = new Map();
    recordRequest(model, durationMs, success, promptTokens, completionTokens) {
        let entry = this.data.get(model);
        if (!entry) {
            entry = {
                model,
                requests: 0,
                errors: 0,
                totalLatencyMs: 0,
                promptTokens: 0,
                completionTokens: 0,
                lastRequestAt: null,
            };
            this.data.set(model, entry);
        }
        entry.requests++;
        if (!success)
            entry.errors++;
        entry.totalLatencyMs += durationMs;
        if (promptTokens)
            entry.promptTokens += promptTokens;
        if (completionTokens)
            entry.completionTokens += completionTokens;
        entry.lastRequestAt = Date.now();
    }
    getMetrics() {
        let totalRequests = 0;
        let totalErrors = 0;
        const models = [];
        for (const entry of this.data.values()) {
            totalRequests += entry.requests;
            totalErrors += entry.errors;
            models.push({ ...entry });
        }
        models.sort((a, b) => b.requests - a.requests);
        return {
            startedAt: this.startedAt,
            totalRequests,
            totalErrors,
            models,
        };
    }
    reset() {
        this.startedAt = Date.now();
        this.data.clear();
    }
}
export const metrics = new MetricsCollector();
//# sourceMappingURL=metrics.js.map