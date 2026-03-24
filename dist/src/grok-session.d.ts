/**
 * grok-session.ts
 *
 * Manages a persistent grok.com browser session using Playwright.
 *
 * Auth flow:
 *  1. First run: open Chromium, navigate to grok.com → user logs in manually via X.com OAuth
 *  2. On success: save cookies + localStorage to SESSION_PATH
 *  3. Subsequent runs: restore session from file, verify still valid
 *  4. If session expired: repeat step 1
 *
 * The saved session file is stored at ~/.openclaw/grok-session.json
 */
import type { Browser, BrowserContext, Cookie } from "playwright";
export declare const DEFAULT_SESSION_PATH: string;
export declare const GROK_HOME = "https://grok.com";
export declare const GROK_API_BASE = "https://grok.com/api";
/** Stored session data */
export interface GrokSession {
    cookies: Cookie[];
    savedAt: number;
    userAgent?: string;
}
/** Result of a session check */
export interface SessionCheckResult {
    valid: boolean;
    reason?: string;
}
export declare function loadSession(sessionPath: string): GrokSession | null;
export declare function saveSession(sessionPath: string, session: GrokSession): void;
export declare function deleteSession(sessionPath: string): void;
export declare function isSessionExpiredByAge(session: GrokSession): boolean;
/**
 * Verify the session is still valid by making a lightweight API call.
 * Returns {valid: true} if the session works, {valid: false, reason} otherwise.
 */
export declare function verifySession(context: BrowserContext, log: (msg: string) => void): Promise<SessionCheckResult>;
export declare function runInteractiveLogin(browser: Browser, sessionPath: string, log: (msg: string) => void, timeoutMs?: number): Promise<GrokSession>;
export declare function createContextFromSession(browser: Browser, session: GrokSession): Promise<BrowserContext>;
//# sourceMappingURL=grok-session.d.ts.map