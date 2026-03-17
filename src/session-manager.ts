/**
 * session-manager.ts
 *
 * Manages long-running CLI sessions as background processes.
 * Each session spawns a CLI subprocess, buffers stdout/stderr, and allows
 * polling, log streaming, stdin writes, and graceful termination.
 *
 * Singleton pattern — import and use the shared `sessionManager` instance.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { formatPrompt, type ChatMessage } from "./cli-runner.js";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type SessionStatus = "running" | "exited" | "killed";

export interface SessionEntry {
  proc: ChildProcess;
  stdout: string;
  stderr: string;
  startTime: number;
  exitCode: number | null;
  model: string;
  status: SessionStatus;
}

export interface SessionInfo {
  sessionId: string;
  model: string;
  status: SessionStatus;
  startTime: number;
  exitCode: number | null;
}

export interface SpawnOptions {
  workdir?: string;
  timeout?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimal env (mirrors cli-runner.ts buildMinimalEnv)
// ──────────────────────────────────────────────────────────────────────────────

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
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
  ]) {
    const v = pick(key);
    if (v) env[key] = v;
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
  private sessions = new Map<string, SessionEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    // Don't keep the process alive just for cleanup
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Spawn a new CLI session for the given model + messages.
   * Returns a unique sessionId (random hex).
   */
  spawn(model: string, messages: ChatMessage[], opts: SpawnOptions = {}): string {
    const sessionId = randomBytes(8).toString("hex");
    const prompt = formatPrompt(messages);

    const { cmd, args, cwd, useStdin } = this.resolveCliCommand(model, prompt, opts);

    const proc = spawn(cmd, args, {
      env: buildMinimalEnv(),
      cwd,
      timeout: opts.timeout,
    });

    const entry: SessionEntry = {
      proc,
      stdout: "",
      stderr: "",
      startTime: Date.now(),
      exitCode: null,
      model,
      status: "running",
    };

    if (useStdin) {
      proc.stdin.write(prompt, "utf8", () => {
        proc.stdin.end();
      });
    }

    proc.stdout?.on("data", (d: Buffer) => { entry.stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { entry.stderr += d.toString(); });

    proc.on("close", (code) => {
      entry.exitCode = code ?? 0;
      if (entry.status === "running") entry.status = "exited";
    });

    proc.on("error", () => {
      if (entry.status === "running") entry.status = "exited";
      entry.exitCode = entry.exitCode ?? 1;
    });

    this.sessions.set(sessionId, entry);
    return sessionId;
  }

  /** Check if a session is still running. */
  poll(sessionId: string): { running: boolean; exitCode: number | null; status: SessionStatus } | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    return {
      running: entry.status === "running",
      exitCode: entry.exitCode,
      status: entry.status,
    };
  }

  /** Get buffered stdout/stderr from offset. */
  log(sessionId: string, offset = 0): { stdout: string; stderr: string; offset: number } | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    return {
      stdout: entry.stdout.slice(offset),
      stderr: entry.stderr.slice(offset),
      offset: entry.stdout.length,
    };
  }

  /** Write data to the session's stdin. */
  write(sessionId: string, data: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.status !== "running") return false;
    try {
      entry.proc.stdin?.write(data, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  /** Send SIGTERM to the session process. */
  kill(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.status !== "running") return false;
    entry.status = "killed";
    entry.proc.kill("SIGTERM");
    return true;
  }

  /** List all sessions with their status. */
  list(): SessionInfo[] {
    const result: SessionInfo[] = [];
    for (const [sessionId, entry] of this.sessions) {
      result.push({
        sessionId,
        model: entry.model,
        status: entry.status,
        startTime: entry.startTime,
        exitCode: entry.exitCode,
      });
    }
    return result;
  }

  /** Remove sessions older than SESSION_TTL_MS. Kill running ones first. */
  cleanup(): void {
    const now = Date.now();
    for (const [sessionId, entry] of this.sessions) {
      if (now - entry.startTime > SESSION_TTL_MS) {
        if (entry.status === "running") {
          entry.proc.kill("SIGTERM");
          entry.status = "killed";
        }
        this.sessions.delete(sessionId);
      }
    }
  }

  /** Stop the cleanup timer (for graceful shutdown). */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    // Kill all running sessions
    for (const [, entry] of this.sessions) {
      if (entry.status === "running") {
        entry.proc.kill("SIGTERM");
        entry.status = "killed";
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal: resolve CLI command + args for a model
  // ────────────────────────────────────────────────────────────────────────────

  private resolveCliCommand(
    model: string,
    prompt: string,
    opts: SpawnOptions
  ): { cmd: string; args: string[]; cwd: string; useStdin: boolean } {
    const normalized = model.startsWith("vllm/") ? model.slice(5) : model;
    const stripPfx = (id: string) => { const s = id.indexOf("/"); return s === -1 ? id : id.slice(s + 1); };
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
        try { execSync("git init", { cwd, stdio: "ignore" }); } catch { /* best effort */ }
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
