/**
 * provider-sessions.ts
 *
 * Persistent session registry for CLI bridge provider sessions.
 *
 * A "provider session" represents a long-lived context with a CLI provider
 * (Claude, Gemini, Codex, etc.). Sessions survive across individual runs:
 * when a run times out, the session persists so that follow-up runs can
 * resume in the same context.
 *
 * Session vs Run:
 *   - Session: long-lived unit (provider context, profile, remote session ID)
 *   - Run: single request within a session (messages, tools, timeout)
 *
 * Storage: in-memory Map + periodic flush to ~/.openclaw/cli-bridge/sessions.json.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PROVIDER_SESSIONS_FILE, PROVIDER_SESSION_TTL_MS, PROVIDER_SESSION_SWEEP_MS, } from "./config.js";
export class ProviderSessionRegistry {
    sessions = new Map();
    sweepTimer = null;
    dirty = false;
    constructor() {
        this.load();
        this.sweepTimer = setInterval(() => this.sweep(), PROVIDER_SESSION_SWEEP_MS);
        if (this.sweepTimer.unref)
            this.sweepTimer.unref();
    }
    // ── CRUD ─────────────────────────────────────────────────────────────────
    /**
     * Create a new provider session.
     * Returns the session with a unique ID.
     */
    createSession(provider, modelAlias, opts = {}) {
        const now = Date.now();
        const id = `${provider}:session-${randomBytes(6).toString("hex")}`;
        const session = {
            id,
            provider,
            modelAlias,
            createdAt: now,
            updatedAt: now,
            state: "active",
            runCount: 0,
            timeoutCount: 0,
            meta: opts.meta ?? {},
        };
        this.sessions.set(id, session);
        this.dirty = true;
        this.flush();
        return session;
    }
    /** Get a session by ID. Returns undefined if not found. */
    getSession(id) {
        return this.sessions.get(id);
    }
    /**
     * Find an existing active session for the given provider+model.
     * Returns the most recently updated match, or undefined.
     */
    findSession(provider, modelAlias) {
        let best;
        for (const s of this.sessions.values()) {
            if (s.provider !== provider || s.modelAlias !== modelAlias)
                continue;
            if (s.state === "expired")
                continue;
            if (!best || s.updatedAt > best.updatedAt)
                best = s;
        }
        return best;
    }
    /**
     * Get or create a session for the given provider+model.
     * Reuses existing active session if available.
     */
    ensureSession(provider, modelAlias, opts = {}) {
        const existing = this.findSession(provider, modelAlias);
        if (existing) {
            this.touchSession(existing.id);
            return existing;
        }
        return this.createSession(provider, modelAlias, opts);
    }
    /**
     * Update the session's last-activity timestamp and set state to active.
     * Call this at the start of every run.
     */
    touchSession(id) {
        const session = this.sessions.get(id);
        if (!session)
            return false;
        session.updatedAt = Date.now();
        if (session.state === "idle")
            session.state = "active";
        this.dirty = true;
        return true;
    }
    /** Record that a run completed in this session. */
    recordRun(id, timedOut) {
        const session = this.sessions.get(id);
        if (!session)
            return;
        session.runCount++;
        if (timedOut)
            session.timeoutCount++;
        session.updatedAt = Date.now();
        session.state = "idle"; // run finished, session stays alive
        this.dirty = true;
        this.flush();
    }
    /** Delete a session by ID. */
    deleteSession(id) {
        const deleted = this.sessions.delete(id);
        if (deleted) {
            this.dirty = true;
            this.flush();
        }
        return deleted;
    }
    /** List all sessions. */
    listSessions() {
        return [...this.sessions.values()];
    }
    /** Get summary stats for logging/status. */
    stats() {
        let active = 0, idle = 0, expired = 0;
        for (const s of this.sessions.values()) {
            if (s.state === "active")
                active++;
            else if (s.state === "idle")
                idle++;
            else
                expired++;
        }
        return { total: this.sessions.size, active, idle, expired };
    }
    // ── Lifecycle ────────────────────────────────────────────────────────────
    /** Sweep stale sessions (older than PROVIDER_SESSION_TTL_MS without activity). */
    sweep() {
        const now = Date.now();
        let changed = false;
        for (const [id, session] of this.sessions) {
            if (now - session.updatedAt > PROVIDER_SESSION_TTL_MS) {
                session.state = "expired";
                this.sessions.delete(id);
                changed = true;
            }
        }
        if (changed) {
            this.dirty = true;
            this.flush();
        }
    }
    /** Stop the sweep timer (for graceful shutdown). */
    stop() {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        this.flush();
    }
    // ── Persistence ──────────────────────────────────────────────────────────
    /** Load sessions from disk. */
    load() {
        try {
            const raw = readFileSync(PROVIDER_SESSIONS_FILE, "utf-8");
            const store = JSON.parse(raw);
            if (store.version === 1 && Array.isArray(store.sessions)) {
                for (const s of store.sessions) {
                    // Skip expired sessions on load
                    if (Date.now() - s.updatedAt > PROVIDER_SESSION_TTL_MS)
                        continue;
                    this.sessions.set(s.id, s);
                }
            }
        }
        catch {
            // No file yet or corrupt — start fresh
        }
    }
    /** Flush dirty sessions to disk. */
    flush() {
        if (!this.dirty)
            return;
        try {
            mkdirSync(dirname(PROVIDER_SESSIONS_FILE), { recursive: true });
            const store = {
                version: 1,
                sessions: [...this.sessions.values()],
            };
            writeFileSync(PROVIDER_SESSIONS_FILE, JSON.stringify(store, null, 2) + "\n", "utf-8");
            this.dirty = false;
        }
        catch {
            // Non-fatal — sessions are still in memory
        }
    }
}
/** Shared singleton instance. */
export const providerSessions = new ProviderSessionRegistry();
//# sourceMappingURL=provider-sessions.js.map