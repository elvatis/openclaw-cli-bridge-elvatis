# STATUS - openclaw-cli-bridge-elvatis

## Current Version: 3.10.4

- **npm:** @elvatis_com/openclaw-cli-bridge-elvatis@3.10.4
- **ClawHub:** openclaw-cli-bridge-elvatis@3.10.4
- **GitHub:** https://github.com/elvatis/openclaw-cli-bridge-elvatis (pushed to main)
- **Dashboard:** http://127.0.0.1:31337/status

## Architecture

- **Proxy server:** `http://127.0.0.1:31337/v1` (OpenAI-compatible)
- **OpenClaw connects via** `vllm` provider with `api: openai-completions`
- **CLI models** (`cli-claude/*`, `cli-gemini/*`, `openai-codex/*`): tool calling via prompt injection + JSON parsing
- **Web-session models** (`web-grok/*`, `web-gemini/*`): browser-based, require `/xxx-login`
- **Codex models** (`openai-codex/*`): OAuth auth bridge
- **BitNet** (`local-bitnet/*`): local CPU inference

## Key Design Decisions (v3.x)

- **Claude cwd = homedir()** (v3.8.0 ROOT CAUSE): running from project dirs triggers agentic mode, 90% failure rate. Fixed.
- **Session resume: Opus only** (v3.10.3): all other providers use fresh calls. Stale sessions after SIGTERM cause failures across all CLIs.
- **Sonnet 60s stale timeout** (v3.9.1): real-world tool reasoning with 21 tools takes 28-50s
- **Opus 90s stale timeout** (v3.7.0): long-form generation needs think time
- **Prompt routing** (v3.10.0, disabled v3.10.2): keyword-based routing to Codex/Gemini. Infrastructure in `src/prompt-router.ts`, disabled because Codex CLI crashes on tool-injected prompts.
- **Generic skill auto-detection** (v3.6.0): scans `~/.openclaw/skills/` for SKILL.md files
- **First user message pinning** (v3.5.0): original request survives prompt windowing
- **Haiku skip in tool loops** (v3.5.0): Haiku returns text instead of tool_calls ~80% of the time
- **Task payload rescue** (v3.9.1): detects subagent payloads in `{"content":"..."}` and converts to tool_calls
- **JSON newline sanitization** (v3.8.2): models output raw 0x0A in JSON strings

## Session Resume Policy

| Provider | Session resume | Failure mode |
|----------|---------------|-------------|
| Opus | Enabled | Reliable |
| Sonnet/Haiku | Disabled | 45% hang rate on corrupted sessions |
| Gemini | Disabled | Exit 42 on stale sessions |
| Codex | Disabled | "no rollout found" errors |

## Fallback Chain

- Sonnet: Opus, Gemini Flash, Codex
- Opus: Sonnet, Gemini Pro, Haiku

## Stats

- 292 unit tests across 20 files (all passing)
- 30/30 orchestration test across 5 providers
- 22+ total models (7 CLI + 5 Codex + 4 Grok + 4 Gemini + 1 BitNet)
- Log rotation at 1MB with 2 backup files

## Release History (v3.x)

| Version | Date | Highlights |
|---------|------|-----------|
| v3.10.4 | 2026-04-15 | Full changelog update, session resume policy docs |
| v3.10.3 | 2026-04-15 | Gemini session resume disabled, YOLO stderr filtered |
| v3.10.2 | 2026-04-15 | Routing disabled, Codex cwd + session fix |
| v3.10.1 | 2026-04-15 | Cross-provider routing only |
| v3.10.0 | 2026-04-15 | Prompt routing ported from elvatis-mcp |
| v3.9.1 | 2026-04-15 | Sonnet 60s stale, task payload rescue |
| v3.9.0 | 2026-04-13 | Full changelog v3.4.0-v3.8.2 |
| v3.8.2 | 2026-04-13 | JSON newline sanitization |
| v3.8.1 | 2026-04-13 | Log rotation 1MB |
| v3.8.0 | 2026-04-13 | ROOT CAUSE: cwd=homedir(), orchestration test |
| v3.7.0 | 2026-04-12 | Opus escalation, session overhaul, skill detection |
| v3.6.0 | 2026-04-12 | Generic skill auto-detection |
| v3.5.0 | 2026-04-12 | First-user-message pinning, Haiku skip |
| v3.4.0 | 2026-04-12 | Workspace detection, timeout rotation |
| v3.3.0 | 2026-04-12 | Session resume for all providers |
| v3.0.0 | 2026-04-12 | Dashboard v2 |

## Known Issues

- **Codex CLI crashes** on tool-injected prompts (exit 1 on startup). Codex routing disabled.
- **Gemini CLI exit 42** on stale sessions. Fixed by disabling session resume.
- **Long-form generation** (15KB+ Lexical JSON) can exceed Opus's 90s stale timeout.
- **Agent delegation disabled**: `openclaw agent` is single-turn only.
