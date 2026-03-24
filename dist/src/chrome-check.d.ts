/**
 * chrome-check.ts
 *
 * Startup check for system Chrome availability.
 * Playwright's stealth mode uses `channel: "chrome"` which requires a real
 * Chrome/Chromium installation. Without it, browser launches fail silently
 * or Cloudflare flags the bundled Chromium as automation.
 */
export interface ChromeCheckResult {
    available: boolean;
    path: string | null;
    version: string | null;
}
/**
 * Check if a system Chrome installation exists.
 * Returns the path and version if found, or null if missing.
 */
export declare function checkSystemChrome(): ChromeCheckResult;
//# sourceMappingURL=chrome-check.d.ts.map