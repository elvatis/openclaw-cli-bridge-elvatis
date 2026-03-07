/**
 * cli-runner.ts
 *
 * Spawns CLI subprocesses (gemini, claude) and captures their output.
 * Input: OpenAI-format messages → formatted prompt string → CLI stdin.
 *
 * IMPORTANT: Prompt is always passed via stdin (not as a CLI argument) to
 * avoid E2BIG ("Argument list too long") when conversation history is large.
 */

import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

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
 * message to avoid E2BIG when conversation history is very large.
 */
export function formatPrompt(messages: ChatMessage[]): string {
  if (messages.length === 0) return "";

  // Keep system message (if any) + last N non-system messages
  const system = messages.find((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  const recent = nonSystem.slice(-MAX_MESSAGES);
  const truncated = system ? [system, ...recent] : recent;

  // If single user message with short content, send directly — no wrapping.
  if (truncated.length === 1 && truncated[0].role === "user") {
    return truncateContent(truncated[0].content);
  }

  return truncated
    .map((m) => {
      const content = truncateContent(m.content);
      switch (m.role) {
        case "system":
          return `[System]\n${content}`;
        case "assistant":
          return `[Assistant]\n${content}`;
        case "user":
        default:
          return `[User]\n${content}`;
      }
    })
    .join("\n\n");
}

function truncateContent(s: string): string {
  if (s.length <= MAX_MSG_CHARS) return s;
  return s.slice(0, MAX_MSG_CHARS) + `\n...[truncated ${s.length - MAX_MSG_CHARS} chars]`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core subprocess runner
// ──────────────────────────────────────────────────────────────────────────────

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Build a minimal, safe environment for spawning CLI subprocesses.
 *
 * WHY: The OpenClaw gateway may inject large values into process.env at
 * runtime (system prompts, session data, OPENCLAW_* vars, etc.). Spreading
 * the full process.env into spawn() can push the combined argv+envp over
 * ARG_MAX (~2 MB on Linux), causing "spawn E2BIG". Using only the vars that
 * the CLI tools actually need keeps us well under the limit regardless of
 * what the parent process environment contains.
 */
function buildMinimalEnv(): Record<string, string> {
  const pick = (key: string): string | undefined => process.env[key];

  const env: Record<string, string> = {
    NO_COLOR: "1",
    TERM: "dumb",
  };

  // Essential path/identity vars — always include when present.
  for (const key of ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP"]) {
    const v = pick(key);
    if (v) env[key] = v;
  }

  // Allow google-auth / claude auth paths to be inherited.
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

/**
 * Spawn a CLI and deliver the prompt via stdin (not as an argument).
 * This avoids E2BIG ("Argument list too long") for large conversation histories
 * or when the parent process has a large runtime environment.
 */
export function runCli(
  cmd: string,
  args: string[],
  prompt: string,
  timeoutMs = 120_000
): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      timeout: timeoutMs,
      env: buildMinimalEnv(),
    });

    let stdout = "";
    let stderr = "";

    // Write prompt to stdin then close — prevents the CLI from waiting for more input.
    proc.stdin.write(prompt, "utf8", () => {
      proc.stdin.end();
    });

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

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
 * Run: gemini -m <modelId> -p "<prompt>"
 * Strips the model prefix ("cli-gemini/gemini-2.5-pro" → "gemini-2.5-pro").
 */
export async function runGemini(
  prompt: string,
  modelId: string,
  timeoutMs: number
): Promise<string> {
  const model = stripPrefix(modelId);
  // Gemini CLI doesn't support stdin — write prompt to a temp file and read it via @file syntax
  const tmpFile = join(tmpdir(), `cli-bridge-${randomBytes(6).toString("hex")}.txt`);
  writeFileSync(tmpFile, prompt, "utf8");
  try {
    // Use @<file> to pass prompt from file (avoids ARG_MAX limit)
    const args = ["-m", model, "-p", `@${tmpFile}`];
    const result = await runCli("gemini", args, "", timeoutMs);

    if (result.exitCode !== 0 && result.stdout.length === 0) {
      throw new Error(
        `gemini exited ${result.exitCode}: ${result.stderr || "(no output)"}`
      );
    }

    return result.stdout || result.stderr;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Claude Code CLI
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run: claude -p --output-format text -m <modelId> "<prompt>"
 * Strips the model prefix ("cli-claude/claude-opus-4-6" → "claude-opus-4-6").
 */
export async function runClaude(
  prompt: string,
  modelId: string,
  timeoutMs: number
): Promise<string> {
  const model = stripPrefix(modelId);
  // No prompt argument — deliver via stdin to avoid E2BIG
  const args = [
    "-p",
    "--output-format",
    "text",
    "--permission-mode",
    "plan",
    "--tools",
    "",
    "--model",
    model,
  ];
  const result = await runCli("claude", args, prompt, timeoutMs);

  if (result.exitCode !== 0 && result.stdout.length === 0) {
    throw new Error(
      `claude exited ${result.exitCode}: ${result.stderr || "(no output)"}`
    );
  }

  return result.stdout;
}

// ──────────────────────────────────────────────────────────────────────────────
// Router
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Route a chat completion request to the right CLI based on the model name.
 * Model naming convention:
 *   cli-gemini/<id>  → gemini CLI
 *   cli-claude/<id>  → claude CLI
 */
export async function routeToCliRunner(
  model: string,
  messages: ChatMessage[],
  timeoutMs: number
): Promise<string> {
  const prompt = formatPrompt(messages);

  if (model.startsWith("cli-gemini/")) {
    return runGemini(prompt, model, timeoutMs);
  }

  if (model.startsWith("cli-claude/")) {
    return runClaude(prompt, model, timeoutMs);
  }

  throw new Error(
    `Unknown CLI bridge model: "${model}". ` +
      `Use "cli-gemini/<model>" or "cli-claude/<model>".`
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Strip the "cli-gemini/" or "cli-claude/" prefix from a model ID. */
function stripPrefix(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}
