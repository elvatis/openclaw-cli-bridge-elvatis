# STATUS.md — openclaw-cli-bridge-elvatis

_Last updated: 2026-03-08 by Akido (claude-sonnet-4-6)_

## Current Version: 0.2.19 — STABLE

## What is done

- ✅ Repo: `https://github.com/elvatis/openclaw-cli-bridge-elvatis`
- ✅ npm: `@@@@elvatis_com/openclaw-cli-bridge-elvatis@0.2.19`
- ✅ ClawHub: `openclaw-cli-bridge-elvatis@0.2.19`
- ✅ Phase 1: `openai-codex` provider via `~/.codex/auth.json` (no re-login)
- ✅ Phase 2: Local OpenAI-compatible proxy on `127.0.0.1:31337` (Gemini + Claude CLI)
- ✅ Phase 3: 10 slash commands (`/cli-sonnet`, `/cli-opus`, `/cli-haiku`, `/cli-gemini`, `/cli-gemini-flash`, `/cli-gemini3`, `/cli-codex`, `/cli-codex-mini`, `/cli-back`, `/cli-test`)
- ✅ Config patcher: auto-adds vllm provider to `openclaw.json` on first startup
- ✅ Prompt delivery via stdin (no E2BIG, no Gemini agentic mode)
- ✅ `registerService` stop() hook: closes proxy server on plugin teardown
- ✅ `requireAuth: false` on all commands — webchat + WhatsApp authorized via gateway `commands.allowFrom`
- ✅ `vllm/` prefix stripping in `routeToCliRunner` — accepts both `vllm/cli-claude/...` and bare `cli-claude/...`
- ✅ End-to-end tested (2026-03-08): claude-sonnet-4-6 ✅ claude-haiku-4-5 ✅ gemini-2.5-flash ✅ gemini-2.5-pro ✅ codex ✅

## Known Operational Notes

- **Claude CLI auth expires** — token lifetime ~90 days. When `/cli-test` returns 401, run `claude auth login` on the server to refresh.
- Config patcher writes `openclaw.json` directly → triggers one gateway restart on first install (expected, one-time only)
- ClawHub publish ignores `.clawhubignore` — use rsync workaround (see CONVENTIONS.md)

## Bugs Fixed

### v0.2.14 — vllm/ prefix not stripped in model router
`routeToCliRunner` received full provider path `vllm/cli-claude/...` from OpenClaw
but only checked for `cli-claude/...` — caused "Unknown CLI bridge model" on all requests.
Fixed by stripping the `vllm/` prefix before routing.

### v0.2.13 — requireAuth blocking webchat commands
All `/cli-*` commands had `requireAuth: true`. Plugin-level auth checks `isAuthorizedSender`
via a different resolution path than `commands.allowFrom` config — webchat senders were
never authorized. Fixed by setting `requireAuth: false`; gateway-level `commands.allowFrom`
is the correct security layer.

### v0.2.9 — Critical: Gateway SIGKILL via fuser
`fuser -k 31337/tcp` was sending SIGKILL to the gateway process itself during
in-process hot-reloads. Fixed by replacing `fuser -k` with a safe health probe.

### v0.2.7–v0.2.8 — EADDRINUSE on hot-reload
Added `closeAllConnections()` + `registerService` stop() hook.

### v0.2.6 — Port leak on gateway hot-reload
HTTP proxy server had no cleanup handler.
