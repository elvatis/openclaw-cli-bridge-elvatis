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
 *   /cli-sonnet       → vllm/cli-claude/claude-sonnet-4-6      (Claude Code CLI proxy)
 *   /cli-opus         → vllm/cli-claude/claude-opus-4-6        (Claude Code CLI proxy)
 *   /cli-haiku        → vllm/cli-claude/claude-haiku-4-5       (Claude Code CLI proxy)
 *   /cli-gemini       → vllm/cli-gemini/gemini-2.5-pro         (Gemini CLI proxy)
 *   /cli-gemini-flash → vllm/cli-gemini/gemini-2.5-flash       (Gemini CLI proxy)
 *   /cli-gemini3      → vllm/cli-gemini/gemini-3-pro-preview   (Gemini CLI proxy)
 *   /cli-gemini3-flash→ vllm/cli-gemini/gemini-3-flash-preview (Gemini CLI proxy)
 *   /cli-codex        → openai-codex/gpt-5.3-codex             (Codex CLI OAuth, direct API)
 *   /cli-codex-mini   → openai-codex/gpt-5.1-codex-mini        (Codex CLI OAuth, direct API)
 *   /cli-back         → restore model that was active before last /cli-* switch
 *   /cli-test [model] → one-shot proxy health check (does NOT switch global model)
 *   /cli-list         → list all registered CLI bridge models with commands
 *
 * Provider / model naming:
 *   vllm/cli-gemini/gemini-2.5-pro  → `gemini -m gemini-2.5-pro @<tmpfile>`
 *   vllm/cli-claude/claude-opus-4-6 → `claude -p -m claude-opus-4-6 --output-format text` (stdin)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
} from "openclaw/plugin-sdk";

// OpenClawPluginCommandDefinition is defined in the SDK types but not re-exported
// by the package — derive it from the registerCommand signature.
type OpenClawPluginCommandDefinition = Parameters<OpenClawPluginApi["registerCommand"]>[0];
import { buildOauthProviderAuthResult } from "openclaw/plugin-sdk";
import {
  DEFAULT_CODEX_AUTH_PATH,
  DEFAULT_MODEL as CODEX_DEFAULT_MODEL,
  readCodexCredentials,
} from "./src/codex-auth.js";
import { startProxyServer } from "./src/proxy-server.js";
import { patchOpencllawConfig } from "./src/config-patcher.js";

// ──────────────────────────────────────────────────────────────────────────────
// Types derived from SDK (not re-exported by the package)
// ──────────────────────────────────────────────────────────────────────────────
type RegisterCommandParam = Parameters<OpenClawPluginApi["registerCommand"]>[0];
type PluginCommandContext = Parameters<RegisterCommandParam["handler"]>[0];
type PluginCommandResult = Awaited<ReturnType<RegisterCommandParam["handler"]>>;

// ──────────────────────────────────────────────────────────────────────────────
// Plugin config type
// ──────────────────────────────────────────────────────────────────────────────
interface CliPluginConfig {
  codexAuthPath?: string;
  enableCodex?: boolean;
  enableProxy?: boolean;
  proxyPort?: number;
  proxyApiKey?: string;
  proxyTimeoutMs?: number;
}

const DEFAULT_PROXY_PORT = 31337;
const DEFAULT_PROXY_API_KEY = "cli-bridge";

// ──────────────────────────────────────────────────────────────────────────────
// State file — persists the model that was active before the last /cli-* switch
// Located at ~/.openclaw/cli-bridge-state.json (survives gateway restarts)
// ──────────────────────────────────────────────────────────────────────────────
const STATE_FILE = join(homedir(), ".openclaw", "cli-bridge-state.json");

interface CliBridgeState {
  previousModel: string;
}

function readState(): CliBridgeState | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as CliBridgeState;
  } catch {
    return null;
  }
}

