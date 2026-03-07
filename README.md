# openclaw-cli-bridge-elvatis

> OpenClaw plugin that bridges locally installed AI CLIs (Codex, Gemini, Claude Code) as model providers — with slash commands for instant model switching, restore, and health testing.

**Current version:** `0.2.7`

---

## What it does

### Phase 1 — Auth bridge (`openai-codex`)
Registers the `openai-codex` provider by reading OAuth tokens already stored by the Codex CLI (`~/.codex/auth.json`). No re-login needed.

### Phase 2 — Request bridge (local proxy)
Starts a local OpenAI-compatible HTTP proxy on `127.0.0.1:31337` and configures OpenClaw's `vllm` provider to route calls through `gemini` and `claude` CLI subprocesses.

**Prompt delivery:** always via **stdin** (never CLI args or `@file`) — avoids `E2BIG` for long sessions and Gemini agentic mode. Each message batch is truncated to the last 20 messages + system message (`MAX_MESSAGES`/`MAX_MSG_CHARS` in `src/cli-runner.ts`).

| Model reference | CLI invoked | Latency |
|---|---|---|
| `vllm/cli-gemini/gemini-2.5-pro` | `gemini -m gemini-2.5-pro -p ""` (stdin, cwd=/tmp) | ~8–10s |
| `vllm/cli-gemini/gemini-2.5-flash` | `gemini -m gemini-2.5-flash -p ""` (stdin, cwd=/tmp) | ~4–6s |
| `vllm/cli-gemini/gemini-3-pro` | `gemini -m gemini-3-pro -p ""` (stdin, cwd=/tmp) | ~8–10s |
| `vllm/cli-claude/claude-sonnet-4-6` | `claude -p --output-format text --model claude-sonnet-4-6` (stdin) | ~2–4s |
| `vllm/cli-claude/claude-opus-4-6` | `claude -p --output-format text --model claude-opus-4-6` (stdin) | ~3–5s |
| `vllm/cli-claude/claude-haiku-4-5` | `claude -p --output-format text --model claude-haiku-4-5` (stdin) | ~1–3s |

### Phase 3 — Slash commands
Ten plugin-registered commands (all `requireAuth: true`):

**Claude Code CLI** (routed via local proxy on `:31337`):

| Command | Model |
|---|---|
| `/cli-sonnet` | `vllm/cli-claude/claude-sonnet-4-6` |
| `/cli-opus` | `vllm/cli-claude/claude-opus-4-6` |
| `/cli-haiku` | `vllm/cli-claude/claude-haiku-4-5` |

**Gemini CLI** (routed via local proxy on `:31337`, stdin + `cwd=/tmp`):

| Command | Model |
|---|---|
| `/cli-gemini` | `vllm/cli-gemini/gemini-2.5-pro` |
| `/cli-gemini-flash` | `vllm/cli-gemini/gemini-2.5-flash` |
| `/cli-gemini3` | `vllm/cli-gemini/gemini-3-pro` |

**Codex CLI** (via `openai-codex` provider — Codex CLI OAuth auth, calls OpenAI API directly, **not** through the local proxy):

| Command | Model |
|---|---|
| `/cli-codex` | `openai-codex/gpt-5.3-codex` |
| `/cli-codex-mini` | `openai-codex/gpt-5.1-codex-mini` |

**Utility:**

| Command | What it does |
|---|---|
| `/cli-back` | Restore the model active **before** the last `/cli-*` switch |
| `/cli-test [model]` | One-shot proxy health check — **does NOT switch your active model** |

**`/cli-back` details:**
- Before every `/cli-*` switch the current model is saved to `~/.openclaw/cli-bridge-state.json`
- `/cli-back` reads it, calls `openclaw models set <previous>`, then clears the file
- State survives gateway restarts — safe to use any time

**`/cli-test` details:**
- Accepts short form (`cli-sonnet`) or full path (`vllm/cli-claude/claude-sonnet-4-6`)
- Default when no arg given: `cli-claude/claude-sonnet-4-6`
- Reports response content, latency, and confirms your active model is unchanged

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

# Or from workspace (development)
# Add to ~/.openclaw/openclaw.json:
# plugins.load.paths: ["~/.openclaw/workspace/openclaw-cli-bridge-elvatis"]
# plugins.entries.openclaw-cli-bridge-elvatis: { "enabled": true }
```

---

## Setup

### 1. Enable + restart

```json
// ~/.openclaw/openclaw.json → plugins.entries
"openclaw-cli-bridge-elvatis": { "enabled": true }
```

```bash
openclaw gateway restart
```

### 2. Verify (check gateway logs)

```
[cli-bridge] proxy ready on :31337
[cli-bridge] registered 8 commands: /cli-sonnet, /cli-opus, /cli-haiku,
             /cli-gemini, /cli-gemini-flash, /cli-gemini3, /cli-back, /cli-test
