/**
 * debug-log.ts
 *
 * File-based debug logger for the CLI bridge.
 * Writes to ~/.openclaw/cli-bridge/debug.log with automatic rotation at 5 MB.
 *
 * Usage:
 *   tail -f ~/.openclaw/cli-bridge/debug.log
 */

import { appendFileSync, statSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(homedir(), ".openclaw", "cli-bridge");
const LOG_FILE = join(LOG_DIR, "debug.log");
const LOG_FILE_PREV = join(LOG_DIR, "debug.log.1");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

let initialized = false;

function ensureDir(): void {
  if (initialized) return;
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* exists */ }
  initialized = true;
}

function rotate(): void {
  try {
    const stat = statSync(LOG_FILE);
    if (stat.size > MAX_LOG_SIZE) {
      try { renameSync(LOG_FILE, LOG_FILE_PREV); } catch { /* best effort */ }
    }
  } catch { /* file doesn't exist yet */ }
}

function ts(): string {
  return new Date().toISOString();
}

/**
 * Append a debug line to the log file.
 * Non-blocking, never throws — logging must not crash the bridge.
 */
export function debugLog(category: string, message: string, data?: Record<string, unknown>): void {
  try {
    ensureDir();
    rotate();
    const extra = data ? ` ${JSON.stringify(data)}` : "";
    appendFileSync(LOG_FILE, `${ts()} [${category}] ${message}${extra}\n`);
  } catch { /* never crash on log failure */ }
}

/** Log path for display on status page / startup messages. */
export const DEBUG_LOG_PATH = LOG_FILE;
