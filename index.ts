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
 * Provider / model naming:
 *   vllm/cli-gemini/gemini-2.5-pro  → `gemini -m gemini-2.5-pro -p "<prompt>"`
 *   vllm/cli-claude/claude-opus-4-6 → `claude -p -m claude-opus-4-6 --output-format text "<prompt>"`
 */

import type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
} from "openclaw/plugin-sdk";
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
// Plugin definition
// ──────────────────────────────────────────────────────────────────────────────
const plugin = {
  id: "openclaw-cli-bridge-elvatis",
  name: "OpenClaw CLI Bridge",
  version: "0.2.0",
  description:
    "Phase 1: openai-codex auth bridge (reads ~/.codex/auth.json). " +
    "Phase 2: HTTP proxy server routing model calls through gemini/claude CLIs.",

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
  },
};

export default plugin;
