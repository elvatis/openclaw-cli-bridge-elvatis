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
export type ProviderAlias = "claude" | "gemini" | "grok" | "codex" | "opencode" | "pi" | "bitnet" | string;
export type SessionState = "active" | "idle" | "expired";
export interface ProviderSession {
    /** Unique session ID, e.g. "claude:session-a1b2c3d4". */
    id: string;
    /** Provider type. */
    provider: ProviderAlias;
    /** Full model alias, e.g. "cli-claude/claude-sonnet-4-6". */
    modelAlias: string;
    /** Unix timestamp when the session was created. */
    createdAt: number;
    /** Unix timestamp of the last activity (run start, touch). */
    updatedAt: number;
    /** Current session state. */
    state: SessionState;
    /** Total runs executed in this session. */
    runCount: number;
    /** Number of runs that timed out. */
    timeoutCount: number;
    /** Provider-specific state (profile path, remote session ID, etc.). */
    meta: Record<string, unknown>;
}
export interface CreateSessionOptions {
    /** Provider-specific metadata. */
    meta?: Record<string, unknown>;
}
export declare class ProviderSessionRegistry {
    private sessions;
    private sweepTimer;
    private dirty;
    constructor();
    /**
     * Create a new provider session.
     * Returns the session with a unique ID.
     */
    createSession(provider: ProviderAlias, modelAlias: string, opts?: CreateSessionOptions): ProviderSession;
    /** Get a session by ID. Returns undefined if not found. */
    getSession(id: string): ProviderSession | undefined;
    /**
     * Find an existing active session for the given provider+model.
     * Returns the most recently updated match, or undefined.
     */
    findSession(provider: ProviderAlias, modelAlias: string): ProviderSession | undefined;
    /**
     * Get or create a session for the given provider+model.
     * Reuses existing active session if available.
     */
    ensureSession(provider: ProviderAlias, modelAlias: string, opts?: CreateSessionOptions): ProviderSession;
    /**
     * Update the session's last-activity timestamp and set state to active.
     * Call this at the start of every run.
     */
    touchSession(id: string): boolean;
    /** Record that a run completed in this session. */
    recordRun(id: string, timedOut: boolean): void;
    /** Delete a session by ID. */
    deleteSession(id: string): boolean;
    /** List all sessions. */
    listSessions(): ProviderSession[];
    /** Get summary stats for logging/status. */
    stats(): {
        total: number;
        active: number;
        idle: number;
        expired: number;
    };
    /** Sweep stale sessions (older than PROVIDER_SESSION_TTL_MS without activity). */
    sweep(): void;
    /** Stop the sweep timer (for graceful shutdown). */
    stop(): void;
    /** Load sessions from disk. */
    private load;
    /** Flush dirty sessions to disk. */
    private flush;
}
/** Shared singleton instance. */
export declare const providerSessions: ProviderSessionRegistry;
//# sourceMappingURL=provider-sessions.d.ts.map