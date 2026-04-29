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
import { spawn, execSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { ensureClaudeToken, refreshClaudeToken } from "./claude-auth.js";
import { buildToolPromptBlock, parseToolCallResponse, } from "./tool-protocol.js";
import { MAX_MESSAGES, MAX_MESSAGES_HEAVY_TOOLS, TOOL_HEAVY_THRESHOLD, MAX_MSG_CHARS, DEFAULT_CLI_TIMEOUT_MS, TIMEOUT_GRACE_MS, MEDIA_TMP_DIR, STALE_OUTPUT_TIMEOUT_MS, WORKSPACE_DIR, } from "./config.js";
import { debugLog } from "./debug-log.js";
/**
 * Convert OpenAI messages to a single flat prompt string.
 * Truncates to MAX_MESSAGES (keeping the most recent) and MAX_MSG_CHARS per
 * message to avoid oversized payloads.
 *
 * Handles tool-calling messages:
 *   - role "tool": formatted as [Tool Result: name]
 *   - role "assistant" with tool_calls: formatted as [Assistant Tool Call: name(args)]
 */
export function formatPrompt(messages, toolCount = 0) {
    if (messages.length === 0)
        return "";
    // Reduce history when tool schemas dominate the prompt
    const maxMsgs = toolCount > TOOL_HEAVY_THRESHOLD ? MAX_MESSAGES_HEAVY_TOOLS : MAX_MESSAGES;
    // Keep system message (if any) + first user message (original request) + last N non-system messages
    const system = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");
    const firstUser = nonSystem.find((m) => m.role === "user");
    const recent = nonSystem.slice(-maxMsgs);
    // Pin the first user message so the model never loses the original request
    const pinned = firstUser && !recent.includes(firstUser)
        ? [firstUser, ...recent]
        : recent;
    const truncated = system ? [system, ...pinned] : pinned;
    // Single short user message — send bare (no wrapping needed)
    if (truncated.length === 1 && truncated[0].role === "user") {
        return truncateContent(truncated[0].content);
    }
    return truncated
        .map((m) => {
        // Assistant message with tool_calls (no text content)
        if (m.role === "assistant" && m.tool_calls?.length) {
            const calls = m.tool_calls.map((tc) => `[Assistant Tool Call: ${tc.function.name}(${tc.function.arguments})]\n`).join("");
            const content = m.content ? truncateContent(m.content) : "";
            return content ? `${calls}\n${content}` : calls.trimEnd();
        }
        // Tool result message
        if (m.role === "tool") {
            const name = m.name ?? "unknown";
            const content = truncateContent(m.content);
            return `[Tool Result: ${name}]\n${content}`;
        }
        const content = truncateContent(m.content);
        switch (m.role) {
            case "system": return `[System]\n${content}`;
            case "assistant": return `[Assistant]\n${content}`;
            case "user":
            default: return `[User]\n${content}`;
        }
    })
        .join("\n\n");
}
/**
 * Coerce any message content value to a plain string.
 *
 * Handles:
 *  - string          → as-is
 *  - ContentPart[]   → join text parts + describe non-text parts (multimodal)
 *  - other object    → JSON.stringify (prevents "[object Object]" from reaching the CLI)
 *  - null/undefined  → ""
 */
function contentToString(content) {
    if (typeof content === "string")
        return content;
    if (content === null || content === undefined)
        return "";
    if (Array.isArray(content)) {
        return content
            .map((c) => {
            if (c?.type === "text" && typeof c.text === "string")
                return c.text;
            if (c?.type === "image_url")
                return "[Attached image — see saved media file]";
            if (c?.type === "input_audio")
                return "[Attached audio — see saved media file]";
            return null;
        })
            .filter(Boolean)
            .join("\n");
    }
    if (typeof content === "object")
        return JSON.stringify(content);
    return String(content);
}
function truncateContent(raw) {
    const s = contentToString(raw);
    if (s.length <= MAX_MSG_CHARS)
        return s;
    return s.slice(0, MAX_MSG_CHARS) + `\n...[truncated ${s.length - MAX_MSG_CHARS} chars]`;
}
// MEDIA_TMP_DIR imported from config.ts
/**
 * Extract non-text content parts (images, audio) from messages.
 * Saves base64 data to temp files and replaces media parts with file references.
 * Returns cleaned messages + list of saved media files for CLI -i flags.
 */
export function extractMultimodalParts(messages) {
    const mediaFiles = [];
    const cleanMessages = messages.map((m) => {
        if (!Array.isArray(m.content))
            return m;
        const parts = m.content;
        const newParts = [];
        for (const part of parts) {
            if (part?.type === "image_url") {
                const imageUrl = part.image_url;
                const url = imageUrl?.url ?? "";
                if (url.startsWith("data:")) {
                    // data:image/png;base64,iVBOR...
                    const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
                    if (match) {
                        const ext = match[1].split("/")[1] || "png";
                        const filePath = saveBase64ToTemp(match[2], ext);
                        mediaFiles.push({ path: filePath, mimeType: match[1] });
                        newParts.push({ type: "text", text: `[Attached image: ${filePath}]` });
                        continue;
                    }
                }
                // URL-based image — include URL reference in text
                newParts.push({ type: "text", text: `[Image URL: ${url}]` });
                continue;
            }
            if (part?.type === "input_audio") {
                const audioData = part.input_audio;
                if (audioData?.data) {
                    const ext = audioData.format || "wav";
                    const filePath = saveBase64ToTemp(audioData.data, ext);
                    mediaFiles.push({ path: filePath, mimeType: `audio/${ext}` });
                    newParts.push({ type: "text", text: `[Attached audio: ${filePath}]` });
                    continue;
                }
            }
            // Keep text parts and anything else as-is
            newParts.push(part);
        }
        return { ...m, content: newParts };
    });
    return { cleanMessages, mediaFiles };
}
function saveBase64ToTemp(base64Data, ext) {
    mkdirSync(MEDIA_TMP_DIR, { recursive: true });
    const fileName = `media-${randomBytes(8).toString("hex")}.${ext}`;
    const filePath = join(MEDIA_TMP_DIR, fileName);
    writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    return filePath;
}
/** Schedule deletion of temp media files after a delay. */
export function cleanupMediaFiles(files, delayMs = 60_000) {
    if (files.length === 0)
        return;
    setTimeout(() => {
        for (const f of files) {
            try {
                unlinkSync(f.path);
            }
            catch { /* already deleted */ }
        }
    }, delayMs);
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
function buildMinimalEnv() {
    const pick = (key) => process.env[key];
    const env = { NO_COLOR: "1", TERM: "dumb" };
    for (const key of ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP"]) {
        const v = pick(key);
        if (v)
            env[key] = v;
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
        // Required for Claude Code OAuth (Gnome Keyring / libsecret access)
        "XDG_RUNTIME_DIR",
        "DBUS_SESSION_BUS_ADDRESS",
        // Gemini CLI: trust the working directory in headless/automated environments
        "GEMINI_CLI_TRUST_WORKSPACE",
    ]) {
        const v = pick(key);
        if (v)
            env[key] = v;
    }
    return env;
}
// TIMEOUT_GRACE_MS imported from config.ts
/**
 * Spawn a CLI and deliver the prompt via stdin.
 *
 * Timeout handling (replaces Node's spawn({ timeout }) for better control):
 *   1. After `timeoutMs`, send SIGTERM and log a clear message.
 *   2. If the process doesn't exit within TIMEOUT_GRACE_MS (5s), send SIGKILL.
 *   3. The result's `timedOut` flag is set so callers can distinguish
 *      supervisor timeouts from real CLI errors.
 *
 * cwd defaults to homedir() so CLIs that scan the working directory for
 * project context (like Gemini) don't accidentally enter agentic mode.
 */
export function runCli(cmd, args, prompt, timeoutMs = DEFAULT_CLI_TIMEOUT_MS, opts = {}) {
    const cwd = opts.cwd ?? homedir();
    const log = opts.log ?? (() => { });
    return new Promise((resolve, reject) => {
        // Do NOT pass timeout to spawn() — we manage it ourselves for graceful shutdown.
        const proc = spawn(cmd, args, {
            env: buildMinimalEnv(),
            cwd,
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let killTimer = null;
        let timeoutTimer = null;
        let staleTimer = null;
        let lastOutputAt = Date.now();
        const clearTimers = () => {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
            if (staleTimer) {
                clearInterval(staleTimer);
                staleTimer = null;
            }
        };
        const doKill = (reason) => {
            if (timedOut)
                return; // already killing
            timedOut = true;
            log(`[cli-bridge] ${reason} for ${cmd}, sending SIGTERM`);
            debugLog("KILL", `${cmd} ${reason}`, { stdoutLen: stdout.length, stderrLen: stderr.length });
            proc.kill("SIGTERM");
            killTimer = setTimeout(() => {
                if (!proc.killed) {
                    log(`[cli-bridge] ${cmd} still running after ${TIMEOUT_GRACE_MS / 1000}s grace, sending SIGKILL`);
                    proc.kill("SIGKILL");
                }
            }, TIMEOUT_GRACE_MS);
        };
        // ── Hard timeout: SIGTERM → grace → SIGKILL ──────────────────────────
        timeoutTimer = setTimeout(() => {
            doKill(`timeout after ${Math.round(timeoutMs / 1000)}s`);
        }, timeoutMs);
        // ── Stale-output detection: kill if no stdout for staleTimeoutMs
        const effectiveStaleTimeout = opts.staleTimeoutMs ?? STALE_OUTPUT_TIMEOUT_MS;
        if (effectiveStaleTimeout > 0) {
            const checkInterval = 15_000; // check every 15s
            staleTimer = setInterval(() => {
                const silent = Date.now() - lastOutputAt;
                if (silent >= effectiveStaleTimeout) {
                    doKill(`stale output — no stdout for ${Math.round(silent / 1000)}s`);
                }
            }, checkInterval);
        }
        proc.stdin.write(prompt, "utf8", () => {
            proc.stdin.end();
        });
        proc.stdout.on("data", (d) => {
            stdout += d.toString();
            lastOutputAt = Date.now();
        });
        proc.stderr.on("data", (d) => {
            stderr += d.toString();
            lastOutputAt = Date.now(); // stderr also counts as activity
        });
        proc.on("close", (code) => {
            clearTimers();
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0, timedOut });
        });
        proc.on("error", (err) => {
            clearTimers();
            reject(new Error(`Failed to spawn '${cmd}': ${err.message}`));
        });
    });
}
/**
 * Spawn a CLI with the prompt delivered as a CLI argument (not stdin).
 * Used by OpenCode which expects `opencode run "prompt"`.
 * Uses the same graceful SIGTERM→SIGKILL timeout sequence as runCli.
 */
export function runCliWithArg(cmd, args, timeoutMs = DEFAULT_CLI_TIMEOUT_MS, opts = {}) {
    const cwd = opts.cwd ?? homedir();
    const log = opts.log ?? (() => { });
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, {
            env: buildMinimalEnv(),
            cwd,
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let killTimer = null;
        let timeoutTimer = null;
        const clearTimers = () => {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
        };
        timeoutTimer = setTimeout(() => {
            timedOut = true;
            const elapsed = Math.round(timeoutMs / 1000);
            log(`[cli-bridge] timeout after ${elapsed}s for ${cmd}, sending SIGTERM`);
            proc.kill("SIGTERM");
            killTimer = setTimeout(() => {
                if (!proc.killed) {
                    log(`[cli-bridge] ${cmd} still running after ${TIMEOUT_GRACE_MS / 1000}s grace, sending SIGKILL`);
                    proc.kill("SIGKILL");
                }
            }, TIMEOUT_GRACE_MS);
        }, timeoutMs);
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("close", (code) => {
            clearTimers();
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0, timedOut });
        });
        proc.on("error", (err) => {
            clearTimers();
            reject(new Error(`Failed to spawn '${cmd}': ${err.message}`));
        });
    });
}
/**
 * Annotate an error message when exit code 143 (SIGTERM) is detected.
 * Makes it clear in logs that this was a supervisor timeout, not a model error.
 */
