# STATUS.md — openclaw-cli-bridge-elvatis

_Last updated: 2026-03-07 by Akido (claude-sonnet-4-6)_

## Current Version: 0.2.11 — STABLE

## What is done

- ✅ Repo: `https://github.com/elvatis/openclaw-cli-bridge-elvatis`
- ✅ npm: `@elvatis_com/openclaw-cli-bridge-elvatis@0.2.11`
- ✅ ClawHub: `openclaw-cli-bridge-elvatis@0.2.11`
- ✅ Phase 1: `openai-codex` provider via `~/.codex/auth.json` (no re-login)
- ✅ Phase 2: Local OpenAI-compatible proxy on `127.0.0.1:31337` (Gemini + Claude CLI)
- ✅ Phase 3: 10 slash commands (`/cli-sonnet`, `/cli-opus`, `/cli-haiku`, `/cli-gemini`, `/cli-gemini-flash`, `/cli-gemini3`, `/cli-codex`, `/cli-codex-mini`, `/cli-back`, `/cli-test`)
- ✅ Config patcher: auto-adds vllm provider to `openclaw.json` on first startup
- ✅ Prompt delivery via stdin (no E2BIG, no Gemini agentic mode)
- ✅ `registerService` stop() hook: closes proxy server on plugin teardown (fixes EADDRINUSE on hot-reload)
- ✅ `openclaw.extensions` added to `package.json` (required for `openclaw plugins install`)

## Bugs Fixed

### v0.2.9 — Critical: Gateway SIGKILL via fuser
`fuser -k 31337/tcp` was sending SIGKILL to the gateway process itself during
in-process hot-reloads. The gateway holds port 31337 (via the proxy it spawned),
so `fuser` found it and killed it — explaining `status=9/KILL` in systemd journal.
Fixed by replacing `fuser -k` with a safe health probe (`GET /v1/models`): if the
existing proxy responds, reuse it silently. If EADDRINUSE but no response, wait 1s
and retry once. No process killing involved.

### v0.2.7–v0.2.8 — EADDRINUSE on hot-reload (partially fixed, superseded by v0.2.9)
Added `closeAllConnections()` + `registerService` stop() hook. Port still leaked
during systemd restarts due to race condition. v0.2.9 health-probe approach is the
definitive fix.

### v0.2.6 — Port leak on gateway hot-reload
HTTP proxy server had no cleanup handler. Fixed with `registerService` stop() callback.

## Open Risks

- `openai-codex/gpt-5.4` returns 401 missing scope `model.request` — external (OpenAI account scope), not plugin code
- Config patcher writes `openclaw.json` directly → triggers one gateway restart on first install (expected, one-time only)
- ClawHub publish ignores `.clawhubignore` — use rsync workaround (see CONVENTIONS.md)
