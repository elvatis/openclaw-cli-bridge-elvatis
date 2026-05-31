/**
 * codex-auth.ts
 *
 * Reads OAuth credentials stored by the Codex CLI (~/.codex/auth.json)
 * and bridges them into OpenClaw's openai-codex provider registration.
 *
 * The Codex CLI manages its own token lifecycle (auto-refresh). This module
 * reads the stored tokens on demand and re-reads on OAuth refresh to pick up
 * any token the Codex CLI has renewed since last read.
 */
export declare const DEFAULT_CODEX_AUTH_PATH: string;
export declare const DEFAULT_MODEL = "openai-codex/gpt-5.5";
export interface CodexCredentials {
    accessToken: string;
    refreshToken: string | null;
    /** approximate expiry epoch-ms — Codex tokens typically last ~1h */
    expiresAt: number | null;
    email: string | null;
}
/**
 * Read and validate credentials from the Codex auth file.
 * Throws if the file is missing, unreadable, or contains no usable token.
 */
export declare function readCodexCredentials(authPath?: string): Promise<CodexCredentials>;
//# sourceMappingURL=codex-auth.d.ts.map