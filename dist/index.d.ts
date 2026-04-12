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
 *   /cli-sonnet       → vllm/cli-claude/claude-sonnet-4-6      (Claude Code CLI proxy)
 *   /cli-opus         → vllm/cli-claude/claude-opus-4-6        (Claude Code CLI proxy)
 *   /cli-haiku        → vllm/cli-claude/claude-haiku-4-5       (Claude Code CLI proxy)
 *   /cli-gemini       → vllm/cli-gemini/gemini-2.5-pro         (Gemini CLI proxy)
 *   /cli-gemini-flash → vllm/cli-gemini/gemini-2.5-flash       (Gemini CLI proxy)
 *   /cli-gemini3      → vllm/cli-gemini/gemini-3-pro-preview   (Gemini CLI proxy)
 *   /cli-codex        → openai-codex/gpt-5.3-codex             (Codex CLI OAuth, direct API)
 *   /cli-codex54      → openai-codex/gpt-5.4                   (Codex CLI OAuth, direct API)
 *   /cli-opencode     → vllm/opencode/default                  (OpenCode CLI proxy)
 *   /cli-pi           → vllm/pi/default                        (Pi CLI proxy)
 *   /cli-back         → restore model that was active before last /cli-* switch
 *   /cli-test [model] → one-shot proxy health check (does NOT switch global model)
 *   /cli-list         → list all registered CLI bridge models with commands
 *
 * Provider / model naming:
 *   vllm/cli-gemini/gemini-2.5-pro  → `gemini -m gemini-2.5-pro @<tmpfile>`
 *   vllm/cli-claude/claude-opus-4-6 → `claude -p -m claude-opus-4-6 --output-format text` (stdin)
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