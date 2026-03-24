/**
 * codex-auth-import.ts
 *
 * Auto-imports Codex CLI OAuth credentials from ~/.codex/auth.json into
 * OpenClaw's agent auth store (~/.openclaw/agents/main/agent/auth-profiles.json).
 *
 * This solves Issue #2: the provider is registered but actual API calls fail
 * because the auth store doesn't have the credentials. The user shouldn't need
 * to run `openclaw models auth login` manually when Codex CLI is already logged in.
 *
 * Strategy:
 *   1. Read credentials from ~/.codex/auth.json (via codex-auth.ts)
 *   2. Read the existing auth-profiles.json
 *   3. Upsert the "openai-codex:default" profile with fresh tokens
 *   4. Write back atomically
 *
 * This runs on plugin startup and on OAuth refresh.
 */
/**
 * Import Codex CLI credentials into the OpenClaw agent auth store.
 *
 * Returns an object describing the result:
 *   - imported: true if credentials were written
 *   - skipped: true if credentials are already up-to-date
 *   - error: error message if import failed
 */
export declare function importCodexAuth(opts?: {
    codexAuthPath?: string;
    authStorePath?: string;
    log?: (msg: string) => void;
}): Promise<{
    imported: boolean;
    skipped: boolean;
    error?: string;
}>;
//# sourceMappingURL=codex-auth-import.d.ts.map