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
  models: ModelMetrics[]; // sorted by requests desc
}

class MetricsCollector {
  private startedAt = Date.now();
  private data = new Map<string, ModelMetrics>();

  recordRequest(
    model: string,
    durationMs: number,
    success: boolean,
    promptTokens?: number,
    completionTokens?: number,
  ): void {
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
    if (!success) entry.errors++;
    entry.totalLatencyMs += durationMs;
    if (promptTokens) entry.promptTokens += promptTokens;
    if (completionTokens) entry.completionTokens += completionTokens;
    entry.lastRequestAt = Date.now();
  }

  getMetrics(): MetricsSnapshot {
    let totalRequests = 0;
    let totalErrors = 0;
    const models: ModelMetrics[] = [];

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

  reset(): void {
    this.startedAt = Date.now();
    this.data.clear();
  }
}

export const metrics = new MetricsCollector();
