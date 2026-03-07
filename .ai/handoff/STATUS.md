# STATUS.md — openclaw-cli-bridge

_Last updated: 2026-03-07 by claude-sonnet-4-6_

## Phase: Implementation (T-002 done, T-003 next)

## What's Done

- ✅ Project folder created at `~/.openclaw/workspace/openclaw-cli-bridge/`
- ✅ AAHP handoff structure at `.ai/handoff/`
- ✅ `package.json`, `tsconfig.json` (ESM, strict, Node16)
- ✅ `openclaw.plugin.json` — registers provider `openai-codex`
- ✅ `src/codex-auth.ts` — reads `~/.codex/auth.json`, extracts OAuth tokens
- ✅ `index.ts` — plugin entry, registers `openai-codex` via `api.registerProvider()`
- ✅ TypeScript typecheck passes (0 errors)
- ✅ Plugin wired into `~/.openclaw/openclaw.json` (allow + load.paths + entries)
- ✅ Gateway restarted, no plugin errors

## Current State

Plugin is loaded by OpenClaw. The `openai-codex` provider is now registered.
Auth has NOT been tested yet — need to run `openclaw models auth login --provider openai-codex`.

## Known Issues / Risks

- Token refresh: `refreshOAuth` re-reads `~/.codex/auth.json`. Relies on Codex CLI having auto-refreshed. If the token expires mid-session and Codex hasn't been run recently, calls will fail until Codex auto-refreshes.
- Model routing: unconfirmed whether OpenClaw has built-in routing for `openai-codex` models once the provider is registered. If not, we need to implement a custom model request handler.
- `gpt-5.4` earlier had a `model.request` scope issue — this may be a ChatGPT subscription tier restriction, not just an auth issue.
