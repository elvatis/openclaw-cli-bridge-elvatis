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
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
export const DEFAULT_CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");
export const DEFAULT_MODEL = "openai-codex/gpt-5.2";
/**
 * Read and validate credentials from the Codex auth file.
 * Throws if the file is missing, unreadable, or contains no usable token.
 */
export async function readCodexCredentials(authPath = DEFAULT_CODEX_AUTH_PATH) {
    let raw;
    try {
        raw = await readFile(authPath, "utf8");
    }
    catch (err) {
        throw new Error(`Cannot read Codex auth file at ${authPath}. ` +
            `Run 'codex login' first, then retry. (${err.message})`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`Codex auth file at ${authPath} is not valid JSON.`);
    }
    // Prefer OAuth access_token; fall back to API key stored by --with-api-key login
    const accessToken = parsed.tokens?.access_token ?? parsed.OPENAI_API_KEY ?? null;
    if (!accessToken) {
        throw new Error(`No access token found in ${authPath}. ` +
            `Run 'codex login' and sign in with your ChatGPT account, then retry.`);
    }
    // Estimate expiry: last_refresh + 3600s (typical ChatGPT token lifetime)
    let expiresAt = null;
    if (parsed.last_refresh) {
        const refreshedAt = Date.parse(parsed.last_refresh);
        if (!isNaN(refreshedAt)) {
            expiresAt = refreshedAt + 3600 * 1000;
        }
    }
    return {
        accessToken,
        refreshToken: parsed.tokens?.refresh_token ?? null,
        expiresAt,
        email: null, // Codex auth.json doesn't expose email directly
    };
}
//# sourceMappingURL=codex-auth.js.map