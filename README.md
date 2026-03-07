# openclaw-cli-bridge-elvatis

> OpenClaw plugin that bridges locally installed AI CLIs (Codex, Gemini, Claude Code) as model providers — with slash commands for instant model switching.

**Current version:** `0.2.2`

---

## What it does

### Phase 1 — Auth bridge (`openai-codex`)
Registers the `openai-codex` provider by reading OAuth tokens already stored by the Codex CLI (`~/.codex/auth.json`). No re-login needed.

### Phase 2 — Request bridge (local proxy)
Starts a local OpenAI-compatible HTTP proxy on `127.0.0.1:31337` and configures OpenClaw's `vllm` provider to route calls through `gemini` and `claude` CLI subprocesses.

Prompt delivery: always via **stdin** (not CLI args) — avoids `E2BIG` for long sessions. Each message batch is truncated to the last 20 messages + system message (configurable in `src/cli-runner.ts`).

| Model reference | CLI invoked |
|---|---|
| `vllm/cli-gemini/gemini-2.5-pro` | `gemini -m gemini-2.5-pro @<tmpfile>` |
| `vllm/cli-gemini/gemini-2.5-flash` | `gemini -m gemini-2.5-flash @<tmpfile>` |
| `vllm/cli-gemini/gemini-3-pro` | `gemini -m gemini-3-pro @<tmpfile>` |
| `vllm/cli-claude/claude-sonnet-4-6` | `claude -p --output-format text --model claude-sonnet-4-6` (stdin) |
| `vllm/cli-claude/claude-opus-4-6` | `claude -p --output-format text --model claude-opus-4-6` (stdin) |
| `vllm/cli-claude/claude-haiku-4-5` | `claude -p --output-format text --model claude-haiku-4-5` (stdin) |

### Phase 3 — Slash commands
Six plugin-registered commands for instant model switching (no agent invocation needed):

| Command | Switches to |
|---|---|
| `/cli-sonnet` | `vllm/cli-claude/claude-sonnet-4-6` |
| `/cli-opus` | `vllm/cli-claude/claude-opus-4-6` |
| `/cli-haiku` | `vllm/cli-claude/claude-haiku-4-5` |
| `/cli-gemini` | `vllm/cli-gemini/gemini-2.5-pro` |
| `/cli-gemini-flash` | `vllm/cli-gemini/gemini-2.5-flash` |
| `/cli-gemini3` | `vllm/cli-gemini/gemini-3-pro` |

All commands require `requireAuth: true` — only authorized/owner senders can execute them. Each command calls `openclaw models set <model>` via `api.runtime.system.runCommandWithTimeout` and replies with a confirmation.

---

## Requirements

