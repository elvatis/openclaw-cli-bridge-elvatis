/**
 * cli-runner.ts
 *
 * Spawns CLI subprocesses (gemini, claude) and captures their output.
 * Input: OpenAI-format messages → formatted prompt string → CLI stdin.
 *
 * Both Gemini and Claude receive the prompt via stdin to avoid:
 *   - E2BIG (arg list too long) for large conversation histories
 *   - Gemini agentic mode (triggered by @file syntax + workspace cwd)
 *
 * Gemini is always spawned with cwd = tmpdir() so it doesn't scan the
 * workspace and enter agentic mode.
 */

import { spawn } from "node:child_process";
import { tmpdir, homedir } from "node:os";

/** Max messages to include in the prompt sent to the CLI. */
const MAX_MESSAGES = 20;
/** Max characters per message content before truncation. */
const MAX_MSG_CHARS = 4000;

// ──────────────────────────────────────────────────────────────────────────────
// Message formatting
// ──────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Convert OpenAI messages to a single flat prompt string.
 * Truncates to MAX_MESSAGES (keeping the most recent) and MAX_MSG_CHARS per
 * message to avoid oversized payloads.
 */
export function formatPrompt(messages: ChatMessage[]): string {
  if (messages.length === 0) return "";

  // Keep system message (if any) + last N non-system messages
  const system = messages.find((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  const recent = nonSystem.slice(-MAX_MESSAGES);
  const truncated = system ? [system, ...recent] : recent;

  // Single short user message — send bare (no wrapping needed)
  if (truncated.length === 1 && truncated[0].role === "user") {
    return truncateContent(truncated[0].content);
  }

  return truncated
    .map((m) => {
      const content = truncateContent(m.content);
      switch (m.role) {
        case "system":    return `[System]\n${content}`;
        case "assistant": return `[Assistant]\n${content}`;
        case "user":
        default:          return `[User]\n${content}`;
      }
    })
    .join("\n\n");
}

function truncateContent(s: string): string {
  if (s.length <= MAX_MSG_CHARS) return s;
  return s.slice(0, MAX_MSG_CHARS) + `\n...[truncated ${s.length - MAX_MSG_CHARS} chars]`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimal environment for spawned subprocesses
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal, safe environment for spawning CLI subprocesses.
 *
 * WHY: The OpenClaw gateway modifies process.env at runtime (OPENCLAW_* vars,
 * session context, etc.). Spreading the full process.env into spawn() can push
 * argv+envp over ARG_MAX (~2 MB on Linux) → "spawn E2BIG". Only passing what
 * the CLI tools actually need keeps us well under the limit regardless of
 * gateway runtime state.
 */
function buildMinimalEnv(): Record<string, string> {
  const pick = (key: string) => process.env[key];
  const env: Record<string, string> = { NO_COLOR: "1", TERM: "dumb" };

  for (const key of ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP"]) {
    const v = pick(key);
    if (v) env[key] = v;
  }
  for (const key of [
    "GOOGLE_APPLICATION_CREDENTIALS",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "CODEX_API_KEY",
    "OPENAI_API_KEY",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
  ]) {
    const v = pick(key);
    if (v) env[key] = v;
  }

  return env;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core subprocess runner
// ──────────────────────────────────────────────────────────────────────────────

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunCliOptions {
  /**
   * Working directory for the subprocess.
   * Defaults to homedir() — a neutral dir that won't trigger agentic context scanning.
   */
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Spawn a CLI and deliver the prompt via stdin.
 *
 * cwd defaults to homedir() so CLIs that scan the working directory for
 * project context (like Gemini) don't accidentally enter agentic mode.
 */
export function runCli(
  cmd: string,
  args: string[],
  prompt: string,
  timeoutMs = 120_000,
  opts: RunCliOptions = {}
): Promise<CliRunResult> {
  const cwd = opts.cwd ?? homedir();

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      timeout: timeoutMs,
      env: buildMinimalEnv(),
      cwd,
    });

    let stdout = "";
    let stderr = "";

    proc.stdin.write(prompt, "utf8", () => {
      proc.stdin.end();
    });

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0 });
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn '${cmd}': ${err.message}`));
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Gemini CLI
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run Gemini CLI in headless mode with prompt delivered via stdin.
 *
 * WHY stdin (not @file):
 *   The @file syntax (`gemini -p @/tmp/xxx.txt`) triggers Gemini's agentic
 *   mode — it scans the current working directory for project context and
 *   interprets the prompt as a task instruction, not a Q&A. This causes hangs,
 *   wrong answers, and "directory does not exist" errors when run from a
 *   project workspace.
 *
 * Gemini CLI: -p "" triggers headless mode; stdin content is the actual prompt
 * (per Gemini docs: "prompt is appended to input on stdin (if any)").
 *
 * cwd = tmpdir() — neutral empty-ish dir, prevents workspace context scanning.
 */
export async function runGemini(
  prompt: string,
  modelId: string,
  timeoutMs: number
): Promise<string> {
  const model = stripPrefix(modelId);
  // -p "" = headless mode trigger; actual prompt arrives via stdin
  const args = ["-m", model, "-p", ""];
  const result = await runCli("gemini", args, prompt, timeoutMs, { cwd: tmpdir() });

  // Filter out [WARN] lines from stderr (Gemini emits noisy permission warnings)
  const cleanStderr = result.stderr
    .split("\n")
    .filter((l) => !l.startsWith("[WARN]") && !l.startsWith("Loaded cached"))
    .join("\n")
    .trim();

  if (result.exitCode !== 0 && result.stdout.length === 0) {
    throw new Error(`gemini exited ${result.exitCode}: ${cleanStderr || "(no output)"}`);
  }

  return result.stdout || cleanStderr;
}

// ──────────────────────────────────────────────────────────────────────────────
// Claude Code CLI
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run Claude Code CLI in headless mode with prompt delivered via stdin.
 * Strips the model prefix ("cli-claude/claude-opus-4-6" → "claude-opus-4-6").
 */
export async function runClaude(
  prompt: string,
  modelId: string,
  timeoutMs: number
): Promise<string> {
  const model = stripPrefix(modelId);
  const args = [
    "-p",
    "--output-format", "text",
    "--permission-mode", "plan",
    "--tools", "",
    "--model", model,
  ];
  const result = await runCli("claude", args, prompt, timeoutMs);

  if (result.exitCode !== 0 && result.stdout.length === 0) {
    throw new Error(`claude exited ${result.exitCode}: ${result.stderr || "(no output)"}`);
  }

  return result.stdout;
}

// ──────────────────────────────────────────────────────────────────────────────
// Router
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Route a chat completion to the correct CLI based on model prefix.
 *   cli-gemini/<id>  → gemini CLI
 *   cli-claude/<id>  → claude CLI
 */
export async function routeToCliRunner(
  model: string,
  messages: ChatMessage[],
  timeoutMs: number
): Promise<string> {
  const prompt = formatPrompt(messages);

  // Strip "vllm/" prefix if present — OpenClaw sends the full provider path
  // (e.g. "vllm/cli-claude/claude-sonnet-4-6") but the router only needs the
  // "cli-<type>/<model>" portion.
  const normalized = model.startsWith("vllm/") ? model.slice(5) : model;

  if (normalized.startsWith("cli-gemini/")) return runGemini(prompt, normalized, timeoutMs);
  if (normalized.startsWith("cli-claude/")) return runClaude(prompt, normalized, timeoutMs);

  throw new Error(
    `Unknown CLI bridge model: "${model}". Use "vllm/cli-gemini/<model>" or "vllm/cli-claude/<model>".`
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function stripPrefix(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}
