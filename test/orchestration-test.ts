#!/usr/bin/env npx tsx
/**
 * CLI Provider Orchestration Test
 *
 * Standalone diagnostic script that spawns real CLI processes and measures
 * success/failure per provider. NOT a vitest test — run directly:
 *
 *   npx tsx test/orchestration-test.ts
 *   npx tsx test/orchestration-test.ts --providers claude-opus --reps 1
 *   npx tsx test/orchestration-test.ts --verbose --scenario tools
 */

import { spawn, execSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

// ── Types ────────────────────────────────────────────────────────────────────

type TestStatus = "SUCCESS" | "TIMEOUT" | "STALE_HANG" | "ERROR" | "EMPTY";

interface ProviderConfig {
  id: string;
  label: string;
  cmd: string;
  buildArgs: () => string[];
  cwd: () => string;
  cleanup?: () => void;
}

interface TestScenario {
  id: string;
  label: string;
  prompt: string;
  expectToolCalls?: boolean;
}

interface TestResult {
  provider: string;
  scenario: string;
  rep: number;
  status: TestStatus;
  durationMs: number;
  exitCode: number | null;
  stdoutLen: number;
  stderrLen: number;
  stdoutPreview: string;
  stderrPreview: string;
  killReason: string | null;
}

// ── Environment ──────────────────────────────────────────────────────────────

function buildMinimalEnv(): Record<string, string> {
  const pick = (key: string) => process.env[key];
  const env: Record<string, string> = { NO_COLOR: "1", TERM: "dumb" };

  for (const key of ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP"]) {
    const v = pick(key);
    if (v) env[key] = v;
  }
  for (const key of [
    "GOOGLE_APPLICATION_CREDENTIALS",
    "ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "CODEX_API_KEY", "OPENAI_API_KEY",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
    "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
  ]) {
    const v = pick(key);
    if (v) env[key] = v;
  }
  return env;
}

// ── Providers ────────────────────────────────────────────────────────────────

let codexTmpDir: string | null = null;

function getCodexDir(): string {
  if (!codexTmpDir) {
    codexTmpDir = mkdtempSync(join(tmpdir(), "orchestration-codex-"));
    execSync("git init", { cwd: codexTmpDir, stdio: "ignore" });
  }
  return codexTmpDir;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  "claude-opus": {
    id: "claude-opus", label: "Claude/Opus",
    cmd: "claude",
    buildArgs: () => ["-p", "--output-format", "text", "--permission-mode", "bypassPermissions", "--dangerously-skip-permissions", "--model", "claude-opus-4-6"],
    cwd: () => homedir(),
  },
  "claude-sonnet": {
    id: "claude-sonnet", label: "Claude/Sonnet",
    cmd: "claude",
    buildArgs: () => ["-p", "--output-format", "text", "--permission-mode", "bypassPermissions", "--dangerously-skip-permissions", "--model", "claude-sonnet-4-6"],
    cwd: () => homedir(),
  },
  "claude-haiku": {
    id: "claude-haiku", label: "Claude/Haiku",
    cmd: "claude",
    buildArgs: () => ["-p", "--output-format", "text", "--permission-mode", "bypassPermissions", "--dangerously-skip-permissions", "--model", "claude-haiku-4-5"],
    cwd: () => homedir(),
  },
  "gemini-flash": {
    id: "gemini-flash", label: "Gemini/Flash",
    cmd: "gemini",
    buildArgs: () => ["-m", "gemini-2.5-flash", "-p", "", "--approval-mode", "yolo"],
    cwd: () => tmpdir(),
  },
  "codex": {
    id: "codex", label: "Codex/GPT-5.3",
    cmd: "codex",
    buildArgs: () => ["exec", "--model", "gpt-5.3-codex", "--full-auto"],
    cwd: () => getCodexDir(),
    cleanup: () => { if (codexTmpDir) { try { rmSync(codexTmpDir, { recursive: true }); } catch {} codexTmpDir = null; } },
  },
};

// ── Scenarios ────────────────────────────────────────────────────────────────

const TOOL_BLOCK = `You have access to the following tools.

IMPORTANT: You must respond with ONLY valid JSON in one of these two formats:

To call a tool:
{"tool_calls":[{"name":"<tool_name>","arguments":{<parameters>}}]}

To respond with text:
{"content":"<your text>"}

Available tools:
- get_weather
  description: Get current weather for a location
  parameters: {"type":"object","properties":{"location":{"type":"string","description":"City name"}},"required":["location"]}

`;

function buildScenarios(): TestScenario[] {
  const large = "Context: " + "The quick brown fox jumps over the lazy dog. ".repeat(700) + "\n\nSummarize the above in one sentence.";

  return [
    {
      id: "simple",
      label: "Simple",
      prompt: "What is 2+2? Reply with just the number.",
    },
    {
      id: "tools",
      label: "Tools",
      prompt: TOOL_BLOCK + 'What is the weather in Berlin? Use the get_weather tool.\n\nREMINDER: Respond with ONLY valid JSON.',
      expectToolCalls: true,
    },
    {
      id: "large",
      label: "Large (30KB)",
      prompt: large,
    },
  ];
}

// ── Spawn Harness ────────────────────────────────────────────────────────────

async function spawnTest(
  provider: ProviderConfig,
  prompt: string,
  timeoutMs: number,
  staleMs: number,
  verbose: boolean,
): Promise<TestResult> {
  const start = performance.now();

  return new Promise((resolve) => {
    const proc = spawn(provider.cmd, provider.buildArgs(), {
      env: buildMinimalEnv(),
      cwd: provider.cwd(),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killReason: string | null = null;
    let lastOutputAt = Date.now();
    let resolved = false;

    const finish = (exitCode: number | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(hardTimer);
      clearTimeout(killTimer);
      clearInterval(staleTimer);

      const durationMs = Math.round(performance.now() - start);
      const result: TestResult = {
        provider: provider.id,
        scenario: "",
        rep: 0,
        status: "SUCCESS",
        durationMs,
        exitCode,
        stdoutLen: stdout.length,
        stderrLen: stderr.length,
        stdoutPreview: stdout.slice(0, 200).replace(/\n/g, "\\n"),
        stderrPreview: stderr.slice(0, 200).replace(/\n/g, "\\n"),
        killReason,
      };

      // Classify
      if (killReason === "hard-timeout") result.status = "TIMEOUT";
      else if (killReason === "stale-output") result.status = "STALE_HANG";
      else if (exitCode !== 0 && stdout.length === 0) result.status = "ERROR";
      else if (exitCode === 0 && stdout.length === 0) result.status = "EMPTY";
      else result.status = "SUCCESS";

      if (verbose) {
        const icon = result.status === "SUCCESS" ? "OK" : "FAIL";
        console.log(`  [${icon}] ${provider.label} ${result.durationMs}ms exit=${exitCode} stdout=${stdout.length} stderr=${stderr.length} kill=${killReason ?? "none"}`);
        if (stdout.length > 0) console.log(`    stdout: ${stdout.slice(0, 300).replace(/\n/g, "\\n")}`);
        if (stderr.length > 0 && result.status !== "SUCCESS") console.log(`    stderr: ${stderr.slice(0, 300).replace(/\n/g, "\\n")}`);
      }

      resolve(result);
    };

    // Hard timeout
    let killTimer: ReturnType<typeof setTimeout>;
    const hardTimer = setTimeout(() => {
      killReason = "hard-timeout";
      timedOut = true;
      proc.kill("SIGTERM");
      killTimer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 5000);
    }, timeoutMs);

    // Stale-output detection
    const staleTimer = setInterval(() => {
      const silent = Date.now() - lastOutputAt;
      if (silent >= staleMs) {
        killReason = "stale-output";
        timedOut = true;
        proc.kill("SIGTERM");
        clearInterval(staleTimer);
        killTimer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 5000);
      }
    }, 5000);

    // stdin
    proc.stdin.write(prompt, "utf8", () => { proc.stdin.end(); });

    // stdout/stderr
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); lastOutputAt = Date.now(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); lastOutputAt = Date.now(); });

    proc.on("close", (code) => finish(code));
    proc.on("error", (err) => {
      stderr += `\nspawn error: ${err.message}`;
      finish(1);
    });
  });
}

