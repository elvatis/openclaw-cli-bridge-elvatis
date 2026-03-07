/**
 * config-patcher.ts
 *
 * Patches ~/.openclaw/openclaw.json to add the vllm provider config
 * pointing at our local CLI proxy server.
 *
 * Only patches if the cli-bridge models are not already present.
 * Always backs up + validates before writing.
 */

import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { CLI_MODELS } from "./proxy-server.js";

const CONFIG_PATH = path.join(homedir(), ".openclaw", "openclaw.json");
const BACKUPS_DIR = path.join(homedir(), ".openclaw", "backups");
const CLI_BRIDGE_API_KEY = "cli-bridge";

export interface PatchResult {
  patched: boolean;
  reason: string;
}

/**
 * Ensure the vllm provider entry in openclaw.json includes CLI bridge models.
 * Returns {patched: false} if already up to date.
 */
export function patchOpencllawConfig(port: number): PatchResult {
  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  } catch (err) {
    return { patched: false, reason: `Cannot read config: ${(err as Error).message}` };
  }

  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { patched: false, reason: "Config is not valid JSON — skipping patch." };
  }

  // Check if already patched
  const models = (cfg as any)?.models?.providers?.vllm?.models;
  const alreadyHasBridge =
    Array.isArray(models) &&
    models.some((m: any) => typeof m?.id === "string" && m.id.startsWith("cli-"));

  if (alreadyHasBridge) {
    return { patched: false, reason: "vllm provider already has cli-bridge models." };
  }

  // Backup
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
    const backupPath = path.join(BACKUPS_DIR, `openclaw.json.${ts}.bak`);
    fs.copyFileSync(CONFIG_PATH, backupPath);
  } catch {
    // Non-fatal — proceed without backup
  }

  // Build vllm model list
  const vllmModels = CLI_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
  }));

  // Merge into config
  const cfgAny = cfg as any;
  cfgAny.models = cfgAny.models ?? {};
  cfgAny.models.providers = cfgAny.models.providers ?? {};

  const existingVllm = cfgAny.models.providers.vllm ?? {};
  const existingModels: unknown[] = Array.isArray(existingVllm.models)
    ? existingVllm.models
    : [];

  // Merge: keep non-cli-bridge models, add/replace cli-bridge models
  const mergedModels = [
    ...existingModels.filter(
      (m: any) => typeof m?.id === "string" && !m.id.startsWith("cli-")
    ),
    ...vllmModels,
  ];

  cfgAny.models.providers.vllm = {
    ...existingVllm,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: CLI_BRIDGE_API_KEY,
    api: "openai-completions",
    models: mergedModels,
  };

  // Validate JSON before writing
  let newRaw: string;
  try {
    newRaw = JSON.stringify(cfg, null, 2);
    JSON.parse(newRaw); // validate
  } catch {
    return { patched: false, reason: "Failed to serialize patched config." };
  }

  // Write
  try {
    fs.writeFileSync(CONFIG_PATH, newRaw, "utf-8");
    return { patched: true, reason: `vllm provider configured at http://127.0.0.1:${port}/v1` };
  } catch (err) {
    return { patched: false, reason: `Cannot write config: ${(err as Error).message}` };
  }
}
