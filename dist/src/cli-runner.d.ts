/**
 * cli-runner.ts
 *
 * Spawns CLI subprocesses (gemini, claude, codex, opencode, pi) and captures their output.
 * Input: OpenAI-format messages → formatted prompt string → CLI stdin (or CLI arg).
 *
 * Prompt delivery:
 *   - Gemini/Claude/Codex receive the prompt via stdin to avoid E2BIG and agentic mode.
 *   - OpenCode receives the prompt as a CLI argument (`opencode run "prompt"`).
 *   - Pi receives the prompt via `-p "prompt"` flag.
 *
 * Workdir isolation:
 *   - Gemini: defaults to tmpdir() (prevents agentic workspace scanning).
 *   - Claude/Codex: defaults to homedir().
 *   - OpenCode/Pi: defaults to homedir().
 *   - All runners accept an explicit `workdir` override via RouteOptions.
 */
import { type ToolDefinition, type CliToolResult } from "./tool-protocol.js";
export interface ContentPart {
    type: string;
    text?: string;
}
export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    /** Plain string or OpenAI-style content array (multimodal / structured). */
    content: string | ContentPart[] | unknown;
    /** Tool calls made by the assistant (OpenAI tool calling protocol). */
    tool_calls?: Array<{
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
    }>;
    /** ID linking a tool result to the assistant's tool_call. */
    tool_call_id?: string;
    /** Function name for tool result messages. */
    name?: string;
}
export type { ToolDefinition, CliToolResult } from "./tool-protocol.js";
/**
 * Convert OpenAI messages to a single flat prompt string.
 * Truncates to MAX_MESSAGES (keeping the most recent) and MAX_MSG_CHARS per
 * message to avoid oversized payloads.
 *
 * Handles tool-calling messages:
 *   - role "tool": formatted as [Tool Result: name]
 *   - role "assistant" with tool_calls: formatted as [Assistant Tool Call: name(args)]
 */
export declare function formatPrompt(messages: ChatMessage[]): string;
export interface MediaFile {
    path: string;
    mimeType: string;
}
/**
 * Extract non-text content parts (images, audio) from messages.
 * Saves base64 data to temp files and replaces media parts with file references.
 * Returns cleaned messages + list of saved media files for CLI -i flags.
 */
export declare function extractMultimodalParts(messages: ChatMessage[]): {
    cleanMessages: ChatMessage[];
    mediaFiles: MediaFile[];
};
/** Schedule deletion of temp media files after a delay. */
export declare function cleanupMediaFiles(files: MediaFile[], delayMs?: number): void;
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
export declare function runCli(cmd: string, args: string[], prompt: string, timeoutMs?: number, opts?: RunCliOptions): Promise<CliRunResult>;
/**
 * Spawn a CLI with the prompt delivered as a CLI argument (not stdin).
 * Used by OpenCode which expects `opencode run "prompt"`.
 */
export declare function runCliWithArg(cmd: string, args: string[], timeoutMs?: number, opts?: RunCliOptions): Promise<CliRunResult>;
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
 * cwd = tmpdir() by default — neutral empty-ish dir, prevents workspace context scanning.
 * Override with explicit workdir.
 */
export declare function runGemini(prompt: string, modelId: string, timeoutMs: number, workdir?: string, opts?: {
    tools?: ToolDefinition[];
}): Promise<string>;
/**
 * Run Claude Code CLI in headless mode with prompt delivered via stdin.
 * Strips the model prefix ("cli-claude/claude-opus-4-6" → "claude-opus-4-6").
 * cwd = homedir() by default. Override with explicit workdir.
 */
export declare function runClaude(prompt: string, modelId: string, timeoutMs: number, workdir?: string, opts?: {
    tools?: ToolDefinition[];
}): Promise<string>;
/**
 * Run Codex CLI in non-interactive mode with prompt via stdin.
 * cwd = homedir() by default. Override with explicit workdir.
 * Auto-initializes git if workdir is not already a git repo.
 */
export declare function runCodex(prompt: string, modelId: string, timeoutMs: number, workdir?: string, opts?: {
    tools?: ToolDefinition[];
    mediaFiles?: MediaFile[];
}): Promise<string>;
/**
 * Run OpenCode CLI. Prompt is passed as a CLI argument: `opencode run "prompt"`.
 * cwd = homedir() by default. Override with explicit workdir.
 */
export declare function runOpenCode(prompt: string, _modelId: string, timeoutMs: number, workdir?: string): Promise<string>;
/**
 * Run Pi CLI in non-interactive mode: `pi -p "prompt"`.
 * cwd = homedir() by default. Override with explicit workdir.
 */
export declare function runPi(prompt: string, _modelId: string, timeoutMs: number, workdir?: string): Promise<string>;
/**
 * Default set of permitted models for the CLI bridge.
 * Matches the models registered as slash commands in index.ts.
 * Expressed as normalized "cli-<type>/<model-id>" strings (vllm/ prefix already stripped).
 *
 * To extend: pass a custom set to routeToCliRunner via the `allowedModels` option.
 * To disable the check: pass `null` for `allowedModels`.
 */
export declare const DEFAULT_ALLOWED_CLI_MODELS: ReadonlySet<string>;
export interface RouteOptions {
    /**
     * Explicit model allowlist (normalized, vllm/ stripped).
     * Pass `null` to disable the allowlist check entirely.
     * Defaults to DEFAULT_ALLOWED_CLI_MODELS.
     */
    allowedModels?: ReadonlySet<string> | null;
    /**
     * Working directory for the CLI subprocess.
     * Overrides the per-runner default (tmpdir for gemini, homedir for others).
     */
    workdir?: string;
    /**
     * OpenAI tool definitions. When present, tool instructions are injected
     * into the prompt and structured tool_call responses are parsed.
     */
    tools?: ToolDefinition[];
    /**
     * Media files extracted from multimodal message content.
     * Passed to CLIs that support native media input (e.g. codex -i).
     */
    mediaFiles?: MediaFile[];
}
/**
 * Route a chat completion to the correct CLI based on model prefix.
 *   cli-gemini/<id>      → gemini CLI
 *   cli-claude/<id>      → claude CLI
 *   openai-codex/<id>    → codex CLI
 *   opencode/<id>        → opencode CLI
 *   pi/<id>              → pi CLI
 *
 * When `tools` are provided, tool instructions are injected into the prompt
 * and the response is parsed for structured tool_calls.
 *
 * Enforces DEFAULT_ALLOWED_CLI_MODELS by default (T-103).
 * Pass `allowedModels: null` to skip the allowlist check.
 */
export declare function routeToCliRunner(model: string, messages: ChatMessage[], timeoutMs: number, opts?: RouteOptions): Promise<CliToolResult>;
//# sourceMappingURL=cli-runner.d.ts.map