// ── Matrix Runner ────────────────────────────────────────────────────────────

async function runMatrix(
  providers: ProviderConfig[],
  scenarios: TestScenario[],
  reps: number,
  timeoutMs: number,
  staleMs: number,
  verbose: boolean,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const total = providers.length * scenarios.length * reps;
  let current = 0;

  for (const provider of providers) {
    // Check binary exists
    try {
      execSync(`which ${provider.cmd}`, { stdio: "pipe" });
    } catch {
      console.log(`SKIP ${provider.label}: binary '${provider.cmd}' not found`);
      continue;
    }

    for (const scenario of scenarios) {
      for (let rep = 1; rep <= reps; rep++) {
        current++;
        if (!verbose) {
          process.stdout.write(`\r  [${current}/${total}] ${provider.label} / ${scenario.label} #${rep}...`);
        } else {
          console.log(`\n[${current}/${total}] ${provider.label} / ${scenario.label} #${rep}`);
        }

        const result = await spawnTest(provider, scenario.prompt, timeoutMs, staleMs, verbose);
        result.scenario = scenario.id;
        result.rep = rep;
        results.push(result);
      }
    }

    // Cleanup provider resources
    provider.cleanup?.();
  }

  if (!verbose) process.stdout.write("\r" + " ".repeat(80) + "\r");
  return results;
}

// ── Report ───────────────────────────────────────────────────────────────────

