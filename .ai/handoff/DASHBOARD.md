# DASHBOARD.md - openclaw-cli-bridge-elvatis

_Last updated: 2026-04-15_

## Plugin Status

| Component | Version | Build | Tests | Status |
|-----------|---------|-------|-------|--------|
| openclaw-cli-bridge-elvatis | 3.10.4 | OK (22 pre-existing TS errors) | 292/292 pass | Stable |

## Release State

| Platform | Published Version | Status |
|----------|------------------|--------|
| GitHub | v3.10.4 | Pushed to main |
| npm | 3.10.4 | Pending (via CI) |
| ClawHub | 3.10.4 | Pending (via CI) |
| Dashboard | v3.10.4 | Live at http://127.0.0.1:31337/status |

## Provider Health (orchestration test 2026-04-13)

| Provider | Success rate | Avg latency |
|----------|-------------|-------------|
| Claude/Opus | 100% (6/6) | 7.2s |
| Claude/Sonnet | 100% (6/6) | 5.2s |
| Claude/Haiku | 100% (6/6) | 3.2s |
| Gemini/Flash | 100% (6/6) | 7.2s |
| Codex/GPT-5.3 | 100% (6/6) | 5.4s |

## Live session test (2026-04-15)

15 consecutive clean responses, zero failures:
- Sonnet: 3.4s to 17.0s (tool calls + content)
- Gemini Pro: 10.7s, 24.9s (tool call + content)
- Mixed: 44 msgs deep without a single hang

## Open Tasks

| Task | Title | Priority |
|------|-------|----------|
| T-030 | Fix Codex CLI tool prompt compatibility | High |
| T-031 | Re-enable prompt routing | Medium |
| T-032 | Add `/bridge-help` slash command | Low |
| T-033 | Agent delegation (blocked on OpenClaw) | Blocked |

## Key Files

| File | Purpose |
|------|---------|
| src/cli-runner.ts | CLI subprocess spawn, timeout, stale detection |
| src/proxy-server.ts | HTTP proxy, fallback chain, SSE streaming |
| src/tool-protocol.ts | Tool schema injection, JSON response parsing |
| src/prompt-router.ts | Routing rules (disabled), matchRules(), detectOptimalModel() |
| src/config.ts | All timeouts, thresholds, fallback chains |
| src/debug-log.ts | File-based log with 1MB rotation |
| test/orchestration-test.ts | Real CLI provider diagnostic (npx tsx) |
| test/prompt-router.test.ts | 14 routing rule tests |
