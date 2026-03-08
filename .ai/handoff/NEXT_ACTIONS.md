# NEXT_ACTIONS.md — openclaw-cli-bridge-elvatis

_Last updated: 2026-03-08_

## Status Summary

| Status  | Count |
|---------|-------|
| Done    | 8     |
| Ready   | 1     |
| Blocked | 0     |

---

## ⚡ Ready — Work These Next

### T-009: [medium] — Publish to npm + ClawHub

- **Goal:** Publish the next release to all distribution channels (GitHub, npm, ClawHub).
- **Context:** All providers are validated end-to-end. 28 automated tests pass (unit + e2e proxy). The codebase is stable at v0.2.15. If changes were made since the last publish, bump the version first.
- **What to do:**
  1. Check if any code changes since v0.2.15 warrant a version bump
  2. If bumping: update version in `package.json`, `openclaw.plugin.json`, `README.md`, `SKILL.md`, `STATUS.md` (see CONVENTIONS.md release checklist)
  3. Run `npm run typecheck && npm test` — must pass
  4. `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`
  5. `gh release create vX.Y.Z --title "..." --notes "..."`
  6. `npm publish --access public`
  7. ClawHub publish via rsync workaround (see CONVENTIONS.md)
  8. Update all handoff docs (STATUS.md, DASHBOARD.md, LOG.md, NEXT_ACTIONS.md, README.md, SKILL.md)
- **Files:** `package.json`, `openclaw.plugin.json`, `README.md`, `SKILL.md`, `.ai/handoff/STATUS.md`, `.ai/handoff/CONVENTIONS.md`
- **Definition of done:** Package published on npm + ClawHub at matching version. GitHub release created. All docs updated.

---

## 🚫 Blocked

_No blocked tasks._

---

## ✅ Recently Completed

| Task  | Title                                                        | Date       |
|-------|--------------------------------------------------------------|------------|
| T-008 | Validate proxy endpoints + vllm model calls end-to-end       | 2026-03-08 |
| T-007 | Create GitHub repo and push initial code                     | 2026-03-07 |
| T-006 | Implement Claude Code CLI request bridge                     | 2026-03-07 |
| T-005 | Implement Gemini CLI request bridge                          | 2026-03-07 |
| T-004 | Verify model call: test gpt-5.2 or gpt-5.3-codex responds   | 2026-03-07 |
