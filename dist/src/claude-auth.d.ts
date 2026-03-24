/**
 * claude-auth.ts
 *
 * Proactive OAuth token management for the Claude Code CLI.
 *
 * Problem: Claude Code stores its claude.ai OAuth token in
 * ~/.claude/.credentials.json. The access token expires every ~8-12 hours.
 * When the gateway runs as a systemd service without a browser, the normal
 * interactive refresh flow never triggers — the token silently expires and
 * every CLI call returns 401.
 *
 * Solution: This module reads the credentials file, tracks expiry, and
 * proactively refreshes the token by running `claude -p "ping"` before it
 * expires. It also retries once on 401 errors.
 *
 * Design:
 *   - scheduleTokenRefresh()  — call once at proxy startup; sets an internal
 *                               timer that fires 30 min before expiry
 *   - ensureClaudeToken()     — call before every claude CLI invocation;
 *                               triggers an immediate refresh if token is
 *                               expired or expires within the next 5 minutes
 *   - refreshClaudeToken()    — runs `claude -p "ping"` to force token refresh
 *                               (Claude Code auto-refreshes on any API call)
 */
/** Configure the logger (call once at startup). */
export declare function setAuthLogger(logger: (msg: string) => void): void;
/**
 * Stop the background token refresh interval.
 * Call in plugin deactivate / proxy server close to avoid timer leaks.
 */
export declare function stopTokenRefresh(): void;
/**
 * Read the current token expiry from ~/.claude/.credentials.json.
 * Returns null if the file doesn't exist or has no OAuth credentials
 * (e.g. API-key users — they don't need token management).
 */
export declare function readTokenExpiry(): Promise<number | null>;
/**
 * Schedule a proactive token refresh 30 minutes before expiry.
 * Call once at proxy startup. Safe to call multiple times (restarts the interval).
 *
 * Uses a 10-minute polling interval instead of a single long setTimeout so that
 * the scheduler survives system sleep/resume without missing its window.
 */
export declare function scheduleTokenRefresh(): Promise<void>;
/**
 * Ensure the Claude OAuth token is valid before making a CLI call.
 * If the token expires within REFRESH_SYNC_WINDOW_MS, refreshes synchronously.
 * No-op for API-key users (no credentials file).
 */
export declare function ensureClaudeToken(): Promise<void>;
/**
 * Run `claude -p "ping"` to force Claude Code to refresh its OAuth token.
 * Claude Code automatically refreshes the access token on any API call.
 * Deduplicates concurrent refresh attempts.
 */
export declare function refreshClaudeToken(): Promise<void>;
//# sourceMappingURL=claude-auth.d.ts.map