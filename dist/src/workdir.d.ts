/**
 * workdir.ts
 *
 * Workdir isolation for CLI agent spawns (Issue #6).
 *
 * Creates a unique temporary directory per agent session and cleans it up
 * after the session completes. This prevents agents from interfering with
 * each other or polluting the user's home directory.
 *
 * Each isolated workdir is created under a base directory:
 *   <base>/cli-bridge-<randomHex>/
 *
 * Default base: os.tmpdir() (e.g. /tmp/)
 * Override via OPENCLAW_CLI_BRIDGE_WORKDIR_BASE env var.
 *
 * Cleanup is best-effort: directories are removed when the session ends,
 * and a periodic sweep removes any orphaned dirs older than 1 hour.
 */
/** Get the base directory for isolated workdirs. */
export declare function getWorkdirBase(): string;
/**
 * Create an isolated temporary directory for an agent session.
 * Returns the absolute path to the new directory.
 *
 * The directory is created with a random suffix to ensure uniqueness:
 *   /tmp/cli-bridge-a1b2c3d4/
 */
export declare function createIsolatedWorkdir(base?: string): string;
/**
 * Clean up an isolated workdir by removing it and all contents.
 * Returns true if removed successfully, false if it didn't exist or failed.
 *
 * Safety: only removes directories that match the cli-bridge- prefix.
 */
export declare function cleanupWorkdir(dirPath: string): boolean;
/**
 * Sweep orphaned workdirs older than ORPHAN_MAX_AGE_MS.
 * Scans the base directory for cli-bridge-* dirs and removes stale ones.
 * Returns the number of dirs removed.
 */
export declare function sweepOrphanedWorkdirs(base?: string): number;
/**
 * Ensure a directory exists, creating it if needed.
 * Returns the path.
 */
export declare function ensureDir(dirPath: string): string;
//# sourceMappingURL=workdir.d.ts.map