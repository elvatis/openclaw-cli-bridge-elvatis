/**
 * openclaw-cli-bridge-elvatis — index.ts
 *
 * Phase 1 (auth bridge): registers openai-codex provider using tokens from
 *   ~/.codex/auth.json (Codex CLI is already logged in — no re-login needed).
 *
 * Phase 2 (request bridge): starts a local OpenAI-compatible HTTP proxy server
 *   and configures OpenClaw's vllm provider to route through it. Model calls
 *   are routed to CLI tools or browser-session providers.
 *
 * Phase 3 (slash commands): registers /cli-* commands for instant model switching.
 *   /cli-fable5       → vllm/cli-claude/claude-fable-5         (Claude Code CLI proxy, 1M ctx, flagship)
 *   /cli-sonnet5      → vllm/cli-claude/claude-sonnet-5        (Claude Code CLI proxy, 1M ctx)
 *   /cli-sonnet       → vllm/cli-claude/claude-sonnet-4-6      (Claude Code CLI proxy)
 *   /cli-opus         → vllm/cli-claude/claude-opus-4-8        (Claude Code CLI proxy, 1M ctx)
 *   /cli-opus47       → vllm/cli-claude/claude-opus-4-7        (Claude Code CLI proxy, 1M ctx)
 *   /cli-opus46       → vllm/cli-claude/claude-opus-4-6        (Claude Code CLI proxy)
 *   /cli-haiku        → vllm/cli-claude/claude-haiku-4-5       (Claude Code CLI proxy)
 *   /cli-gemini       → vllm/cli-gemini/gemini-2.5-pro         (Gemini CLI proxy)
 *   /cli-gemini-flash → vllm/cli-gemini/gemini-2.5-flash       (Gemini CLI proxy)
 *   /cli-gemini3      → vllm/cli-gemini/gemini-3.1-pro-preview (Gemini CLI proxy)
 *   /cli-codex        → openai-codex/gpt-5.3-codex             (Codex CLI OAuth, direct API)
 *   /cli-codex54      → openai-codex/gpt-5.4                   (Codex CLI OAuth, direct API)
 *   /cli-opencode     → vllm/opencode/default                  (OpenCode CLI proxy)
 *   /cli-pi           → vllm/pi/default                        (Pi CLI proxy)
 *   /cli-grok         → vllm/cli-grok/grok-4.5                (Grok CLI proxy)
 *   /cli-back         → restore model that was active before last /cli-* switch
 *   /cli-test [model] → one-shot proxy health check (does NOT switch global model)
 *   /cli-list         → list all registered CLI bridge models with commands
 *
 * Perplexity API models (via REST, uses $PERPLEXITY_API_KEY, no subprocess):
 *   /plex-opus        → vllm/perplexity-api/anthropic/claude-opus-4-8
 *   /plex-sonnet      → vllm/perplexity-api/anthropic/claude-sonnet-4-6
 *   /plex-gpt5        → vllm/perplexity-api/openai/gpt-5
 *   /plex-gpt55       → vllm/perplexity-api/openai/gpt-5.5
 *   /plex-grok4       → vllm/perplexity-api/xai/grok-4.5
 *   /plex-gemini      → vllm/perplexity-api/google/gemini-3.1-pro-preview
 *   /plex-sonar       → vllm/perplexity-api/perplexity/sonar
 *
 * Provider / model naming:
 *   vllm/cli-gemini/gemini-2.5-pro  → `gemini -m gemini-2.5-pro @<tmpfile>`
 *   vllm/cli-claude/claude-opus-4-8 → `claude -p -m claude-opus-4-8 --output-format json` (stdin, real token usage)
 *   vllm/cli-claude/claude-opus-4-7 → `claude -p -m claude-opus-4-7 --output-format json` (stdin, real token usage)
 *   vllm/cli-claude/claude-opus-4-6 → `claude -p -m claude-opus-4-6 --output-format json` (stdin)
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
declare const plugin: {
    id: string;
    name: string;
    version: string;
    description: string;
    register(api: OpenClawPluginApi): void;
};
export default plugin;
//# sourceMappingURL=index.d.ts.map