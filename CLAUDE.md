# OpenClaw CLI Bridge

## Project Overview

OpenClaw plugin that bridges AI CLIs (Claude, Gemini, Codex, Grok, ChatGPT) as model providers via a local OpenAI-compatible HTTP proxy on `127.0.0.1:31337`. The gateway routes `vllm/` model requests here; the bridge spawns CLI subprocesses and translates between OpenAI protocol and CLI text I/O.

## Architecture

```
OpenClaw Gateway ──(HTTP)──> proxy-server.ts ──(spawn)──> claude/gemini/codex CLI
                   :31337      │
                               ├── cli-runner.ts      (subprocess spawn, stdin prompt, timeout, stale-output detection)
                               ├── tool-protocol.ts   (tool schema injection, JSON response parsing, tool_calls rescue)
                               ├── config.ts          (all timeouts, thresholds, paths — single source of truth)
                               ├── debug-log.ts       (file-based log: ~/.openclaw/cli-bridge/debug.log)
                               ├── metrics.ts         (request metrics, persisted to ~/.openclaw/cli-bridge/metrics.json)
                               ├── provider-sessions.ts (persistent session registry per model)
                               ├── status-template.ts (HTML dashboard at GET /status)
                               ├── session-manager.ts (long-running session spawn/poll/kill)
                               ├── *-browser.ts       (Playwright web-session providers: Grok, Gemini, Claude, ChatGPT)
                               └── gemini-api-runner.ts (native Gemini API via @google/genai SDK)
```

## Key Design Decisions

- **Prompt via stdin, never CLI args** — avoids E2BIG on large sessions
- **Tool calls via text injection** — CLI tools don't support native tool_use, so tool schemas are injected into the prompt text and responses are parsed for JSON
- **JSON reminder sandwich** — tool instructions appear at start AND end of prompt; models (especially Haiku) forget format instructions after long conversations
- **Stale-output detection** — if a CLI subprocess produces zero stdout for 30s, SIGTERM early instead of waiting full timeout. Claude Sonnet intermittently hangs silently on large tool prompts (API-side issue, not RAM — confirmed 28GB free, zero swap)
- **Smart fallback** — Sonnet tries first (better tool selection), 30s stale timeout kills it fast, Haiku takes over (~10s, reliable but picks wrong tools sometimes)
- **Compact tool schema** — when >8 tools, only send name+params (skip descriptions/full JSON schema), cuts prompt ~60%
- **Exit 143 = our SIGTERM** — not OOM, not crash. The bridge's timeout/stale-output detector sends SIGTERM, Claude CLI exits 143
- **Consecutive timeout rotation** — after 3 timeouts in a row on the same session, auto-expire it and create a fresh one. Prevents poisoned sessions from blocking all requests
- **Workspace project auto-detection** — scans `~/.openclaw/workspace/` for project directories; when the prompt contains an exact match of a project name, auto-sets `workdir` and injects `[Context: Working directory is ...]` into the prompt

## Build & Test

```bash
npm run build    # tsc — always has 5 pre-existing errors (openclaw/plugin-sdk not found at compile time, only at runtime). Dist output is still generated correctly.
npx vitest run   # 278+ tests across 19 files. All must pass.
```

## Deploy Workflow

The gateway loads plugins from `~/.openclaw/extensions/`, NOT from this workspace:

```bash
npm run build
rsync -a --exclude node_modules --exclude .git ./ ~/.openclaw/extensions/openclaw-cli-bridge-elvatis/
openclaw gateway restart
```

## Version Bump Checklist

Bump version string in 4 files before every release:
1. `package.json`
2. `openclaw.plugin.json`
3. `README.md` (line 5: "Current version")
4. `SKILL.md` (last line: "Version:")

Then: `git commit && git push && gh release create vX.Y.Z`

## Config (src/config.ts)

All magic numbers live here. Key values:

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_EFFECTIVE_TIMEOUT_MS` | 580s | Must stay UNDER gateway's `idleTimeoutSeconds` (600s) |
| `STALE_OUTPUT_TIMEOUT_MS` | 30s | Kill silent CLI processes fast |
| `TOOL_HEAVY_THRESHOLD` | 10 | Reduce MAX_MESSAGES from 20 to 12 when tools exceed this |
| `COMPACT_TOOL_THRESHOLD` | 8 | Switch to compact tool schema (name+params only) |
| `TOOL_ROUTING_THRESHOLD` | 8 | (in proxy-server) Was used for Haiku routing, now Sonnet-first with fast fallback |
| `CONSECUTIVE_TIMEOUT_LIMIT` | 3 | (in cli-runner) Auto-expire session after N consecutive timeouts |
| `WORKSPACE_DIR` | `~/.openclaw/workspace` | Project directory scanned for auto-detection |

## Tool Protocol (src/tool-protocol.ts)

Models receive tool schemas as text and must respond with:
- `{"tool_calls":[{"name":"...","arguments":{...}}]}` — to call a tool
- `{"content":"..."}` — to respond with text

Parser tries 5 strategies: Claude JSON wrapper, direct JSON, code blocks, embedded JSON, rescue from content string. Debug logging on every path.

## Known Issues

- **Sonnet intermittent hangs** — `claude -p` with Sonnet goes completely silent (~50% of the time) on large tool prompts (20KB+). First call often works, subsequent calls hang. NOT RAM-related. Likely API-side rate limiting or request dedup. Workaround: 30s stale-output detection + Haiku fallback.
- **Haiku empty responses** — occasionally returns zero stdout (len:0). Cause unclear. The JSON reminder at prompt end helps but doesn't fully solve it.
- **Pre-existing tsc errors** — 5 errors about `openclaw/plugin-sdk` module not found. These are expected — the SDK is injected at runtime by the gateway. Dist output is still generated.

## Testing

```bash
npx vitest run                    # full suite (278+ tests)
npx vitest run test/config.test.ts  # just config
npx vitest run test/proxy-e2e.test.ts  # proxy integration
```

Tests that mock `config.js` must use `importOriginal` spread pattern — the mock must include all exports since `debug-log.ts` and `cli-runner.ts` import from config at module level.

## Debug

```bash
tail -f ~/.openclaw/cli-bridge/debug.log     # real-time request lifecycle
curl http://127.0.0.1:31337/status           # dashboard (auto-refresh 10s)
cat ~/.openclaw/cli-bridge/metrics.json      # persisted metrics
cat ~/.openclaw/cli-bridge/sessions.json     # provider session state
```

## Roadmap (v3.0)

- [ ] Dashboard v2: sidebar navigation, live log viewer, model config editor, routing visualization
- [ ] User-configurable routing engine via dashboard UI
- [ ] Multi-model fallback chains: Claude → Gemini → Codex → Haiku
- [ ] Per-tool routing: write/exec → fast model, search/analyze → smart model
- [ ] Model health scoring: track success rates, auto-demote unreliable models
- [ ] Session resume: use `claude --resume` for conversation continuity instead of fresh `-p` each time
