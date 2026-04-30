# NEXT_ACTIONS.md - openclaw-cli-bridge-elvatis

_Last updated: 2026-04-30_

## Status Summary

| Status  | Count |
|---------|-------|
| Done    | 12    |
| Ready   | 0     |
| Blocked | 0     |

> **Note:** MANIFEST tracks T-001..T-017. The codebase has shipped through v3.10.7
> (April 2026) with many additional changes (Sonnet/Opus tuning, prompt routing,
> session resume policy, Codex/Gemini fixes) that were not entered as MANIFEST
> tasks. See `git log` and GitHub releases for the full history.

---

## Ready - Work These Next

_No ready tasks. All MANIFEST-tracked tasks are complete._

The next agent should either:
1. Add new tasks to `MANIFEST.json` for follow-up work (e.g. ClawHub publish of v3.10.7,
   fixing pre-existing tsc errors on Windows, addressing the 4 vitest failures), or
2. Backfill MANIFEST entries for the v3.x work that has already shipped, so the
   handoff state matches the release history.

---

## Blocked

_No blocked tasks._

---

## Recently Completed

| Task  | Title                                                                  | Date       |
|-------|------------------------------------------------------------------------|------------|
| T-010 | Publish v0.2.25 to GitHub + npm + ClawHub (closed by supersession)     | 2026-04-30 |
| T-017 | Fix log spam, restart loops, CLI blocking                              | 2026-04-09 |
| T-011 | Session-safe staged model switching (/cli-apply, /cli-pending, --now)  | 2026-03-11 |
| T-009 | Stability: sleep-resilient token refresh + stopTokenRefresh cleanup    | 2026-03-11 |
| T-008 | Validate proxy endpoints + vllm model calls end-to-end                 | 2026-03-08 |
