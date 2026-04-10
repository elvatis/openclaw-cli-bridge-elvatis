/**
 * session-manager.ts
 *
 * Manages long-running CLI sessions as background processes.
 * Each session spawns a CLI subprocess, buffers stdout/stderr, and allows
 * polling, log streaming, stdin writes, and graceful termination.
 *
 * Singleton pattern — import and use the shared `sessionManager` instance.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { formatPrompt } from "./cli-runner.js";
import { createIsolatedWorkdir, cleanupWorkdir, sweepOrphanedWorkdirs } from "./workdir.js";
// ──────────────────────────────────────────────────────────────────────────────
// Minimal env (mirrors cli-runner.ts buildMinimalEnv)
// ──────────────────────────────────────────────────────────────────────────────
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
        "XDG_RUNTIME_DIR",
        "DBUS_SESSION_BUS_ADDRESS",
    ]) {
        const v = pick(key);
        if (v)
            env[key] = v;
    }
    return env;
}
// ──────────────────────────────────────────────────────────────────────────────
// Session Manager
// ──────────────────────────────────────────────────────────────────────────────
/** Auto-cleanup interval: 30 minutes. */
const SESSION_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export class SessionManager {
    sessions = new Map();
    cleanupTimer = null;
    constructor() {
        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
        // Don't keep the process alive just for cleanup
        if (this.cleanupTimer.unref)
            this.cleanupTimer.unref();
    }
    /**
     * Spawn a new CLI session for the given model + messages.
     * Returns a unique sessionId (random hex).
     */
    spawn(model, messages, opts = {}) {
        // Validate model ID before it reaches spawn() args to prevent command injection
        // (CodeQL js/command-line-injection). Allow only safe chars: letters, digits,
        // dots, hyphens, underscores, and forward slashes (for provider prefixes).
        if (!/^[a-zA-Z0-9._\-\/]+$/.test(model)) {
            throw new Error(`Invalid model ID: "${model}". Only alphanumeric characters, dots, hyphens, underscores, and slashes are allowed.`);
        }
        const sessionId = randomBytes(8).toString("hex");
        const prompt = formatPrompt(messages);
        // Workdir isolation: create a temp dir if requested and no explicit workdir given
        let isolatedDir = null;
        const effectiveOpts = { ...opts };
        if (opts.isolateWorkdir && !opts.workdir) {
            isolatedDir = createIsolatedWorkdir();
            effectiveOpts.workdir = isolatedDir;
        }
        const { cmd, args, cwd, useStdin } = this.resolveCliCommand(model, prompt, effectiveOpts);
        const proc = spawn(cmd, args, {
            env: buildMinimalEnv(),
            cwd,
            timeout: opts.timeout,
        });
        const entry = {
            proc,
            stdout: "",
            stderr: "",
            startTime: Date.now(),
            exitCode: null,
            model,
            status: "running",
            isolatedWorkdir: isolatedDir,
        };
        if (useStdin) {
            proc.stdin.write(prompt, "utf8", () => {
                proc.stdin.end();
            });
        }
        proc.stdout?.on("data", (d) => { entry.stdout += d.toString(); });
        proc.stderr?.on("data", (d) => { entry.stderr += d.toString(); });
        proc.on("close", (code) => {
            entry.exitCode = code ?? 0;
            if (entry.status === "running")
                entry.status = "exited";
            // Auto-cleanup isolated workdir on process exit
            if (entry.isolatedWorkdir) {
                cleanupWorkdir(entry.isolatedWorkdir);
            }
        });
        proc.on("error", () => {
            if (entry.status === "running")
                entry.status = "exited";
            entry.exitCode = entry.exitCode ?? 1;
            // Auto-cleanup isolated workdir on error too
            if (entry.isolatedWorkdir) {
                cleanupWorkdir(entry.isolatedWorkdir);
            }
        });
        this.sessions.set(sessionId, entry);
        return sessionId;
    }
    /** Check if a session is still running. */
    poll(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (!entry)
            return null;
        return {
            running: entry.status === "running",
            exitCode: entry.exitCode,
            status: entry.status,
        };
    }
    /** Get buffered stdout/stderr from offset. */
    log(sessionId, offset = 0) {
        const entry = this.sessions.get(sessionId);
        if (!entry)
            return null;
        return {
            stdout: entry.stdout.slice(offset),
            stderr: entry.stderr.slice(offset),
            offset: entry.stdout.length,
        };
    }
    /** Write data to the session's stdin. */
    write(sessionId, data) {
        const entry = this.sessions.get(sessionId);
        if (!entry || entry.status !== "running")
            return false;
        try {
            entry.proc.stdin?.write(data, "utf8");
            return true;
        }
        catch {
            return false;
        }
    }
    /** Send SIGTERM to the session process. */
    kill(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (!entry || entry.status !== "running")
            return false;
        entry.status = "killed";
        entry.proc.kill("SIGTERM");
        return true;
    }
    /** List all sessions with their status. */
    list() {
        const result = [];
        for (const [sessionId, entry] of this.sessions) {
            result.push({
                sessionId,
                model: entry.model,
                status: entry.status,
                startTime: entry.startTime,
                exitCode: entry.exitCode,
                isolatedWorkdir: entry.isolatedWorkdir,
            });
        }
        return result;
    }
    /** Remove sessions older than SESSION_TTL_MS. Kill running ones first. Clean up isolated workdirs. */
    cleanup() {
        const now = Date.now();
        for (const [sessionId, entry] of this.sessions) {
            if (now - entry.startTime > SESSION_TTL_MS) {
                if (entry.status === "running") {
                    entry.proc.kill("SIGTERM");
                    entry.status = "killed";
                }
                // Clean up isolated workdir if it wasn't cleaned on exit
                if (entry.isolatedWorkdir) {
                    cleanupWorkdir(entry.isolatedWorkdir);
                }
                this.sessions.delete(sessionId);
            }
        }
        // Sweep orphaned workdirs from crashed sessions
        sweepOrphanedWorkdirs();
    }
    /** Stop the cleanup timer (for graceful shutdown). */
    stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        // Kill all running sessions and clean up their workdirs
        for (const [, entry] of this.sessions) {
            if (entry.status === "running") {
                entry.proc.kill("SIGTERM");
                entry.status = "killed";
            }
            if (entry.isolatedWorkdir) {
                cleanupWorkdir(entry.isolatedWorkdir);
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────────
    // Internal: resolve CLI command + args for a model
    // ────────────────────────────────────────────────────────────────────────────
    resolveCliCommand(model, prompt, opts) {
        const normalized = model.startsWith("vllm/") ? model.slice(5) : model;
        const stripPfx = (id) => { const s = id.indexOf("/"); return s === -1 ? id : id.slice(s + 1); };
        const modelName = stripPfx(normalized);
        if (normalized.startsWith("cli-gemini/")) {
            return {
                cmd: "gemini",
                args: ["-m", modelName, "-p", ""],
                cwd: opts.workdir ?? tmpdir(),
                useStdin: true,
            };
        }
        if (normalized.startsWith("cli-claude/")) {
            return {
                cmd: "claude",
                args: ["-p", "--output-format", "text", "--permission-mode", "plan", "--tools", "", "--model", modelName],
                cwd: opts.workdir ?? homedir(),
                useStdin: true,
            };
        }
        if (normalized.startsWith("openai-codex/")) {
            const cwd = opts.workdir ?? homedir();
            // Ensure git repo for Codex
            if (!existsSync(join(cwd, ".git"))) {
                try {
                    execSync("git init", { cwd, stdio: "ignore" });
                }
                catch { /* best effort */ }
            }
            return {
                cmd: "codex",
                args: ["--model", modelName, "--quiet", "--full-auto"],
                cwd,
                useStdin: true,
            };
        }
        if (normalized.startsWith("opencode/")) {
            return {
                cmd: "opencode",
                args: ["run", prompt],
                cwd: opts.workdir ?? homedir(),
                useStdin: false,
            };
        }
        if (normalized.startsWith("pi/")) {
            return {
                cmd: "pi",
                args: ["-p", prompt],
                cwd: opts.workdir ?? homedir(),
                useStdin: false,
            };
        }
        // Fallback: try as a generic CLI (stdin-based)
        return {
            cmd: modelName,
            args: [],
            cwd: opts.workdir ?? homedir(),
            useStdin: true,
        };
    }
}
/** Shared singleton instance. */
export const sessionManager = new SessionManager();
//# sourceMappingURL=session-manager.js.map