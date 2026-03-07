/**
 * cli-runner.ts
 *
 * Spawns CLI subprocesses (gemini, claude) and captures their output.
 * Input: OpenAI-format messages → formatted prompt string → CLI stdout.
 */

import { spawn } from "node:child_process";

// ──────────────────────────────────────────────────────────────────────────────
// Message formatting
// ──────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Convert OpenAI messages to a single flat prompt string.
 * Both Gemini and Claude CLIs accept a plain text prompt.
 */
export function formatPrompt(messages: ChatMessage[]): string {
  if (messages.length === 0) return "";

  // If it's just a single user message, send it directly — no wrapping.
  if (messages.length === 1 && messages[0].role === "user") {
    return messages[0].content;
  }

  return messages
    .map((m) => {
      switch (m.role) {
        case "system":
          return `[System]\n${m.content}`;
        case "assistant":
          return `[Assistant]\n${m.content}`;
        case "user":
        default:
          return `[User]\n${m.content}`;
      }
    })
    .join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Core subprocess runner
// ──────────────────────────────────────────────────────────────────────────────

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(
  cmd: string,
  args: string[],
  timeoutMs = 120_000
): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      timeout: timeoutMs,
      env: { ...process.env, NO_COLOR: "1" }, // strip ANSI codes from output
    });

    let stdout = "";
    let stderr = "";

    // Important: some CLIs (notably Claude Code) keep waiting for stdin EOF
    // even when prompt is provided as an argument. Close stdin immediately.
    proc.stdin.end();

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
  const args = ["-m", model, "-p", prompt];
  const result = await runCli("gemini", args, timeoutMs);

  if (result.exitCode !== 0 && result.stdout.length === 0) {
    throw new Error(
      `gemini exited ${result.exitCode}: ${result.stderr || "(no output)"}`
    );
  }

  return result.stdout || result.stderr; // gemini sometimes writes to stderr
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
    prompt,
  ];
  const result = await runCli("claude", args, timeoutMs);

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
