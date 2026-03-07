/**
 * openclaw-cli-bridge-elvatis — index.ts
 *
 * Phase 1 (auth bridge): registers openai-codex provider using tokens from
 *   ~/.codex/auth.json (Codex CLI is already logged in — no re-login needed).
 *
 * Phase 2 (request bridge): starts a local OpenAI-compatible HTTP proxy server
 *   and configures OpenClaw's vllm provider to route through it. Model calls
 *   are handled by the Gemini CLI and Claude Code CLI subprocesses.
 *
 * Phase 3 (slash commands): registers /cli-* commands for instant model switching.
 *   /cli-sonnet       → vllm/cli-claude/claude-sonnet-4-6
 *   /cli-opus         → vllm/cli-claude/claude-opus-4-6
 *   /cli-haiku        → vllm/cli-claude/claude-haiku-4-5
 *   /cli-gemini       → vllm/cli-gemini/gemini-2.5-pro
 *   /cli-gemini-flash → vllm/cli-gemini/gemini-2.5-flash
 *   /cli-gemini3      → vllm/cli-gemini/gemini-3-pro
 *
 * Provider / model naming:
 *   vllm/cli-gemini/gemini-2.5-pro  → `gemini -m gemini-2.5-pro -p "<prompt>"`
 *   vllm/cli-claude/claude-opus-4-6 → `claude -p -m claude-opus-4-6 --output-format text "<prompt>"`
 */

import type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
} from "openclaw/plugin-sdk";

// Types derived from the plugin SDK (PluginCommandContext / PluginCommandResult are
// not re-exported from the package, so we infer them from the registerCommand signature).
type RegisterCommandParam = Parameters<OpenClawPluginApi["registerCommand"]>[0];
type PluginCommandContext = Parameters<RegisterCommandParam["handler"]>[0];
type PluginCommandResult = Awaited<ReturnType<RegisterCommandParam["handler"]>>;
import { buildOauthProviderAuthResult } from "openclaw/plugin-sdk";
import {
  DEFAULT_CODEX_AUTH_PATH,
  DEFAULT_MODEL as CODEX_DEFAULT_MODEL,
  readCodexCredentials,
} from "./src/codex-auth.js";
import { startProxyServer } from "./src/proxy-server.js";
import { patchOpencllawConfig } from "./src/config-patcher.js";

// ──────────────────────────────────────────────────────────────────────────────
// Plugin config type
// ──────────────────────────────────────────────────────────────────────────────
interface CliPluginConfig {
  // Phase 1: auth bridge
  codexAuthPath?: string;
  enableCodex?: boolean;
  // Phase 2: request proxy
  enableProxy?: boolean;
  proxyPort?: number;
  proxyApiKey?: string;
  proxyTimeoutMs?: number;
}

const DEFAULT_PROXY_PORT = 31337;
const DEFAULT_PROXY_API_KEY = "cli-bridge";

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3: slash-command model table
// ──────────────────────────────────────────────────────────────────────────────

