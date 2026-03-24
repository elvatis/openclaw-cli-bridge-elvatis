/**
 * cookie-expiry-store.ts
 *
 * Consolidated cookie expiry tracking for all web providers.
 * Replaces 4 separate JSON files with a single unified store:
 *   ~/.openclaw/cookie-expiry.json
 *
 * Migration: on first load, imports data from legacy per-provider files
 * and deletes them.
 */
export type ProviderName = "grok" | "gemini" | "claude" | "chatgpt";
export interface ExpiryInfo {
    expiresAt: number;
    loginAt: number;
    cookieName: string;
}
export interface CookieExpiryData {
    grok: ExpiryInfo | null;
    gemini: ExpiryInfo | null;
    claude: ExpiryInfo | null;
    chatgpt: ExpiryInfo | null;
}
/**
 * Migrate legacy per-provider files into the consolidated store.
 * Safe to call multiple times — only imports files that exist.
 */
export declare function migrateLegacyFiles(): {
    migrated: ProviderName[];
};
/** Load the entire expiry store. Returns empty data if file doesn't exist. */
export declare function loadAll(): CookieExpiryData;
/** Save a single provider's expiry info. Merges with existing data. */
export declare function saveProviderExpiry(provider: ProviderName, info: ExpiryInfo): void;
/** Load a single provider's expiry info. */
export declare function loadProviderExpiry(provider: ProviderName): ExpiryInfo | null;
/** Get the store file path (for existsSync checks in startup restore). */
export declare function getStorePath(): string;
//# sourceMappingURL=cookie-expiry-store.d.ts.map