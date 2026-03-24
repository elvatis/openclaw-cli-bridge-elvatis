/**
 * session-manager.ts
 *
 * Manages long-running CLI sessions as background processes.
 * Each session spawns a CLI subprocess, buffers stdout/stderr, and allows
 * polling, log streaming, stdin writes, and graceful termination.
 *
 * Singleton pattern — import and use the shared `sessionManager` instance.
 */
import { type ChildProcess } from "node:child_process";
import { type ChatMessage } from "./cli-runner.js";
export type SessionStatus = "running" | "exited" | "killed";
export interface SessionEntry {
    proc: ChildProcess;
    stdout: string;
    stderr: string;
    startTime: number;
    exitCode: number | null;
    model: string;
    status: SessionStatus;
    /** Isolated workdir created for this session (null if caller provided explicit workdir). */
    isolatedWorkdir: string | null;
}
export interface SessionInfo {
    sessionId: string;
    model: string;
    status: SessionStatus;
    startTime: number;
    exitCode: number | null;
    /** Isolated workdir path (null if not using workdir isolation). */
    isolatedWorkdir: string | null;
}
export interface SpawnOptions {
    workdir?: string;
    timeout?: number;
    /**
     * If true, create an isolated temp directory for this session.
     * The directory is automatically cleaned up when the session exits or is killed.
     * Ignored if `workdir` is explicitly set.
     * Default: false (uses per-runner defaults: tmpdir for gemini, homedir for others).
     */
    isolateWorkdir?: boolean;
}
export declare class SessionManager {
    private sessions;
    private cleanupTimer;
    constructor();
    /**
     * Spawn a new CLI session for the given model + messages.
     * Returns a unique sessionId (random hex).
     */
    spawn(model: string, messages: ChatMessage[], opts?: SpawnOptions): string;
    /** Check if a session is still running. */
    poll(sessionId: string): {
        running: boolean;
        exitCode: number | null;
        status: SessionStatus;
    } | null;
    /** Get buffered stdout/stderr from offset. */
    log(sessionId: string, offset?: number): {
        stdout: string;
        stderr: string;
        offset: number;
    } | null;
    /** Write data to the session's stdin. */
    write(sessionId: string, data: string): boolean;
    /** Send SIGTERM to the session process. */
    kill(sessionId: string): boolean;
    /** List all sessions with their status. */
    list(): SessionInfo[];
    /** Remove sessions older than SESSION_TTL_MS. Kill running ones first. Clean up isolated workdirs. */
    cleanup(): void;
    /** Stop the cleanup timer (for graceful shutdown). */
    stop(): void;
    private resolveCliCommand;
}
/** Shared singleton instance. */
export declare const sessionManager: SessionManager;
//# sourceMappingURL=session-manager.d.ts.map