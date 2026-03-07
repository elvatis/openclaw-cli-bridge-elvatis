# STATUS.md — openclaw-cli-bridge-elvatis

_Last updated: 2026-03-07 by Akido (claude-sonnet-4-6)_

## Current Version: 0.2.7 — STABLE

## What is done

- ✅ Repo: `https://github.com/elvatis/openclaw-cli-bridge-elvatis`
- ✅ npm: `@elvatis_com/openclaw-cli-bridge-elvatis@0.2.6`
- ✅ ClawHub: `openclaw-cli-bridge-elvatis@0.2.6`
- ✅ Phase 1: `openai-codex` provider via `~/.codex/auth.json` (no re-login)
- ✅ Phase 2: Local OpenAI-compatible proxy on `127.0.0.1:31337` (Gemini + Claude CLI)
- ✅ Phase 3: 10 slash commands (`/cli-sonnet`, `/cli-opus`, `/cli-haiku`, `/cli-gemini`, `/cli-gemini-flash`, `/cli-gemini3`, `/cli-codex`, `/cli-codex-mini`, `/cli-back`, `/cli-test`)
- ✅ Config patcher: auto-adds vllm provider to `openclaw.json` on first startup
- ✅ Prompt delivery via stdin (no E2BIG, no Gemini agentic mode)
- ✅ `registerService` stop() hook: closes proxy server on plugin teardown (fixes EADDRINUSE on hot-reload)
- ✅ `openclaw.extensions` added to `package.json` (required for `openclaw plugins install`)

## Bug Fixed (v0.2.6)

**Port leak on gateway hot-reload** — HTTP proxy server on port 31337 had no cleanup
handler. On hot-reloads the old server kept the port bound, causing EADDRINUSE.
Fixed with `registerService` stop() callback.

## Open Risks

- `openai-codex/gpt-5.4` returns 401 missing scope `model.request` — external (OpenAI account scope), not plugin code
- Config patcher writes `openclaw.json` directly → triggers one gateway restart on first install (expected, one-time only)
- ClawHub publish ignores `.clawhubignore` — use rsync workaround (see CONVENTIONS.md)