```

### 3. Register Codex auth (optional — Phase 1 only)

```bash
openclaw models auth login --provider openai-codex
# Select: "Codex CLI (existing login)"
```

### 4. Test without switching your model

```
/cli-test
→ 🧪 CLI Bridge Test
  Model: vllm/cli-claude/claude-sonnet-4-6
  Response: CLI bridge OK
  Latency: 2531ms
  Active model unchanged: anthropic/claude-sonnet-4-6

/cli-test cli-gemini
→ 🧪 CLI Bridge Test
  Model: vllm/cli-gemini/gemini-2.5-pro
  Response: CLI bridge OK
  Latency: 8586ms
  Active model unchanged: anthropic/claude-sonnet-4-6
```

### 5. Switch and restore

```
/cli-sonnet
→ ✅ Switched to Claude Sonnet 4.6 (CLI)
   `vllm/cli-claude/claude-sonnet-4-6`
   Use /cli-back to restore previous model.

... test things ...

/cli-back
→ ✅ Restored previous model
   `anthropic/claude-sonnet-4-6`
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
  ├─ openai-codex/*  ──────────────────────────► OpenAI API (direct)
  │    auth: ~/.codex/auth.json OAuth tokens        ▲
  │                                                 │
  │    /cli-codex, /cli-codex-mini ─────────────────┘  (switch to this provider)
  │
  └─ vllm/cli-gemini/*  ─┐
     vllm/cli-claude/*   ─┤─► localhost:31337  (openclaw-cli-bridge proxy)
                          │       ├─ cli-gemini/* → gemini -m <model> -p ""
                          │       │                 stdin=prompt, cwd=/tmp
                          │       │                 (neutral cwd prevents agentic mode)
                          │       └─ cli-claude/* → claude -p --model <model>
                          │                         stdin=prompt
                          └───────────────────────────────────────────────────

Slash commands (bypass agent, requireAuth=true):
  /cli-sonnet|opus|haiku|gemini|gemini-flash|gemini3|codex|codex-mini
     └─► saves current model → ~/.openclaw/cli-bridge-state.json
     └─► openclaw models set <model>  (~1s, atomic)

  /cli-back
     └─► reads ~/.openclaw/cli-bridge-state.json
     └─► openclaw models set <previous>

  /cli-test [model]
     └─► HTTP POST → localhost:31337  (no global model change)
     └─► reports response + latency
     └─► NOTE: only tests the proxy — Codex models bypass the proxy
```

---

## Known Issues & Fixes

### `spawn E2BIG` (fixed in v0.2.1)
**Symptom:** `CLI error for cli-claude/…: spawn E2BIG` after ~500+ messages.
**Cause:** Gateway injects large values into `process.env` at runtime. Spreading it into `spawn()` exceeds Linux's `ARG_MAX` (~2MB).
**Fix:** `buildMinimalEnv()` — only passes `HOME`, `PATH`, `USER`, and auth keys.

### Gemini agentic mode / hangs (fixed in v0.2.4)
**Symptom:** Gemini hangs, returns wrong answers, or says "directory does not exist".
**Cause:** `@file` syntax (`gemini -p @/tmp/xxx.txt`) triggers agentic mode — Gemini scans the working directory for project context and treats prompts as task instructions. Running from the workspace root makes this worse.
**Fix:** Stdin delivery (`gemini -p ""` with prompt via stdin) + `cwd=/tmp`. Same pattern as Claude.

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (5 unit tests for formatPrompt)
```

---

## Changelog

### v0.2.5
- **feat:** `/cli-codex` → `openai-codex/gpt-5.3-codex`
- **feat:** `/cli-codex-mini` → `openai-codex/gpt-5.1-codex-mini`
- Codex commands use the `openai-codex` provider (Codex CLI OAuth auth, direct OpenAI API — not the local proxy)

### v0.2.4
- **fix:** Gemini agentic mode — replaced `@file` with stdin delivery (`-p ""`) + `cwd=/tmp`
- **fix:** Filter `[WARN]` and `Loaded cached credentials` noise from Gemini stderr
- Added `RunCliOptions` interface with optional `cwd` field

### v0.2.3
- **feat:** `/cli-back` — restore previous model (state persisted in `~/.openclaw/cli-bridge-state.json`)
- **feat:** `/cli-test [model]` — one-shot proxy health check without changing active model

### v0.2.2
- **feat:** Phase 3 — `/cli-*` slash commands for instant model switching
- All 6 model commands via `api.registerCommand` with `requireAuth: true`

### v0.2.1
- **fix:** `spawn E2BIG` — `buildMinimalEnv()` instead of spreading full `process.env`
- **feat:** Unit tests (`test/cli-runner.test.ts`)

### v0.2.0
- **feat:** Phase 2 — local OpenAI-compatible proxy server
- Stdin prompt delivery, `MAX_MESSAGES=20` + `MAX_MSG_CHARS=4000` truncation
- Auto-patch of `openclaw.json` vllm provider config

### v0.1.x
- Phase 1: Codex CLI OAuth auth bridge

---

## License

MIT
