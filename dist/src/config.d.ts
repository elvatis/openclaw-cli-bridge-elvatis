/**
 * config.ts
 *
 * Central configuration defaults for the CLI bridge plugin.
 * All magic numbers, timeouts, paths, and constants live here.
 * Import from this module instead of scattering literals across the codebase.
 *
 * Values can be overridden at runtime via openclaw.plugin.json configSchema
 * or via the CliPluginConfig interface in index.ts.
 */
/** Default port for the local OpenAI-compatible proxy server. */
export declare const DEFAULT_PROXY_PORT = 31337;
/** Default API key between OpenClaw vllm provider and the proxy. */
export declare const DEFAULT_PROXY_API_KEY = "cli-bridge";
/** Default base timeout for CLI subprocess responses (ms). Scales dynamically. */
export declare const DEFAULT_PROXY_TIMEOUT_MS = 300000;
/**
 * Maximum effective timeout after dynamic scaling (ms).
 * MUST be lower than the OpenClaw gateway's idleTimeoutSeconds (600s)
 * so the bridge's own fallback fires BEFORE the gateway kills the request.
 * 580s gives a 20s safety margin under the gateway's 600s hard limit.
 */
export declare const MAX_EFFECTIVE_TIMEOUT_MS = 580000;
/** Extra timeout per message beyond 10 in the conversation (ms). */
export declare const TIMEOUT_PER_EXTRA_MSG_MS = 2000;
/** Extra timeout per tool definition in the request (ms). */
export declare const TIMEOUT_PER_TOOL_MS = 7000;
/** SSE keepalive interval — prevents OpenClaw read-timeout during long CLI runs (ms). */
export declare const SSE_KEEPALIVE_INTERVAL_MS = 15000;
/** Default timeout for individual CLI subprocess invocations (ms). */
export declare const DEFAULT_CLI_TIMEOUT_MS = 120000;
/** Grace period between SIGTERM and SIGKILL when a timeout fires (ms). */
export declare const TIMEOUT_GRACE_MS = 5000;
/**
 * Stale output timeout — if a CLI subprocess produces no stdout for this long,
 * assume it's stuck and SIGTERM early. 0 = disabled.
 * Prevents waiting the full timeout when Claude CLI hangs silently.
 */
export declare const STALE_OUTPUT_TIMEOUT_MS = 30000;
/** Max messages to include in the prompt sent to CLI subprocesses. */
export declare const MAX_MESSAGES = 20;
/**
 * Reduced message limit when tools are heavy (> TOOL_HEAVY_THRESHOLD).
 * Fewer history messages = smaller prompt = faster CLI response.
 */
export declare const MAX_MESSAGES_HEAVY_TOOLS = 12;
/** Tool count threshold that triggers reduced message limit. */
export declare const TOOL_HEAVY_THRESHOLD = 10;
/**
 * Tool count threshold that triggers smart routing to a faster model.
 * When Sonnet receives a request with this many tools, route to Haiku instead.
 * Haiku handles tool calls in ~11s vs Sonnet's 80-120s (and Sonnet hangs intermittently).
 */
export declare const TOOL_ROUTING_THRESHOLD = 8;
/**
 * Prompt size threshold (bytes) for escalating Sonnet to Opus.
 * Sonnet hangs ~50% at 30KB+ prompts. Opus handles large contexts reliably.
 */
export declare const OPUS_ESCALATION_THRESHOLD = 30000;
/** Max characters per message content before truncation. */
export declare const MAX_MSG_CHARS = 4000;
/** Auto-cleanup threshold: sessions older than this are killed and removed (ms). */
export declare const SESSION_TTL_MS: number;
/** Interval for the session cleanup sweep (ms). */
export declare const CLEANUP_INTERVAL_MS: number;
/** Grace period between SIGTERM and SIGKILL for session termination (ms). */
export declare const SESSION_KILL_GRACE_MS = 5000;
/** Default TTL for provider sessions before they're considered stale (ms). */
export declare const PROVIDER_SESSION_TTL_MS: number;
/** Sweep interval for stale provider sessions (ms). */
export declare const PROVIDER_SESSION_SWEEP_MS: number;
/**
 * Default per-model timeout overrides.
 * These are applied as the base timeout before dynamic scaling.
 * Override via `modelTimeouts` in plugin config.
 *
 * Strategy:
 *   - Heavy/agentic models (Opus, GPT-5.4): 7 min — need time for tool use + large sessions
 *   - Standard interactive (Sonnet, Pro, GPT-5.3): 7 min — prevents premature fallback to Haiku
 *   - Fast/lightweight (Haiku, Flash, Mini): 120s
 */