function writeState(state: CliBridgeState): void {
  try {
    mkdirSync(join(homedir(), ".openclaw"), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch {
    // non-fatal — /cli-back will just report no previous model
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Read the current primary model from openclaw.json
// ──────────────────────────────────────────────────────────────────────────────
function readCurrentModel(): string | null {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".openclaw", "openclaw.json"), "utf8")
    );
    const m = cfg?.agents?.defaults?.model;
    if (typeof m === "string") return m;
    if (typeof m === "object" && m !== null && typeof m.primary === "string")
      return m.primary;
    return null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3: model command table
// ──────────────────────────────────────────────────────────────────────────────
const CLI_MODEL_COMMANDS = [
  // ── Claude (via local proxy → Claude Code CLI) ──────────────────────────────
  {
    name: "cli-sonnet",
    model: "vllm/cli-claude/claude-sonnet-4-6",
    description: "Switch to Claude Sonnet 4.6 (Claude Code CLI via local proxy)",
    label: "Claude Sonnet 4.6 (CLI)",
  },
  {
    name: "cli-opus",
    model: "vllm/cli-claude/claude-opus-4-6",
    description: "Switch to Claude Opus 4.6 (Claude Code CLI via local proxy)",
    label: "Claude Opus 4.6 (CLI)",
  },
  {
    name: "cli-haiku",
    model: "vllm/cli-claude/claude-haiku-4-5",
    description: "Switch to Claude Haiku 4.5 (Claude Code CLI via local proxy)",
    label: "Claude Haiku 4.5 (CLI)",
  },
  // ── Gemini (via local proxy → Gemini CLI) ───────────────────────────────────
  {
    name: "cli-gemini",
    model: "vllm/cli-gemini/gemini-2.5-pro",
    description: "Switch to Gemini 2.5 Pro (Gemini CLI via local proxy)",
    label: "Gemini 2.5 Pro (CLI)",
  },
  {
    name: "cli-gemini-flash",
    model: "vllm/cli-gemini/gemini-2.5-flash",
    description: "Switch to Gemini 2.5 Flash (Gemini CLI via local proxy)",
    label: "Gemini 2.5 Flash (CLI)",
  },
  {
    name: "cli-gemini3",
    model: "vllm/cli-gemini/gemini-3-pro-preview",
    description: "Switch to Gemini 3 Pro Preview (Gemini CLI via local proxy)",
    label: "Gemini 3 Pro Preview (CLI)",
  },
  {
    name: "cli-gemini3-flash",
    model: "vllm/cli-gemini/gemini-3-flash-preview",
    description: "Switch to Gemini 3 Flash Preview (Gemini CLI via local proxy)",
    label: "Gemini 3 Flash Preview (CLI)",
  },
  // ── Codex (via openai-codex provider — Codex CLI OAuth auth, direct API) ────
  {
    name: "cli-codex",
    model: "openai-codex/gpt-5.3-codex",
    description: "Switch to GPT-5.3 Codex (openai-codex provider, Codex CLI auth)",
    label: "GPT-5.3 Codex",
  },
  {
    name: "cli-codex-spark",
    model: "openai-codex/gpt-5.3-codex-spark",
    description: "Switch to GPT-5.3 Codex Spark (openai-codex provider, Codex CLI auth)",
    label: "GPT-5.3 Codex Spark",
  },
  {
    name: "cli-codex52",
    model: "openai-codex/gpt-5.2-codex",
    description: "Switch to GPT-5.2 Codex (openai-codex provider, Codex CLI auth)",
    label: "GPT-5.2 Codex",
  },
  {
    name: "cli-codex54",
    model: "openai-codex/gpt-5.4",
    description: "Switch to GPT-5.4 (openai-codex provider, Codex CLI auth — may require upgraded scope)",
    label: "GPT-5.4 (Codex)",
  },
  {
    name: "cli-codex-mini",
    model: "openai-codex/gpt-5.1-codex-mini",
    description: "Switch to GPT-5.1 Codex Mini (openai-codex provider, Codex CLI auth)",
    label: "GPT-5.1 Codex Mini",
  },
] as const;

/** Default model used by /cli-test when no arg is given */
const CLI_TEST_DEFAULT_MODEL = "cli-claude/claude-sonnet-4-6";

// ──────────────────────────────────────────────────────────────────────────────
// Helper: switch global model, saving previous for /cli-back
// ──────────────────────────────────────────────────────────────────────────────
async function switchModel(
  api: OpenClawPluginApi,
  model: string,
  label: string,
): Promise<PluginCommandResult> {
  // Save current model BEFORE switching so /cli-back can restore it
  const current = readCurrentModel();
  if (current && current !== model) {
    writeState({ previousModel: current });
    api.logger.info(`[cli-bridge] saved previous model: ${current}`);
  }

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
      text: `✅ Switched to **${label}**\n\`${model}\`\n\nUse \`/cli-back\` to restore previous model.`,
    };
  } catch (err) {
    const msg = (err as Error).message;
    api.logger.warn(`[cli-bridge] models set error: ${msg}`);
    return { text: `❌ Error switching model: ${msg}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: fire a one-shot test request directly at the proxy (no global switch)
// ──────────────────────────────────────────────────────────────────────────────
function proxyTestRequest(
  port: number,
  apiKey: string,
  model: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: CLI bridge OK" }],
      stream: false,
    });

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ message?: { content?: string } }>;
              error?: { message?: string };
            };
            if (parsed.error) {
              resolve(`Proxy error: ${parsed.error.message}`);
            } else {
              resolve(parsed.choices?.[0]?.message?.content?.trim() ?? "(empty response)");
            }
          } catch {
            resolve(`(non-JSON response: ${data.slice(0, 200)})`);
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Proxy test timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Plugin definition
// ──────────────────────────────────────────────────────────────────────────────
const plugin = {
  id: "openclaw-cli-bridge-elvatis",
  name: "OpenClaw CLI Bridge",
  version: "0.2.15",
  description:
    "Phase 1: openai-codex auth bridge. " +
    "Phase 2: HTTP proxy for gemini/claude CLIs. " +
    "Phase 3: /cli-* model switching, /cli-back restore, /cli-test health check.",

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

      api.logger.info("[cli-bridge] openai-codex provider registered");
    }

    // ── Phase 2: CLI request proxy ─────────────────────────────────────────────
    let proxyServer: import("node:http").Server | null = null;

    if (enableProxy) {
      // Probe whether a healthy proxy is already listening on our port.
      // This handles hot-reloads where the previous plugin instance's server.close()
      // may not have completed yet — rather than killing anything (dangerous: fuser -k
      // can kill the gateway process itself during in-process hot-reloads), we just
      // check if the existing server still responds and reuse it if so.
      const probeExisting = (): Promise<boolean> => {
        return new Promise((resolve) => {
          const req = http.request(
            { hostname: "127.0.0.1", port, path: "/v1/models", method: "GET",
              headers: { Authorization: `Bearer ${apiKey}` } },
            (res) => { res.resume(); resolve(res.statusCode === 200); }
          );
          req.setTimeout(800, () => { req.destroy(); resolve(false); });
          req.on("error", () => resolve(false));
          req.end();
        });
      };

      const startProxy = async (): Promise<void> => {
        // If a healthy proxy is already up, reuse it — no need to rebind.
        const alive = await probeExisting();
        if (alive) {
          api.logger.info(`[cli-bridge] proxy already running on :${port} — reusing`);
          return;
        }

        try {
          const server = await startProxyServer({
            port,
            apiKey,
            timeoutMs,
            log: (msg) => api.logger.info(msg),
            warn: (msg) => api.logger.warn(msg),
          });
          proxyServer = server;
          api.logger.info(
            `[cli-bridge] proxy ready on :${port} — vllm/cli-gemini/* and vllm/cli-claude/* available`
          );
          const result = patchOpencllawConfig(port);
          if (result.patched) {
            api.logger.info(
              `[cli-bridge] openclaw.json patched with vllm provider. Restart gateway to activate.`
            );
          }
        } catch (err: unknown) {
          const msg = (err as Error).message ?? String(err);
          if (msg.includes("EADDRINUSE")) {
            // Port is busy but probe didn't respond — wait for the OS to release it
            api.logger.warn(`[cli-bridge] port ${port} busy, waiting 1s for OS release…`);
            await new Promise((r) => setTimeout(r, 1000));
            // One final attempt
            try {
              const server = await startProxyServer({
                port, apiKey, timeoutMs,
                log: (msg) => api.logger.info(msg),
                warn: (msg) => api.logger.warn(msg),
              });
              proxyServer = server;
              api.logger.info(`[cli-bridge] proxy ready on :${port} (retry)`);
            } catch (e2: unknown) {
              api.logger.warn(`[cli-bridge] proxy unavailable after retry: ${(e2 as Error).message}`);
            }
          } else {
            api.logger.warn(`[cli-bridge] proxy failed to start on port ${port}: ${msg}`);
          }
        }
      };

      startProxy().catch(() => {});
    }

    // ── Cleanup: close proxy server on plugin stop (hot-reload / gateway restart) ──
    // Register a named service so OpenClaw can call stop() on plugin teardown.
    api.registerService({
      id: "cli-bridge-proxy",
      start: async () => { /* proxy already started above */ },
      stop: async () => {
        if (proxyServer) {
          // closeAllConnections() forcefully terminates keep-alive connections
          // so that server.close() releases the port immediately rather than
          // waiting for them to drain. Without this, the port stays bound
          // during hot-reloads and the next start() call gets EADDRINUSE.
          if (typeof (proxyServer as any).closeAllConnections === "function") {
            (proxyServer as any).closeAllConnections();
          }
          await new Promise<void>((resolve) => {
            proxyServer!.close((err) => {
              if (err) api.logger.warn(`[cli-bridge] proxy close error: ${err.message}`);
              else api.logger.info(`[cli-bridge] proxy server closed on plugin stop`);
              resolve();
            });
          });
          proxyServer = null;
        }
      },
    });


    // ── Phase 3a: /cli-* model switch commands ─────────────────────────────────
    for (const entry of CLI_MODEL_COMMANDS) {
      const { name, model, description, label } = entry;
      api.registerCommand({
        name,
        description,
        requireAuth: false,
        handler: async (ctx: PluginCommandContext): Promise<PluginCommandResult> => {
          api.logger.info(`[cli-bridge] /${name} by ${ctx.senderId ?? "?"}`);
          return switchModel(api, model, label);
        },
      } satisfies OpenClawPluginCommandDefinition);
    }

    // ── Phase 3b: /cli-back — restore previous model ──────────────────────────
    api.registerCommand({
      name: "cli-back",
      description: "Restore the model that was active before the last /cli-* switch",
      requireAuth: false,
      handler: async (ctx: PluginCommandContext): Promise<PluginCommandResult> => {
        api.logger.info(`[cli-bridge] /cli-back by ${ctx.senderId ?? "?"}`);

        const state = readState();
        if (!state?.previousModel) {
          return { text: "ℹ️ No previous model saved. Use `/cli-sonnet` etc. to switch first." };
        }

        const prev = state.previousModel;

        // Clear the saved state so a second /cli-back doesn't bounce back
        writeState({ previousModel: "" });

        try {
          const result = await api.runtime.system.runCommandWithTimeout(
            ["openclaw", "models", "set", prev],
            { timeoutMs: 8_000 }
          );

          if (result.code !== 0) {
            const err = (result.stderr || result.stdout || "unknown error").trim();
            return { text: `❌ Failed to restore \`${prev}\`: ${err}` };
          }

          api.logger.info(`[cli-bridge] /cli-back restored → ${prev}`);
          return { text: `✅ Restored previous model\n\`${prev}\`` };
        } catch (err) {
          return { text: `❌ Error: ${(err as Error).message}` };
        }
      },
    } satisfies OpenClawPluginCommandDefinition);

    // ── Phase 3c: /cli-test — one-shot proxy ping, no global model switch ──────
    api.registerCommand({
      name: "cli-test",
      description: "Test the CLI bridge proxy without switching your active model. Usage: /cli-test [model]",
      acceptsArgs: true,
      requireAuth: false,
      handler: async (ctx: PluginCommandContext): Promise<PluginCommandResult> => {
        const targetModel = ctx.args?.trim() || CLI_TEST_DEFAULT_MODEL;
        // Accept short names like "cli-sonnet" or full "vllm/cli-claude/claude-sonnet-4-6"
        const model = targetModel.startsWith("vllm/")
          ? targetModel
          : `vllm/${targetModel}`;

        api.logger.info(`[cli-bridge] /cli-test → ${model} by ${ctx.senderId ?? "?"}`);

        if (!enableProxy) {
          return { text: "❌ Proxy is disabled (enableProxy: false in config)." };
        }

        const current = readCurrentModel();
        const testTimeoutMs = Math.min(timeoutMs, 30_000);

        try {
          const start = Date.now();
          const response = await proxyTestRequest(port, apiKey, model, testTimeoutMs);
          const elapsed = Date.now() - start;

          return {
            text:
              `🧪 **CLI Bridge Test**\n` +
              `Model: \`${model}\`\n` +
              `Response: _${response}_\n` +
              `Latency: ${elapsed}ms\n\n` +
              `Active model unchanged: \`${current ?? "unknown"}\``,
          };
        } catch (err) {
          return {
            text:
              `❌ **CLI Bridge Test Failed**\n` +
              `Model: \`${model}\`\n` +
              `Error: ${(err as Error).message}\n\n` +
              `Active model unchanged: \`${current ?? "unknown"}\``,
          };
        }
      },
    } satisfies OpenClawPluginCommandDefinition);

    // ── Phase 3d: /cli-list — formatted model overview ────────────────────────
    api.registerCommand({
      name: "cli-list",
      description: "List all registered CLI bridge models and their commands.",
      requireAuth: false,
      handler: async (): Promise<PluginCommandResult> => {
        const groups: Record<string, { cmd: string; model: string }[]> = {
          "Claude Code CLI": [],
          "Gemini CLI": [],
          "Codex (OAuth)": [],
        };

        for (const c of CLI_MODEL_COMMANDS) {
          const entry = { cmd: `/${c.name}`, model: c.model };
          if (c.model.startsWith("vllm/cli-claude/")) groups["Claude Code CLI"].push(entry);
          else if (c.model.startsWith("vllm/cli-gemini/")) groups["Gemini CLI"].push(entry);
          else groups["Codex (OAuth)"].push(entry);
        }

        const lines: string[] = ["🤖 *CLI Bridge Models*", ""];
        for (const [group, entries] of Object.entries(groups)) {
          if (entries.length === 0) continue;
          lines.push(`*${group}*`);
          for (const { cmd, model } of entries) {
            const modelId = model.replace(/^vllm\/cli-(claude|gemini)\//, "").replace(/^openai-codex\//, "");
            lines.push(`  ${cmd.padEnd(20)} ${modelId}`);
          }
          lines.push("");
        }
        lines.push("*Utility*");
        lines.push("  /cli-back            Restore previous model");
        lines.push("  /cli-test [model]    Health check (no model switch)");
        lines.push("  /cli-list            This overview");
        lines.push("");
        lines.push(`Proxy: \`127.0.0.1:${port}\``);

        return { text: lines.join("\n") };
      },
    } satisfies OpenClawPluginCommandDefinition);

    const allCommands = [
      ...CLI_MODEL_COMMANDS.map((c) => `/${c.name}`),
      "/cli-back",
      "/cli-test",
      "/cli-list",
    ];
    api.logger.info(`[cli-bridge] registered ${allCommands.length} commands: ${allCommands.join(", ")}`);
  },
};

export default plugin;
