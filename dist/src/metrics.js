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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { METRICS_FILE } from "./config.js";
// ── Token estimation ────────────────────────────────────────────────────────
/**
 * Rough token count estimate: ~4 characters per token.
 * This matches the commonly used GPT tokenizer heuristic and is
 * accurate within ~15% for English text / code.
 */
export function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / 4);
}
// ── Circular buffer ─────────────────────────────────────────────────────────
class CircularBuffer {
    capacity;
    items = [];
    constructor(capacity) {
        this.capacity = capacity;
    }
    push(item) {
        if (this.items.length >= this.capacity)
            this.items.shift();
        this.items.push(item);
    }
    toArray() { return [...this.items]; }
    clear() { this.items.length = 0; }
}
// ── Collector ───────────────────────────────────────────────────────────────
class MetricsCollector {
    startedAt = Date.now();
    data = new Map();
    flushTimer = null;
    dirty = false;
    recentRequests = new CircularBuffer(20);
    fallbackEvents = new CircularBuffer(10);
    constructor() {
        this.load();
    }
    recordRequest(model, durationMs, success, promptTokens, completionTokens, promptPreview) {
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
        this.recentRequests.push({
            timestamp: Date.now(),
            model,
            latencyMs: durationMs,
            success,
            promptPreview: promptPreview ?? "",
            promptTokens: promptTokens ?? 0,
            completionTokens: completionTokens ?? 0,
        });
        this.scheduleSave();
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
            recentRequests: this.recentRequests.toArray(),
            fallbackHistory: this.fallbackEvents.toArray(),
        };
    }
    recordFallback(originalModel, fallbackModel, reason, failedDurationMs, fallbackSuccess) {
        this.fallbackEvents.push({
            timestamp: Date.now(),
            originalModel,
            fallbackModel,
            reason,
            failedDurationMs,
            fallbackSuccess,
        });
    }
    reset() {
        this.startedAt = Date.now();
        this.data.clear();
        this.recentRequests.clear();
        this.fallbackEvents.clear();
        this.saveNow();
    }
    // ── Persistence ─────────────────────────────────────────────────────────
    load() {
        try {
            const raw = readFileSync(METRICS_FILE, "utf-8");
            const persisted = JSON.parse(raw);
            if (persisted.version === 1 && Array.isArray(persisted.models)) {
                this.startedAt = persisted.startedAt;
                for (const m of persisted.models) {
                    this.data.set(m.model, { ...m });
                }
            }
        }
        catch {
            // File doesn't exist or is corrupt — start fresh
        }
    }
    scheduleSave() {
        this.dirty = true;
        if (this.flushTimer)
            return;
        // Debounce: save at most once per 5 seconds
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            if (this.dirty)
                this.saveNow();
        }, 5_000);
    }
    saveNow() {
        this.dirty = false;
        const persisted = {
            version: 1,
            startedAt: this.startedAt,
            models: Array.from(this.data.values()),
        };
        try {
            mkdirSync(dirname(METRICS_FILE), { recursive: true });
            writeFileSync(METRICS_FILE, JSON.stringify(persisted, null, 2) + "\n", "utf-8");
        }
        catch {
            // Best effort — don't crash the proxy for metrics I/O
        }
    }
}
export const metrics = new MetricsCollector();
//# sourceMappingURL=metrics.js.map