export declare const DEFAULT_MODEL_TIMEOUTS: Record<string, number>;
/**
 * Default fallback chains: when a primary model fails (timeout, stale, error),
 * try each fallback in order. Cross-provider chains ensure we use all available
 * models instead of just falling back within one provider.
 *
 * Strategy: same-provider fast model first, then cross-provider alternatives.
 */
export declare const DEFAULT_MODEL_FALLBACKS: Record<string, string[]>;
/** Base directory for all CLI bridge state files. */
export declare const OPENCLAW_DIR: string;
/** Workspace directory containing all projects. */
export declare const WORKSPACE_DIR: string;
/** State file — persists the model active before the last /cli-* switch. */
export declare const STATE_FILE: string;
/** Pending switch file — stores a staged model switch not yet applied. */
export declare const PENDING_FILE: string;
/** Provider session registry file. */
export declare const PROVIDER_SESSIONS_FILE: string;
/** Persistent metrics file — survives gateway restarts. */
export declare const METRICS_FILE: string;
/** Temporary directory for multimodal media files. */
export declare const MEDIA_TMP_DIR: string;
/** Browser profile directories. */
export declare const PROFILE_DIRS: {
    readonly grok: string;
    readonly gemini: string;
    readonly claude: string;
    readonly chatgpt: string;
};
/** Navigation timeout for Playwright page.goto (ms). */
export declare const BROWSER_NAV_TIMEOUT_MS = 15000;
/** Delay after page load before interacting (ms). */
export declare const BROWSER_PAGE_LOAD_DELAY_MS = 2000;
/** Delay after typing into input fields (ms). */
export declare const BROWSER_INPUT_DELAY_MS = 300;
/** Default timeout for browser-based completions (ms). */
export declare const BROWSER_COMPLETION_TIMEOUT_MS = 120000;
/** Consecutive stable reads to confirm a streaming response is done. */
export declare const BROWSER_STABLE_CHECKS = 3;
/** Interval between stability checks (ms). */
export declare const BROWSER_STABLE_INTERVAL_MS = 500;
/** Gemini uses a longer stability interval due to slower streaming. */
export declare const GEMINI_STABLE_INTERVAL_MS = 600;
/** Refresh OAuth token this many ms before expiry. */
export declare const CLAUDE_REFRESH_BEFORE_EXPIRY_MS: number;
/** Sync window for token refresh (ms). */
export declare const CLAUDE_REFRESH_SYNC_WINDOW_MS: number;
/** Max wait for a single token refresh attempt (ms). */
export declare const CLAUDE_REFRESH_TIMEOUT_MS = 30000;
/** Polling interval for proactive token refresh (ms). */
export declare const CLAUDE_REFRESH_POLL_INTERVAL_MS: number;
/** Prefix for temporary workdir directories. */
export declare const WORKDIR_PREFIX = "cli-bridge-";
/** Max age for orphaned workdirs before they are swept (ms). */
export declare const WORKDIR_ORPHAN_MAX_AGE_MS: number;
/** Default URL for the local BitNet llama-server. */
export declare const DEFAULT_BITNET_SERVER_URL = "http://127.0.0.1:8082";
/** Max messages to send to BitNet (4096 token context limit). */
export declare const BITNET_MAX_MESSAGES = 6;
/** Minimal system prompt for BitNet to conserve tokens. */
export declare const BITNET_SYSTEM_PROMPT = "You are Akido, a concise AI assistant. Answer briefly and directly. Current user: Emre. Timezone: Europe/Berlin.";
export declare const CLI_TEST_DEFAULT_MODEL = "cli-gemini/gemini-2.5-flash";
//# sourceMappingURL=config.d.ts.map