export function annotateExitError(exitCode, stderr, timedOut, model) {
    const base = stderr || "(no output)";
    if (timedOut || exitCode === 143) {
        return `timeout: ${model} killed by supervisor (exit ${exitCode}, likely timeout) — ${base}`;
    }
    return base;
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
 * cwd = tmpdir() by default — neutral empty-ish dir, prevents workspace context scanning.
 * Override with explicit workdir.
 */
export async function runGemini(prompt, modelId, timeoutMs, workdir, opts) {
    const model = stripPrefix(modelId);
    // Session resume disabled for Gemini (exit 42 on stale sessions).
    // Same issue as Claude and Codex: SIGTERM kills leave sessions in bad state.
    const args = ["-m", model, "-p", "", "--approval-mode", "yolo"];
    const cwd = tmpdir();
    const effectivePrompt = opts?.tools?.length
        ? buildToolPromptBlock(opts.tools) + "\n\n" + prompt + "\n\nREMINDER: You MUST respond with ONLY valid JSON — either {\"tool_calls\":[...]} or {\"content\":\"...\"}. Nothing else."
        : prompt;
    debugLog("GEMINI", `fresh ${model}`, {
        promptLen: effectivePrompt.length,
    });
    const result = await runCli("gemini", args, effectivePrompt, timeoutMs, { cwd, log: opts?.log });
    // Filter out [WARN] lines from stderr (Gemini emits noisy permission warnings)
    const cleanStderr = result.stderr
        .split("\n")
        .filter((l) => !l.startsWith("[WARN]") && !l.startsWith("Loaded cached") && !l.includes("YOLO mode"))
        .join("\n")
        .trim();
    // Filter YOLO warnings from stderr - these are not errors
    if (result.exitCode !== 0 && result.stdout.length === 0) {
        throw new Error(`gemini exited ${result.exitCode}: ${annotateExitError(result.exitCode, cleanStderr, result.timedOut, modelId)}`);
    }
    return result.stdout || cleanStderr;
}
// ──────────────────────────────────────────────────────────────────────────────
// Claude Code CLI
// ──────────────────────────────────────────────────────────────────────────────
// ── Claude session registry ─────────────────────────────────────────────────
// Persistent sessions avoid re-sending the full 20KB prompt on every request.
// First call creates a session; subsequent calls resume it with just the new message.
// ── Generic CLI session registry ────────────────────────────────────────────
// Shared by Claude, Gemini, and Codex — persistent sessions avoid replaying
// the full conversation on every request.
const CLI_SESSIONS_FILE = join(homedir(), ".openclaw", "cli-bridge", "cli-sessions.json");
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 hours
const SESSION_MAX_REQUESTS = 50;
const CONSECUTIVE_TIMEOUT_LIMIT = 3;
const cliSessions = new Map();
let sessionsLoaded = false;
function loadCliSessions() {
    if (sessionsLoaded)
        return;
    sessionsLoaded = true;
    try {
        const data = JSON.parse(readFileSync(CLI_SESSIONS_FILE, "utf8"));
        if (Array.isArray(data.sessions)) {
            for (const s of data.sessions)
                cliSessions.set(s.model, s);
        }
    }
    catch { /* no sessions file yet */ }
}
function saveCliSessions() {
    try {
        mkdirSync(join(homedir(), ".openclaw", "cli-bridge"), { recursive: true });
        writeFileSync(CLI_SESSIONS_FILE, JSON.stringify({
            version: 1,
            sessions: [...cliSessions.values()],
        }, null, 2));
    }
    catch { /* best effort */ }
}
function getOrCreateSession(provider, model) {
    loadCliSessions();
    const existing = cliSessions.get(model);
    if (existing && (Date.now() - existing.lastUsedAt) < SESSION_TTL && existing.requestCount < SESSION_MAX_REQUESTS) {
        return existing;
    }
    if (existing) {
        debugLog("SESSION", `${provider} session ${existing.sessionId.slice(0, 8)} expired`, { reason: existing.requestCount >= SESSION_MAX_REQUESTS ? "max_requests" : "ttl", requestCount: existing.requestCount });
    }
    const entry = {
        sessionId: randomUUID(),
        provider,
        model,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        requestCount: 0,
        consecutiveTimeouts: 0,
    };
    cliSessions.set(model, entry);
    saveCliSessions();
    return entry;
}
function recordSessionSuccess(model) {
    const s = cliSessions.get(model);
    if (s) {
        s.requestCount++;
        s.lastUsedAt = Date.now();
        s.consecutiveTimeouts = 0;
        saveCliSessions();
    }
}
function recordSessionTimeout(model) {
    const s = cliSessions.get(model);
    if (!s)
        return;
    s.consecutiveTimeouts++;
    s.lastUsedAt = Date.now();
    if (s.consecutiveTimeouts >= CONSECUTIVE_TIMEOUT_LIMIT) {
        debugLog("SESSION", `${s.provider} session ${s.sessionId.slice(0, 8)} expired`, {
            reason: "consecutive_timeouts", consecutiveTimeouts: s.consecutiveTimeouts, requestCount: s.requestCount,
        });
        cliSessions.delete(model);
    }
    saveCliSessions();
}
function invalidateSession(model) {
    cliSessions.delete(model);
    saveCliSessions();
}
/**
 * Run Claude Code CLI in headless mode with session resume.
 *
 * First request: creates a new session with --session-id.
 * Subsequent requests: --resume <session-id> with only the new message.
 * This eliminates the 20KB prompt replay that causes Sonnet to hang.
 */
export async function runClaude(prompt, modelId, timeoutMs, workdir, opts) {
    await ensureClaudeToken();
    const model = stripPrefix(modelId);
    const session = getOrCreateSession("claude", model);
    // Session resume: enabled for Opus (reliable), disabled for Sonnet/Haiku (45% hang rate)
    const isOpus = model.includes("opus");
    const isResume = isOpus && session.requestCount > 0;
    const args = [
        "-p",
        "--output-format", "text",
        "--permission-mode", "bypassPermissions",
        "--dangerously-skip-permissions",
        "--model", model,
    ];
    if (isResume) {
        args.push("--resume", session.sessionId);
    }
    else if (isOpus) {
        args.push("--session-id", session.sessionId);
    }
    // Sonnet/Haiku: no session args — fresh call every time
    // On resume: only send the last user message (Opus has the full history).
    // On fresh: send the full prompt with tool block.
    const effectivePrompt = opts?.tools?.length
        ? (isResume
            ? prompt + "\n\nREMINDER: You MUST respond with ONLY valid JSON — either {\"tool_calls\":[...]} or {\"content\":\"...\"}. Nothing else."
            : buildToolPromptBlock(opts.tools) + "\n\n" + prompt + "\n\nREMINDER: You MUST respond with ONLY valid JSON — either {\"tool_calls\":[...]} or {\"content\":\"...\"}. Nothing else.")
        : prompt;
    // CRITICAL: Always use homedir() for Claude CLI. Running from a project directory
    // triggers Claude Code's agentic mode, which ignores our tool injection and
    // treats it as a "prompt injection attempt". This was the root cause of the 90%
    // Sonnet failure rate. Workspace context is injected as text in the prompt instead.
    const cwd = homedir();
    debugLog("CLAUDE", `${isResume ? "resume" : "fresh"} ${model}${isResume ? ` session=${session.sessionId.slice(0, 8)}` : ""}`, {
        promptLen: effectivePrompt.length, promptKB: Math.round(effectivePrompt.length / 1024),
        cwd, timeoutMs: Math.round(timeoutMs / 1000), ...(isOpus ? { requestCount: session.requestCount } : {}),
    });
    // Opus gets 90s stale timeout — it needs think time for long-form generation (blog posts, Lexical JSON)
    // Opus: 90s stale timeout (long-form generation needs think time).
    // Sonnet: 60s (real-world tool reasoning with 21 tools can take 30-50s).
    // Haiku: 30s (default — fast model, if silent for 30s it's hung).
    const staleMs = isOpus ? 90_000 : model.includes("sonnet") ? 60_000 : undefined;
    const result = await runCli("claude", args, effectivePrompt, timeoutMs, { cwd, log: opts?.log, staleTimeoutMs: staleMs });
    // Session succeeded — update registry
    if (result.exitCode === 0 || result.stdout.length > 0) {
        recordSessionSuccess(model);
        return result.stdout;
    }
    // Session failed — check if it's a timeout or auth issue
    if (result.timedOut) {
        // Track consecutive timeouts — after 3 in a row, expire the session
        recordSessionTimeout(model);
        throw new Error(`claude exited ${result.exitCode}: ${annotateExitError(result.exitCode, result.stderr, true, modelId)}`);
    }
    const stderr = result.stderr || "(no output)";
    // Session might be corrupted, expired, or locked by a zombie process — invalidate and retry
    if (stderr.includes("session") || stderr.includes("resume") || stderr.includes("not found") || stderr.includes("already in use")) {
        debugLog("CLAUDE", `session ${session.sessionId.slice(0, 8)} invalid, creating fresh`, { error: stderr.slice(0, 100) });
        invalidateSession(model);
        // Retry once with a fresh session
        const freshSession = getOrCreateSession("claude", model);
        const freshArgs = [
            "-p", "--output-format", "text",
            "--permission-mode", "bypassPermissions", "--dangerously-skip-permissions",
            "--model", model, "--session-id", freshSession.sessionId,
        ];
        const retry = await runCli("claude", freshArgs, effectivePrompt, timeoutMs, { cwd, log: opts?.log });
        if (retry.exitCode === 0 || retry.stdout.length > 0) {
            recordSessionSuccess(model);
            return retry.stdout;
        }
        // Retry also failed — invalidate the fresh session so the next request doesn't reuse it
        invalidateSession(model);
        throw new Error(`claude exited ${retry.exitCode}: ${annotateExitError(retry.exitCode, retry.stderr || "(no output)", false, modelId)}`);
    }
    // Auth failure — refresh token and retry
    if (stderr.includes("401") || stderr.includes("Invalid authentication credentials") || stderr.includes("authentication_error")) {
        await refreshClaudeToken();
        const retry = await runCli("claude", args, effectivePrompt, timeoutMs, { cwd, log: opts?.log });
        if (retry.exitCode === 0 || retry.stdout.length > 0) {
            recordSessionSuccess(model);
            return retry.stdout;
        }
        const retryStderr = retry.stderr || "(no output)";
        if (retryStderr.includes("401") || retryStderr.includes("authentication_error")) {
            throw new Error("Claude CLI OAuth token refresh failed. Re-login required: run `claude auth logout && claude auth login`.");
        }
        throw new Error(`claude exited ${retry.exitCode} (after token refresh): ${retryStderr}`);
    }
    throw new Error(`claude exited ${result.exitCode}: ${annotateExitError(result.exitCode, stderr, false, modelId)}`);
}
// ──────────────────────────────────────────────────────────────────────────────
// Codex CLI
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Ensure the workdir is a git repository. Codex CLI requires a git repo.
 * If the directory exists but is not a git repo, run `git init`.
 */
function ensureGitRepo(dir) {
    if (!existsSync(join(dir, ".git"))) {
        execSync("git init", { cwd: dir, stdio: "ignore" });
    }
}
/**
 * Run Codex CLI in non-interactive mode with prompt via stdin.
 * cwd = homedir() by default. Override with explicit workdir.
 * Auto-initializes git if workdir is not already a git repo.
 */
export async function runCodex(prompt, modelId, timeoutMs, workdir, opts) {
    const model = stripPrefix(modelId);
    // Session resume disabled for Codex (same issue as Sonnet: stale sessions cause
    // "thread/resume failed: no rollout found" errors). Fresh calls every time.
    const args = ["exec", "--model", model, "--full-auto"];
    // Codex supports native image input via -i flag
    if (opts?.mediaFiles?.length) {
        for (const f of opts.mediaFiles) {
            if (f.mimeType.startsWith("image/")) {
                args.push("-i", f.path);
            }
        }
    }
    // Use homedir for Codex too (same reason as Claude: workspace dirs cause issues).
    // Codex needs a git repo, so we ensure homedir has one.
    const cwd = homedir();
    ensureGitRepo(cwd);
    const effectivePrompt = opts?.tools?.length
        ? buildToolPromptBlock(opts.tools) + "\n\n" + prompt + "\n\nREMINDER: You MUST respond with ONLY valid JSON — either {\"tool_calls\":[...]} or {\"content\":\"...\"}. Nothing else."
        : prompt;
    debugLog("CODEX", `fresh ${model}`, {
        promptLen: effectivePrompt.length,
    });
    const result = await runCli("codex", args, effectivePrompt, timeoutMs, { cwd, log: opts?.log });
    if (result.exitCode !== 0 && result.stdout.length === 0) {
        throw new Error(`codex exited ${result.exitCode}: ${annotateExitError(result.exitCode, result.stderr, result.timedOut, modelId)}`);
    }
    return result.stdout || result.stderr;
}
// ──────────────────────────────────────────────────────────────────────────────
// OpenCode CLI
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Run OpenCode CLI. Prompt is passed as a CLI argument: `opencode run "prompt"`.
 * cwd = homedir() by default. Override with explicit workdir.
 */
export async function runOpenCode(prompt, _modelId, timeoutMs, workdir, opts) {
    const args = ["run", prompt];
    const cwd = workdir ?? homedir();
    const result = await runCliWithArg("opencode", args, timeoutMs, { cwd, log: opts?.log });
    if (result.exitCode !== 0 && result.stdout.length === 0) {
        throw new Error(`opencode exited ${result.exitCode}: ${annotateExitError(result.exitCode, result.stderr, result.timedOut, "opencode")}`);
    }
    return result.stdout || result.stderr;
}
// ──────────────────────────────────────────────────────────────────────────────
// Pi CLI
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Run Pi CLI in non-interactive mode: `pi -p "prompt"`.
 * cwd = homedir() by default. Override with explicit workdir.
 */
export async function runPi(prompt, _modelId, timeoutMs, workdir, opts) {
    const args = ["-p", prompt];
    const cwd = workdir ?? homedir();
    const result = await runCliWithArg("pi", args, timeoutMs, { cwd, log: opts?.log });
    if (result.exitCode !== 0 && result.stdout.length === 0) {
        throw new Error(`pi exited ${result.exitCode}: ${annotateExitError(result.exitCode, result.stderr, result.timedOut, "pi")}`);
    }
    return result.stdout || result.stderr;
}
// ──────────────────────────────────────────────────────────────────────────────
// Model allowlist (T-103)
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Default set of permitted models for the CLI bridge.
 * Matches the models registered as slash commands in index.ts.
 * Expressed as normalized "cli-<type>/<model-id>" strings (vllm/ prefix already stripped).
 *
 * To extend: pass a custom set to routeToCliRunner via the `allowedModels` option.
 * To disable the check: pass `null` for `allowedModels`.
 */
export const DEFAULT_ALLOWED_CLI_MODELS = new Set([
    // Claude Code CLI
    "cli-claude/claude-sonnet-4-6",
    "cli-claude/claude-opus-4-6",
    "cli-claude/claude-haiku-4-5",
    // Gemini CLI
    "cli-gemini/gemini-2.5-pro",
    "cli-gemini/gemini-2.5-flash",
    "cli-gemini/gemini-3-pro-preview",
    "cli-gemini/gemini-3-flash-preview",
    // Aliases (map to preview variants internally)
    "cli-gemini/gemini-3-pro", // alias → gemini-3-pro-preview
    "cli-gemini/gemini-3-flash", // alias → gemini-3-flash-preview
    // Codex CLI
    "openai-codex/gpt-5.3-codex",
    "openai-codex/gpt-5.3-codex-spark",
    "openai-codex/gpt-5.2-codex",
    "openai-codex/gpt-5.4",
    "openai-codex/gpt-5.1-codex-mini",
    // OpenCode CLI
    "opencode/default",
    // Pi CLI
    "pi/default",
]);
/** Normalize model aliases to their canonical CLI model names. */
function normalizeModelAlias(normalized) {
    const ALIASES = {
        "cli-gemini/gemini-3-pro": "cli-gemini/gemini-3-pro-preview",
        "cli-gemini/gemini-3-flash": "cli-gemini/gemini-3-flash-preview",
    };
    return ALIASES[normalized] ?? normalized;
}
// ── Workspace project detection ──────────────────────────────────────────────
// Scans WORKSPACE_DIR for project directories. When the user's prompt contains
// an exact match of a project name, auto-sets workdir and injects context.
let _workspaceProjects = null;
let _workspaceProjectsRefreshedAt = 0;
const WORKSPACE_CACHE_TTL = 60_000; // refresh project list every 60s
function getWorkspaceProjects() {
    const now = Date.now();
    if (_workspaceProjects && (now - _workspaceProjectsRefreshedAt) < WORKSPACE_CACHE_TTL) {
        return _workspaceProjects;
    }
    try {
        // Find all .openclaw/workspace dirs — default location + any custom ones
        const candidates = [WORKSPACE_DIR];
        _workspaceProjects = [];
        for (const wsDir of candidates) {
            if (!existsSync(wsDir))
                continue;
            const entries = readdirSync(wsDir);
            for (const name of entries) {
                try {
                    if (statSync(join(wsDir, name)).isDirectory()) {
                        _workspaceProjects.push(name);
                    }
                }
                catch { /* skip unreadable entries */ }
            }
        }
        _workspaceProjectsRefreshedAt = now;
    }
    catch {
        _workspaceProjects = [];
    }
    return _workspaceProjects;
}
function detectProjectFromPrompt(prompt) {
    const projects = getWorkspaceProjects();
    if (!projects.length)
        return null;
    // Sort by name length descending — match longest project name first
    // (e.g. "openclaw-cli-bridge-elvatis" before "openclaw-cli-bridge")
    const sorted = [...projects].sort((a, b) => b.length - a.length);
    for (const name of sorted) {
        // Case-insensitive exact word match — the project name must appear as a
        // distinct token in the prompt (not a substring of a longer word)
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (regex.test(prompt)) {
            const projectPath = join(WORKSPACE_DIR, name);
            if (existsSync(projectPath)) {
                return { name, path: projectPath };
            }
        }
    }
    return null;
}
let _skillRegistry = null;
let _skillRegistryRefreshedAt = 0;
const SKILL_REGISTRY_CACHE_TTL = 120_000; // refresh every 2 min
function getSkillRegistry() {
    const now = Date.now();
    if (_skillRegistry && (now - _skillRegistryRefreshedAt) < SKILL_REGISTRY_CACHE_TTL) {
        return _skillRegistry;
    }
    _skillRegistry = [];
    const skillsDir = join(homedir(), ".openclaw", "skills");
    try {
        if (!existsSync(skillsDir))
            return _skillRegistry;
        const entries = readdirSync(skillsDir);
        for (const name of entries) {
            const skillDir = join(skillsDir, name);
            const skillMd = join(skillDir, "SKILL.md");
            try {
                if (!statSync(skillDir).isDirectory())
                    continue;
                if (!existsSync(skillMd))
                    continue;
                // Read first 500 chars of SKILL.md to extract description and keywords
                const content = readFileSync(skillMd, "utf8").slice(0, 500);
                const descMatch = content.match(/description:\s*"([^"]+)"/);
                const description = descMatch?.[1] ?? "";
                // Build keywords from: skill name, words in description, hyphen-split name parts
                const keywords = [
                    name,
                    ...name.split("-"),
                    ...description.toLowerCase().split(/[\s,.:;]+/).filter(w => w.length > 3),
                ];
                // Find scripts
                const scriptsDir = join(skillDir, "scripts");
                let scripts = [];
                try {
                    if (existsSync(scriptsDir) && statSync(scriptsDir).isDirectory()) {
                        scripts = readdirSync(scriptsDir).filter(f => f.endsWith(".py") || f.endsWith(".sh"));
                    }
                }
                catch { /* no scripts dir */ }
                _skillRegistry.push({ name, path: skillDir, description, keywords, scripts });
            }
            catch { /* skip unreadable skill */ }
        }
    }
    catch { /* no skills dir */ }
    _skillRegistryRefreshedAt = now;
    return _skillRegistry;
}
function detectSkillHints(userText) {
    const skills = getSkillRegistry();
    if (!skills.length)
        return null;
    const matched = [];
    for (const skill of skills) {
        // Match by exact skill name in prompt only
        const nameRegex = new RegExp(`\\b${skill.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (nameRegex.test(userText)) {
            matched.push(skill);
        }
    }
    if (!matched.length)
        return null;
    // Keep hints compact — every byte counts at high message counts
    const hints = matched.map(skill => {
        const scripts = skill.scripts.length > 0
            ? ` Scripts: ${skill.scripts.map(s => `${skill.path}/scripts/${s}`).join(", ")}`
            : "";
        return `[Skill: ${skill.name}] Read: ${skill.path}/SKILL.md — follow workflow with read/exec tools.${scripts}`;
    });
    return hints.join("\n");
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
export async function routeToCliRunner(model, messages, timeoutMs, opts = {}) {
    const toolCount = opts.tools?.length ?? 0;
    let prompt = formatPrompt(messages, toolCount);
    const hasTools = toolCount > 0;
    // Auto-detect project from user messages only (not tool results which mention other projects)
    const userText = messages
        .filter((m) => m.role === "user")
        .map((m) => contentToString(m.content))
        .join(" ");
    if (!opts.workdir) {
        const detected = detectProjectFromPrompt(userText);
        if (detected) {
            opts = { ...opts, workdir: detected.path };
            prompt = `[Context: Working directory is ${detected.path}]\n\n${prompt}`;
            debugLog("WORKSPACE", `auto-detected project "${detected.name}"`, { path: detected.path });
        }
    }
    // Skill hints: inject at END of prompt so they're the freshest context (not buried under system msg)
    const skillHints = detectSkillHints(userText);
    if (skillHints) {
        prompt = `${prompt}\n\n${skillHints}`;
        debugLog("SKILL-HINT", "injected skill hints at end of prompt", { len: skillHints.length });
    }
    // Strip "vllm/" prefix if present — OpenClaw sends the full provider path
    // (e.g. "vllm/cli-claude/claude-sonnet-4-6") but the router only needs the
    // "cli-<type>/<model>" portion.
    const normalized = model.startsWith("vllm/") ? model.slice(5) : model;
    // T-103: enforce allowlist unless explicitly disabled
    const allowedModels = opts.allowedModels === undefined
        ? DEFAULT_ALLOWED_CLI_MODELS
        : opts.allowedModels;
    if (allowedModels !== null && !allowedModels.has(normalized)) {
        const known = [...(allowedModels)].join(", ");
        throw new Error(`CLI bridge model not allowed: "${model}". Allowed: ${known || "(none)"}.`);
    }
    // Resolve aliases (e.g. gemini-3-pro → gemini-3-pro-preview) after allowlist check
    const resolved = normalizeModelAlias(normalized);
    const log = opts.log;
    let rawText;
    if (resolved.startsWith("cli-gemini/"))
        rawText = await runGemini(prompt, resolved, timeoutMs, opts.workdir, { tools: opts.tools, log });
    else if (resolved.startsWith("cli-claude/"))
        rawText = await runClaude(prompt, resolved, timeoutMs, opts.workdir, { tools: opts.tools, log });
    else if (resolved.startsWith("openai-codex/"))
        rawText = await runCodex(prompt, resolved, timeoutMs, opts.workdir, { tools: opts.tools, mediaFiles: opts.mediaFiles, log });
    else if (resolved.startsWith("opencode/"))
        rawText = await runOpenCode(prompt, resolved, timeoutMs, opts.workdir, { log });
    else if (resolved.startsWith("pi/"))
        rawText = await runPi(prompt, resolved, timeoutMs, opts.workdir, { log });
    else
        throw new Error(`Unknown CLI bridge model: "${model}". Use "vllm/cli-gemini/<model>", "vllm/cli-claude/<model>", "openai-codex/<model>", "opencode/<model>", or "pi/<model>".`);
    // When tools were provided, try to parse structured tool_calls from the response
    if (hasTools) {
        return parseToolCallResponse(rawText);
    }
    // No tools — but check if the model still wrapped its response in {"content":"..."} JSON
    // (this happens when tool instructions from a previous turn are still in the conversation)
    try {
        const parsed = JSON.parse(rawText.trim());
        if (typeof parsed?.content === "string") {
            return { content: parsed.content };
        }
    }
    catch { /* not JSON, that's fine */ }
    return { content: rawText };
}
// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function stripPrefix(modelId) {
    const slash = modelId.indexOf("/");
    return slash === -1 ? modelId : modelId.slice(slash + 1);
}
//# sourceMappingURL=cli-runner.js.map