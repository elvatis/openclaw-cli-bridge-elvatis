/**
 * expiry-helpers.ts
 *
 * Pure functions for formatting cookie expiry info.
 * Extracted from index.ts for testability.
 */
/** Grok cookie expiry — uses Math.ceil for daysLeft */
export function formatExpiryInfo(info) {
    const daysLeft = Math.ceil((info.expiresAt - Date.now()) / 86_400_000);
    const dateStr = new Date(info.expiresAt).toISOString().split("T")[0];
    if (daysLeft <= 0)
        return `⚠️ EXPIRED (was ${dateStr})`;
    if (daysLeft <= 7)
        return `🚨 expires in ${daysLeft}d (${dateStr}) — run /grok-login NOW`;
    if (daysLeft <= 14)
        return `⚠️ expires in ${daysLeft}d (${dateStr}) — run /grok-login soon`;
    return `✅ valid for ${daysLeft} more days (expires ${dateStr})`;
}
/** Gemini cookie expiry — uses Math.floor for daysLeft */
export function formatGeminiExpiry(info) {
    const daysLeft = Math.floor((info.expiresAt - Date.now()) / 86_400_000);
    const dateStr = new Date(info.expiresAt).toISOString().substring(0, 10);
    if (daysLeft < 0)
        return `⚠️ EXPIRED (${dateStr}) — run /gemini-login`;
    if (daysLeft <= 7)
        return `🚨 expires in ${daysLeft}d (${dateStr}) — run /gemini-login NOW`;
    if (daysLeft <= 14)
        return `⚠️ expires in ${daysLeft}d (${dateStr}) — run /gemini-login soon`;
    return `✅ valid for ${daysLeft} more days (expires ${dateStr})`;
}
/** Claude cookie expiry — uses Math.floor for daysLeft */
export function formatClaudeExpiry(info) {
    const daysLeft = Math.floor((info.expiresAt - Date.now()) / 86_400_000);
    const dateStr = new Date(info.expiresAt).toISOString().substring(0, 10);
    if (daysLeft < 0)
        return `⚠️ EXPIRED (${dateStr}) — run /claude-login`;
    if (daysLeft <= 7)
        return `🚨 expires in ${daysLeft}d (${dateStr}) — run /claude-login NOW`;
    if (daysLeft <= 14)
        return `⚠️ expires in ${daysLeft}d (${dateStr}) — run /claude-login soon`;
    return `✅ valid for ${daysLeft} more days (expires ${dateStr})`;
}
/** ChatGPT cookie expiry — uses Math.floor for daysLeft */
export function formatChatGPTExpiry(info) {
    const daysLeft = Math.floor((info.expiresAt - Date.now()) / 86_400_000);
    const dateStr = new Date(info.expiresAt).toISOString().substring(0, 10);
    if (daysLeft < 0)
        return `⚠️ EXPIRED (${dateStr}) — run /chatgpt-login`;
    if (daysLeft <= 7)
        return `🚨 expires in ${daysLeft}d (${dateStr}) — run /chatgpt-login NOW`;
    if (daysLeft <= 14)
        return `⚠️ expires in ${daysLeft}d (${dateStr}) — run /chatgpt-login soon`;
    return `✅ valid for ${daysLeft} more days (expires ${dateStr})`;
}
//# sourceMappingURL=expiry-helpers.js.map