- [OpenClaw](https://openclaw.ai) gateway (tested with `2026.3.x`)
- One or more of:
  - [`@openai/codex`](https://github.com/openai/codex) — `npm i -g @openai/codex` + `codex login`
  - [`@google/gemini-cli`](https://github.com/google-gemini/gemini-cli) — `npm i -g @google/gemini-cli` + `gemini auth`
  - [`@anthropic-ai/claude-code`](https://github.com/anthropic-ai/claude-code) — `npm i -g @anthropic-ai/claude-code` + `claude auth`

---

## Installation

```bash
# From ClawHub
clawhub install openclaw-cli-bridge-elvatis

# Or from workspace (development / local path)
# Add to ~/.openclaw/openclaw.json:
# plugins.load.paths: ["~/.openclaw/workspace/openclaw-cli-bridge-elvatis"]
# plugins.entries.openclaw-cli-bridge-elvatis: { "enabled": true }
```

---

## Setup

### 1. Enable + restart

```bash
# In ~/.openclaw/openclaw.json → plugins.entries:
"openclaw-cli-bridge-elvatis": { "enabled": true }

openclaw gateway restart
```

### 2. Register Codex auth (Phase 1, optional)

```bash
openclaw models auth login --provider openai-codex
# Select: "Codex CLI (existing login)"
```

### 3. Verify proxy (Phase 2)

On startup the plugin auto-patches `openclaw.json` with the `vllm` provider config (port `31337`) and logs:

```
[cli-bridge] proxy ready — vllm/cli-gemini/* and vllm/cli-claude/* available
[cli-bridge] registered 6 slash commands: /cli-sonnet, /cli-opus, /cli-haiku, /cli-gemini, /cli-gemini-flash, /cli-gemini3
```

### 4. Switch models (Phase 3)

Use any `/cli-*` command from any connected channel:

```
/cli-sonnet
→ ✅ Switched to Claude Sonnet 4.6 (CLI)
   `vllm/cli-claude/claude-sonnet-4-6`
```

---

## Configuration

In `~/.openclaw/openclaw.json` → `plugins.entries.openclaw-cli-bridge-elvatis.config`:

```json5
{
  "enableCodex": true,         // register openai-codex from Codex CLI auth (default: true)
  "enableProxy": true,         // start local CLI proxy server (default: true)
  "proxyPort": 31337,          // proxy port (default: 31337)
  "proxyApiKey": "cli-bridge", // key between OpenClaw vllm provider and proxy (default: "cli-bridge")
  "proxyTimeoutMs": 120000     // CLI subprocess timeout in ms (default: 120s)
}
```

---

## Architecture

```
OpenClaw agent
  │
  ├─ openai-codex/*  ──► OpenAI API  (auth via ~/.codex/auth.json OAuth tokens)
  │
  └─ vllm/cli-gemini/*  ─┐
     vllm/cli-claude/*   ─┤─► localhost:31337  (openclaw-cli-bridge proxy)
                          │       ├─ cli-gemini/* → gemini -m <model> @<tmpfile>
                          │       └─ cli-claude/* → claude -p --model <model>  ← prompt via stdin
                          └───────────────────────────────────────────────────

Slash commands (bypass agent):
  /cli-sonnet|opus|haiku|gemini|gemini-flash|gemini3
     └─► openclaw models set <model>  (atomic, ~1s)
```

---

## Known Issues & Fixes

### `spawn E2BIG` (fixed in v0.2.1)

**Symptom:** `CLI error for cli-claude/…: spawn E2BIG` after ~500+ messages in a session.

**Root cause:** The OpenClaw gateway modifies `process.env` at runtime (OPENCLAW_* vars, session context, etc.). Spreading the full `process.env` into `spawn()` pushes `argv + envp` over Linux's `ARG_MAX` (~2MB).

**Fix:** `buildMinimalEnv()` in `src/cli-runner.ts` — only passes `HOME`, `PATH`, `USER`, and auth keys to the subprocess. Immune to gateway runtime env size.

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Test coverage: `test/cli-runner.test.ts` — unit tests for `formatPrompt` (truncation, system message handling, MAX_MSG_CHARS).

---

## Changelog

### v0.2.2
- **feat:** Phase 3 — `/cli-*` slash commands for instant model switching
- All 6 commands registered via `api.registerCommand` with `requireAuth: true`
- Calls `openclaw models set <model>` via `api.runtime.system.runCommandWithTimeout`

### v0.2.1
- **fix:** `spawn E2BIG` — use `buildMinimalEnv()` instead of spreading full `process.env`
- **feat:** Added `test/cli-runner.test.ts` (5 unit tests)
- Added Gemini 3 Pro model (`vllm/cli-gemini/gemini-3-pro`)

### v0.2.0
- **feat:** Phase 2 — local OpenAI-compatible proxy server
- Prompt via stdin/tmpfile (never as CLI arg) to prevent arg-size issues
- `MAX_MESSAGES=20` + `MAX_MSG_CHARS=4000` truncation in `formatPrompt`
- Auto-patch of `openclaw.json` vllm provider config on first start

### v0.1.x
- Phase 1: Codex CLI OAuth auth bridge

---

## License

MIT
