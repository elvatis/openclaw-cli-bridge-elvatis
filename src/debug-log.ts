/**
 * debug-log.ts
 *
 * File-based debug logger for the CLI bridge.
 * Writes to ~/.openclaw/cli-bridge/debug.log with automatic rotation at 5 MB.
 *
 * Usage:
 *   tail -f ~/.openclaw/cli-bridge/debug.log
 */

import { appendFileSync, readFileSync, openSync, readSync, closeSync, statSync, renameSync, mkdirSync, watchFile, unwatchFile } from "node:fs";
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
 * Suppress logging in test mode (vitest sets NODE_ENV or uses port 0).
 * Without this, every test run pollutes the production debug log with 43+ fake requests.
 */
let _enabled = true;
export function setDebugLogEnabled(enabled: boolean): void { _enabled = enabled; }

/**
 * Append a debug line to the log file.
 * Non-blocking, never throws — logging must not crash the bridge.
 */
export function debugLog(category: string, message: string, data?: Record<string, unknown>): void {
  if (!_enabled) return;
  try {
    ensureDir();
    rotate();
    const extra = data ? ` ${JSON.stringify(data)}` : "";
    appendFileSync(LOG_FILE, `${ts()} [${category}] ${message}${extra}\n`);
  } catch { /* never crash on log failure */ }
}

/** Log path for display on status page / startup messages. */
export const DEBUG_LOG_PATH = LOG_FILE;

/**
 * Read the last N lines from the log file.
 * Returns null if the file doesn't exist.
 */
export function getLogTail(lines = 100): string | null {
  try {
    const content = readFileSync(LOG_FILE, "utf8");
    const allLines = content.split("\n").filter(Boolean);
    return allLines.slice(-lines).reverse().join("\n");
  } catch {
    return null;
  }
}

/**
 * Watch the log file for new content and call the callback for each new line.
 * Returns an unwatch function to stop watching.
 */
export function watchLogFile(onLine: (line: string) => void): () => void {
  let lastSize = 0;
  try { lastSize = statSync(LOG_FILE).size; } catch { /* file doesn't exist yet */ }

  const listener = () => {
    try {
      const stat = statSync(LOG_FILE);
      if (stat.size <= lastSize) {
        // File was rotated or truncated — reset
        lastSize = 0;
      }
      if (stat.size > lastSize) {
        const buf = Buffer.alloc(stat.size - lastSize);
        const fd = openSync(LOG_FILE, "r");
        readSync(fd, buf, 0, buf.length, lastSize);
        closeSync(fd);
        const newContent = buf.toString("utf8");
        const lines = newContent.split("\n").filter(Boolean);
        for (const line of lines) onLine(line);
        lastSize = stat.size;
      }
    } catch { /* best effort */ }
  };

  watchFile(LOG_FILE, { interval: 1000 }, listener);
  return () => { unwatchFile(LOG_FILE, listener); };
}
