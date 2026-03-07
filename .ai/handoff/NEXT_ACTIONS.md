# NEXT_ACTIONS.md — openclaw-cli-bridge-elvatis

_Last updated: 2026-03-07_

## Status Summary

| Status | Count |
|--------|-------|
| Done   | 6     |
| Ready  | 3     |
| Blocked | 0   |

---

## Ready — Work These Next

### T-101: [medium] — Unit tests for prompt formatter + model router
- **Goal:** Cover `src/cli-runner.ts` message formatting and model routing logic with vitest tests.
- **Files:** `test/cli-runner.test.ts`, `src/cli-runner.ts`
- **Definition of done:** Prompt truncation, stdin format, and model→CLI mapping covered by tests.

### T-102: [low] — Proxy auth key rotation via config
- **Goal:** Allow `proxyApiKey` to be rotated without code change via config reload.
- **Files:** `index.ts`, `src/proxy-server.ts`

### T-103: [low] — Explicit model allowlist for CLI execution
- **Goal:** Config-driven allowlist of which model IDs are permitted to spawn CLI subprocesses.
- **Files:** `index.ts`, `src/cli-runner.ts`

---

## Recently Completed

| Task | Title | Date |
|------|-------|------|
| T-007 | Critical: remove fuser -k, safe proxy reuse via health probe | 2026-03-08 |
| T-006 | Fix port leak: registerService stop() hook + closeAllConnections | 2026-03-07 |
| T-005 | Add openclaw.extensions to package.json | 2026-03-07 |
| T-004 | /cli-codex + /cli-codex-mini | 2026-03-07 |
| T-003 | /cli-back + /cli-test | 2026-03-07 |
| T-002 | /cli-* model switch commands | 2026-03-07 |
| T-001 | Phase 1+2: auth + proxy + config patcher | 2026-03-07 |
