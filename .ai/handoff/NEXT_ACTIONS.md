# NEXT_ACTIONS.md - openclaw-cli-bridge-elvatis

_Last updated: 2026-04-15_

## Status Summary

| Status  | Count |
|---------|-------|
| Done    | 30    |
| Ready   | 3     |
| Blocked | 1     |

---

## Ready - Work These Next

| Task | Title | Priority |
|------|-------|----------|
| T-030 | Fix Codex CLI tool prompt compatibility (crashes on startup) | High |
| T-031 | Re-enable prompt routing when Codex CLI is stable | Medium |
| T-032 | Add `/bridge-help` slash command with routing guide | Low |

---

## Blocked

| Task | Title | Blocked by |
|------|-------|------------|
| T-033 | Agent delegation for multi-turn skill execution | OpenClaw needs `openclaw agent --multi-turn` or `openclaw skill run` |

---

## Recently Completed (v3.x)

| Task | Title | Date |
|------|-------|------|
| T-029 | Gemini session resume disabled + YOLO stderr filter (v3.10.3) | 2026-04-15 |
| T-028 | Routing disabled, Codex cwd + session fix (v3.10.2) | 2026-04-15 |
| T-027 | Cross-provider routing only (v3.10.1) | 2026-04-15 |
| T-026 | Intelligent prompt routing ported from elvatis-mcp (v3.10.0) | 2026-04-15 |
| T-025 | Sonnet 60s stale timeout + task payload rescue (v3.9.1) | 2026-04-15 |
| T-024 | Full changelog + docs update (v3.9.0) | 2026-04-13 |
| T-023 | JSON newline sanitization (v3.8.2) | 2026-04-13 |
| T-022 | Log rotation 1MB (v3.8.1) | 2026-04-13 |
| T-021 | ROOT CAUSE: Claude cwd=homedir() + orchestration test (v3.8.0) | 2026-04-13 |
| T-020 | Opus escalation, session resume overhaul, skill detection (v3.7.0) | 2026-04-12 |