function formatReport(results: TestResult[], timeoutMs: number, staleMs: number, reps: number): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("=== CLI Provider Orchestration Test Report ===");
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`Timeout: ${timeoutMs / 1000}s | Stale: ${staleMs / 1000}s | Reps: ${reps}`);
  lines.push("");

  // Header
  const repHeaders = Array.from({ length: reps }, (_, i) => `#${i + 1}`.padStart(12));
  lines.push(`${"PROVIDER".padEnd(18)} ${"SCENARIO".padEnd(12)} ${repHeaders.join("")}   RATE    AVG`);
  lines.push("-".repeat(18 + 12 + reps * 12 + 20));

  // Group by provider
  const providers = [...new Set(results.map(r => r.provider))];
  for (const pid of providers) {
    const providerResults = results.filter(r => r.provider === pid);
    const scenarios = [...new Set(providerResults.map(r => r.scenario))];

    for (const sid of scenarios) {
      const scenarioResults = providerResults.filter(r => r.scenario === sid).sort((a, b) => a.rep - b.rep);
      const label = scenarioResults[0] ? (PROVIDERS[pid]?.label ?? pid) : pid;

      const repCells = scenarioResults.map(r => {
        if (r.status === "SUCCESS") return `OK ${(r.durationMs / 1000).toFixed(1)}s`.padStart(12);
        return r.status.slice(0, 5).padStart(12);
      });

      const successes = scenarioResults.filter(r => r.status === "SUCCESS");
      const rate = `${successes.length}/${scenarioResults.length}`;
      const avg = successes.length > 0
        ? `${Math.round(successes.reduce((s, r) => s + r.durationMs, 0) / successes.length / 100) / 10}s`
        : "-";

      lines.push(`${label.padEnd(18)} ${sid.padEnd(12)} ${repCells.join("")}   ${rate.padEnd(6)} ${avg}`);
    }
    lines.push("");
  }

  // Summary
  lines.push("SUMMARY:");
  for (const pid of providers) {
    const pr = results.filter(r => r.provider === pid);
    const ok = pr.filter(r => r.status === "SUCCESS");
    const pct = Math.round(ok.length / pr.length * 100);
    const avg = ok.length > 0 ? `avg ${(ok.reduce((s, r) => s + r.durationMs, 0) / ok.length / 1000).toFixed(1)}s` : "";
    const dominant = pr.filter(r => r.status !== "SUCCESS").reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const dominantStr = Object.entries(dominant).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}:${n}`).join(" ");
    const arrow = pct < 50 ? " <<<" : "";
    lines.push(`  ${(PROVIDERS[pid]?.label ?? pid).padEnd(18)} ${String(pct).padStart(3)}% success (${ok.length}/${pr.length})  ${avg}  ${dominantStr}${arrow}`);
  }

  // Failure details
  const failures = results.filter(r => r.status !== "SUCCESS");
  if (failures.length > 0) {
    lines.push("");
    lines.push("FAILURE DETAILS:");
    for (const f of failures) {
      const label = PROVIDERS[f.provider]?.label ?? f.provider;
      lines.push(`  ${label} ${f.scenario} #${f.rep}: ${f.status} (exit=${f.exitCode}, stdout=${f.stdoutLen}B, kill=${f.killReason ?? "none"})`);
      if (f.stderrPreview) lines.push(`    stderr: ${f.stderrPreview.slice(0, 150)}`);
      if (f.stdoutPreview && f.status !== "SUCCESS") lines.push(`    stdout: ${f.stdoutPreview.slice(0, 150)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      timeout: { type: "string", default: "30000" },
      stale: { type: "string", default: "15000" },
      reps: { type: "string", default: "3" },
      providers: { type: "string", default: "" },
      scenario: { type: "string", default: "" },
      verbose: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    strict: false,
  });

  const timeoutMs = parseInt(values.timeout as string, 10);
  const staleMs = parseInt(values.stale as string, 10);
  const reps = parseInt(values.reps as string, 10);
  const verbose = values.verbose as boolean;
  const jsonOutput = values.json as boolean;

  // Select providers
  const requestedProviders = (values.providers as string)
    ? (values.providers as string).split(",").map(s => s.trim())
    : Object.keys(PROVIDERS);

  const selectedProviders = requestedProviders
    .map(id => PROVIDERS[id])
    .filter((p): p is ProviderConfig => !!p);

  if (selectedProviders.length === 0) {
    console.error(`No valid providers. Available: ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(1);
  }

  // Select scenarios
  let scenarios = buildScenarios();
  if (values.scenario) {
    scenarios = scenarios.filter(s => s.id === values.scenario);
    if (scenarios.length === 0) {
      console.error(`Unknown scenario: ${values.scenario}. Available: simple, tools, large`);
      process.exit(1);
    }
  }

  console.log("=== CLI Provider Orchestration Test ===");
  console.log(`Providers: ${selectedProviders.map(p => p.label).join(", ")}`);
  console.log(`Scenarios: ${scenarios.map(s => s.label).join(", ")}`);
  console.log(`Reps: ${reps} | Timeout: ${timeoutMs / 1000}s | Stale: ${staleMs / 1000}s`);
  console.log(`Total tests: ${selectedProviders.length * scenarios.length * reps}`);
  console.log("");

  const results = await runMatrix(selectedProviders, scenarios, reps, timeoutMs, staleMs, verbose);

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatReport(results, timeoutMs, staleMs, reps));
  }

  // Cleanup
  for (const p of selectedProviders) p.cleanup?.();

  // Exit with failure code if any test failed
  const allSuccess = results.every(r => r.status === "SUCCESS");
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