/** CLI bridge models available via /cli-* slash commands. */
const CLI_MODEL_COMMANDS = [
  {
    name: "cli-sonnet",
    model: "vllm/cli-claude/claude-sonnet-4-6",
    description: "Switch to Claude Sonnet 4.6 (CLI bridge)",
    label: "Claude Sonnet 4.6 (CLI)",
  },
  {
    name: "cli-opus",
    model: "vllm/cli-claude/claude-opus-4-6",
    description: "Switch to Claude Opus 4.6 (CLI bridge)",
    label: "Claude Opus 4.6 (CLI)",
  },
  {
    name: "cli-haiku",
    model: "vllm/cli-claude/claude-haiku-4-5",
    description: "Switch to Claude Haiku 4.5 (CLI bridge)",
    label: "Claude Haiku 4.5 (CLI)",
  },
  {
    name: "cli-gemini",
    model: "vllm/cli-gemini/gemini-2.5-pro",
    description: "Switch to Gemini 2.5 Pro (CLI bridge)",
    label: "Gemini 2.5 Pro (CLI)",
  },
  {
    name: "cli-gemini-flash",
    model: "vllm/cli-gemini/gemini-2.5-flash",
    description: "Switch to Gemini 2.5 Flash (CLI bridge)",
    label: "Gemini 2.5 Flash (CLI)",
  },
  {
    name: "cli-gemini3",
    model: "vllm/cli-gemini/gemini-3-pro",
    description: "Switch to Gemini 3 Pro (CLI bridge)",
    label: "Gemini 3 Pro (CLI)",
  },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Helper: run `openclaw models set <model>` and return result text
// ──────────────────────────────────────────────────────────────────────────────

async function switchModel(
  api: OpenClawPluginApi,
  model: string,
  label: string,
  _ctx: PluginCommandContext
): Promise<PluginCommandResult> {
  try {
    const result = await api.runtime.system.runCommandWithTimeout(
      ["openclaw", "models", "set", model],
      { timeoutMs: 8_000 }
    );

    if (result.code !== 0) {
      const err = (result.stderr || result.stdout || "unknown error").trim();
      api.logger.warn(`[cli-bridge] models set failed (code ${result.code}): ${err}`);
      return { text: `❌ Failed to switch to ${label}: ${err}` };
    }

    api.logger.info(`[cli-bridge] switched model → ${model}`);
    return {
      text: `✅ Switched to ${label}\n\`${model}\``,
    };
  } catch (err) {
    const msg = (err as Error).message;
    api.logger.warn(`[cli-bridge] models set error: ${msg}`);
    return { text: `❌ Error switching model: ${msg}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Plugin definition
// ──────────────────────────────────────────────────────────────────────────────
const plugin = {
  id: "openclaw-cli-bridge-elvatis",
  name: "OpenClaw CLI Bridge",
  version: "0.2.1",
  description:
    "Phase 1: openai-codex auth bridge (reads ~/.codex/auth.json). " +
    "Phase 2: HTTP proxy server routing model calls through gemini/claude CLIs. " +
    "Phase 3: /cli-* slash commands for instant model switching.",

  register(api: OpenClawPluginApi) {
    const cfg = (api.pluginConfig ?? {}) as CliPluginConfig;
    const enableCodex = cfg.enableCodex ?? true;
    const enableProxy = cfg.enableProxy ?? true;
    const port = cfg.proxyPort ?? DEFAULT_PROXY_PORT;
    const apiKey = cfg.proxyApiKey ?? DEFAULT_PROXY_API_KEY;
    const timeoutMs = cfg.proxyTimeoutMs ?? 120_000;
    const codexAuthPath = cfg.codexAuthPath ?? DEFAULT_CODEX_AUTH_PATH;

    // ── Phase 1: openai-codex auth bridge ─────────────────────────────────────
    if (enableCodex) {
      api.registerProvider({
        id: "openai-codex",
        label: "OpenAI Codex (CLI bridge)",
        docsPath: "/providers/openai",
        aliases: ["codex-cli"],

        auth: [
          {
            id: "codex-cli-oauth",
            label: "Codex CLI (existing login)",
            hint: "Reads OAuth tokens from ~/.codex/auth.json — no re-login needed",
            kind: "oauth",

            run: async (ctx: ProviderAuthContext): Promise<ProviderAuthResult> => {
              const spin = ctx.prompter.progress("Reading Codex CLI credentials…");
              try {
                const creds = await readCodexCredentials(codexAuthPath);
                spin.stop("Codex CLI credentials loaded");

                return buildOauthProviderAuthResult({
                  providerId: "openai-codex",
                  defaultModel: CODEX_DEFAULT_MODEL,
                  access: creds.accessToken,
                  refresh: creds.refreshToken,
                  expires: creds.expiresAt,
                  email: creds.email,
                  notes: [
                    `Auth read from: ${codexAuthPath}`,
                    "If calls fail, run 'codex login' to refresh, then re-run auth.",
                  ],
                });
              } catch (err) {
                spin.stop("Failed to read Codex credentials");
                throw err;
              }
            },
          },
        ],

        refreshOAuth: async (cred) => {
          try {
            const fresh = await readCodexCredentials(codexAuthPath);
            return {
              ...cred,
              access: fresh.accessToken,
              refresh: fresh.refreshToken ?? cred.refresh,
              expires: fresh.expiresAt ?? cred.expires,
            };
          } catch {
            return cred;
          }
        },
      });

      api.logger.info("[cli-bridge] openai-codex provider registered (Codex CLI auth bridge)");
    }

    // ── Phase 2: CLI request proxy ─────────────────────────────────────────────
    if (enableProxy) {
      startProxyServer({
        port,
        apiKey,
        timeoutMs,
        log: (msg) => api.logger.info(msg),
        warn: (msg) => api.logger.warn(msg),
      })
        .then(() => {
          api.logger.info(
            `[cli-bridge] proxy ready — vllm/cli-gemini/* and vllm/cli-claude/* available`
          );

          // Auto-patch openclaw.json with vllm provider config (once)
          const result = patchOpencllawConfig(port);
          if (result.patched) {
            api.logger.info(
              `[cli-bridge] openclaw.json patched with vllm provider. ` +
                `Restart gateway to activate cli-gemini/* and cli-claude/* models.`
            );
          } else {
            api.logger.info(`[cli-bridge] config check: ${result.reason}`);
          }
        })
        .catch((err: Error) => {
          api.logger.warn(
            `[cli-bridge] proxy server failed to start on port ${port}: ${err.message}`
          );
        });
    }

    // ── Phase 3: /cli-* slash commands ────────────────────────────────────────
    for (const entry of CLI_MODEL_COMMANDS) {
      // Capture entry in closure (const iteration variable is stable in TS/ESM)
      const { name, model, description, label } = entry;

      api.registerCommand({
        name,
        description,
        requireAuth: true, // only authorized senders
        handler: async (ctx: PluginCommandContext): Promise<PluginCommandResult> => {
          api.logger.info(`[cli-bridge] /${name} triggered by ${ctx.senderId ?? "unknown"} (authorized=${ctx.isAuthorizedSender})`);
          return switchModel(api, model, label, ctx);
        },
      });
    }

    api.logger.info(
      `[cli-bridge] registered ${CLI_MODEL_COMMANDS.length} slash commands: ` +
        CLI_MODEL_COMMANDS.map((c) => `/${c.name}`).join(", ")
    );
  },
};

export default plugin;
