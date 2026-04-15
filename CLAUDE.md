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
- **Workspace project auto-detection** — scans `~/.openclaw/workspace/` for project directories; when the prompt contains an exact match of a project name (from user messages only), auto-sets `workdir` and injects context
- **Opus escalation** — when conversations exceed 20 messages with tools, automatically routes from Sonnet to Opus. Opus handles large contexts reliably (94% success vs Sonnet's 55%)
- **Opus 90s stale timeout** — Opus gets 90s stale-output timeout (vs 30s for Sonnet) to allow time for long-form generation (blog posts, Lexical JSON)
- **Session resume: Opus only** — Sonnet/Haiku use fresh `claude -p` every call (session resume caused 45% hang rate). Opus uses `--session-id`/`--resume` for context continuity
- **Generic skill auto-detection** — scans `~/.openclaw/skills/` for SKILL.md files, injects pointers when prompt matches a skill name. Fully generic, works with any installed skill
- **First user message pinning** — original user request is always included in the prompt window, even when conversation exceeds MAX_MESSAGES
- **Haiku skip in tool loops** — fallback chain skips Haiku when tool_calls are expected (Haiku consistently returns text instead of tool_calls in tool loops)
- **Improved JSON parser** — tries multiple `{` positions for embedded JSON, rescue-from-raw strategy, handles malformed tool_calls from fallback models
- **Intelligent prompt routing** — keyword-based model selection: code tasks to Codex, research to Gemini, complex reasoning to Opus, simple tasks to Haiku. Routing rules ported from [elvatis-mcp](https://github.com/elvatis/elvatis-mcp). Only reroutes on strong signals (score >= 2, clear winner).

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

## Prompt Routing (src/prompt-router.ts)

Keyword-based model routing ported from [elvatis-mcp](https://github.com/elvatis/elvatis-mcp).
Analyzes user message content and routes to the best model for the task.

| Keywords | Routed model | Reason |
|----------|-------------|--------|
| code, debug, refactor, typescript, python, shell, bash | Codex (gpt-5.3) | Purpose-built for coding |
| summarize, analyze, research, document, pdf, image | Gemini Flash | 1M context, multimodal |

Cross-provider only: routes to Codex or Gemini when there is a clear advantage. Claude-to-Claude rerouting (Sonnet/Opus/Haiku) is handled by the OpenClaw gateway, which has 60+ models with direct API access. Only reroutes when top match has score >= 2 AND >= 2x the runner-up. Debug log: `[ROUTE]`.
| `WORKSPACE_DIR` | `~/.openclaw/workspace` | Project directory scanned for auto-detection |

## Tool Protocol (src/tool-protocol.ts)

Models receive tool schemas as text and must respond with:
- `{"tool_calls":[{"name":"...","arguments":{...}}]}` — to call a tool
- `{"content":"..."}` — to respond with text

Parser tries 5 strategies: Claude JSON wrapper, direct JSON, code blocks, embedded JSON, rescue from content string. Debug logging on every path.

## Known Issues

- **Sonnet intermittent hangs** — `claude -p` with Sonnet goes completely silent (~45% of requests). Session resume makes it worse (corrupted sessions after SIGTERM). Workaround: session resume disabled for Sonnet (fresh `-p` every call), auto-escalate to Opus at 20+ messages. Opus has ~94% success rate.
- **Sonnet session resume disabled** — session resume caused corrupted sessions when SIGTERM killed processes. Only Opus uses `--session-id`/`--resume` now. Sonnet/Haiku send the full prompt every time (more tokens, but reliable).
- **Claude cwd must be homedir() (v3.8.0 ROOT CAUSE)** — running `claude -p` from a project directory triggers Claude Code's agentic mode, which ignores tool injection and treats it as "prompt injection". This was the root cause of the 90% Sonnet failure rate. Fix: Claude always runs from `homedir()`. Orchestration test: 30/30 pass from homedir.
- **Haiku unreliable for tool_calls** — returns text instead of tool_calls ~80% of the time in tool loops. Skipped in fallback chain when tools are expected.
- **Long-form generation limit** — generating 15KB+ responses (blog posts as Lexical JSON) can exceed even Opus's 90s stale timeout. The `claude -p` CLI sometimes goes silent during long generation. No workaround from the bridge side.
- **Agent delegation (disabled)** — infrastructure for delegating skills to `openclaw agent` is built but disabled. `openclaw agent` is single-turn only; multi-turn skill execution needs OpenClaw-side support.
- **Pre-existing tsc errors** — errors about `openclaw/plugin-sdk` module not found. Expected — the SDK is injected at runtime by the gateway. Dist output is still generated.

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
