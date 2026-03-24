/**
 * expiry-helpers.ts
 *
 * Pure functions for formatting cookie expiry info.
 * Extracted from index.ts for testability.
 */
export interface ExpiryInfo {
    expiresAt: number;
    loginAt: number;
    cookieName: string;
}
/** Grok cookie expiry — uses Math.ceil for daysLeft */
export declare function formatExpiryInfo(info: ExpiryInfo): string;
/** Gemini cookie expiry — uses Math.floor for daysLeft */
export declare function formatGeminiExpiry(info: ExpiryInfo): string;
/** Claude cookie expiry — uses Math.floor for daysLeft */
export declare function formatClaudeExpiry(info: ExpiryInfo): string;
/** ChatGPT cookie expiry — uses Math.floor for daysLeft */
export declare function formatChatGPTExpiry(info: ExpiryInfo): string;
//# sourceMappingURL=expiry-helpers.d.ts.map