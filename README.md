# openclaw-cli-bridge-elvatis

> OpenClaw plugin that bridges locally installed AI CLIs (Codex, Gemini, Claude Code) as model providers — with slash commands for instant model switching, restore, health testing, and model listing.

**Current version:** `0.2.20`

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
| `vllm/cli-gemini/gemini-3-pro-preview` | `gemini -m gemini-3-pro-preview -p ""` (stdin, cwd=/tmp) | ~8–10s |
| `vllm/cli-gemini/gemini-3-flash-preview` | `gemini -m gemini-3-flash-preview -p ""` (stdin, cwd=/tmp) | ~4–6s |
| `vllm/cli-claude/claude-sonnet-4-6` | `claude -p --output-format text --model claude-sonnet-4-6` (stdin) | ~2–4s |
| `vllm/cli-claude/claude-opus-4-6` | `claude -p --output-format text --model claude-opus-4-6` (stdin) | ~3–5s |
| `vllm/cli-claude/claude-haiku-4-5` | `claude -p --output-format text --model claude-haiku-4-5` (stdin) | ~1–3s |

### Phase 3 — Slash commands

All commands use gateway-level `commands.allowFrom` for authorization (`requireAuth: false` at plugin level).

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
| `/cli-gemini3` | `vllm/cli-gemini/gemini-3-pro-preview` |
| `/cli-gemini3-flash` | `vllm/cli-gemini/gemini-3-flash-preview` |

**Codex CLI** (via `openai-codex` provider — OAuth auth, calls OpenAI API directly, **not** through the local proxy):

| Command | Model | Notes |
|---|---|---|
| `/cli-codex` | `openai-codex/gpt-5.3-codex` | ✅ Tested |
| `/cli-codex-spark` | `openai-codex/gpt-5.3-codex-spark` | |
| `/cli-codex52` | `openai-codex/gpt-5.2-codex` | |
| `/cli-codex54` | `openai-codex/gpt-5.4` | May require upgraded OAuth scope |
| `/cli-codex-mini` | `openai-codex/gpt-5.1-codex-mini` | ✅ Tested |

**Utility:**

| Command | What it does |
|---|---|
| `/cli-back` | Restore the model active **before** the last `/cli-*` switch |
| `/cli-test [model]` | One-shot proxy health check — **does NOT switch your active model** |
| `/cli-list` | Show all registered CLI bridge models with commands |

**`/cli-back` details:**
- Before every `/cli-*` switch the current model is saved to `~/.openclaw/cli-bridge-state.json`
- `/cli-back` reads it, calls `openclaw models set <previous>`, then clears the file
- State survives gateway restarts — safe to use any time

**`/cli-test` details:**
- Accepts short form (`cli-sonnet`) or full path (`vllm/cli-claude/claude-sonnet-4-6`)
- Default when no arg given: `cli-claude/claude-sonnet-4-6`
- Reports response content, latency, and confirms your active model is unchanged

**`/cli-list` details:**
- Lists all registered models grouped by provider (Claude CLI, Gemini CLI, Codex)
- No arguments required

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
[cli-bridge] registered 14 commands: /cli-sonnet, /cli-opus, /cli-haiku,
             /cli-gemini, /cli-gemini-flash, /cli-gemini3, /cli-gemini3-flash,
             /cli-codex, /cli-codex-spark, /cli-codex52, /cli-codex54, /cli-codex-mini,
             /cli-back, /cli-test, /cli-list
```

### 3. Register Codex auth (optional — Phase 1 only)

```bash
openclaw models auth login --provider openai-codex
# Select: "Codex CLI (existing login)"
```

### 4. List available models

```
/cli-list
→ 🤖 CLI Bridge Models

  Claude Code CLI
    /cli-sonnet          claude-sonnet-4-6
    /cli-opus            claude-opus-4-6
    /cli-haiku           claude-haiku-4-5

  Gemini CLI
    /cli-gemini          gemini-2.5-pro
    /cli-gemini-flash    gemini-2.5-flash
    /cli-gemini3         gemini-3-pro-preview
    /cli-gemini3-flash   gemini-3-flash-preview

  Codex (OAuth)
    /cli-codex           gpt-5.3-codex
    /cli-codex-spark     gpt-5.3-codex-spark
    /cli-codex52         gpt-5.2-codex
    /cli-codex54         gpt-5.4
    /cli-codex-mini      gpt-5.1-codex-mini

  Utility
    /cli-back            Restore previous model
    /cli-test [model]    Health check (no model switch)
    /cli-list            This overview

  Proxy: 127.0.0.1:31337
```

### 5. Test without switching your model

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

### 6. Switch and restore

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

## Model Allowlist

`routeToCliRunner` enforces `DEFAULT_ALLOWED_CLI_MODELS` — only models registered in the plugin are accepted by the proxy. Unregistered models receive a clear error listing allowed options.

To disable the check (e.g. for custom vllm routing): pass `allowedModels: null` in `RouteOptions`.

---

## Architecture

```
OpenClaw agent
  │
  ├─ openai-codex/*  ──────────────────────────► OpenAI API (direct)
  │    auth: ~/.codex/auth.json OAuth tokens
  │    /cli-codex, /cli-codex-spark, /cli-codex52, /cli-codex54, /cli-codex-mini
  │
  └─ vllm/cli-gemini/*  ─┐
     vllm/cli-claude/*   ─┤─► localhost:31337  (openclaw-cli-bridge proxy)
                          │       ├─ cli-gemini/* → gemini -m <model> -p ""
                          │       │                 stdin=prompt, cwd=/tmp
                          │       │                 (neutral cwd prevents agentic mode)
                          │       └─ cli-claude/* → claude -p --model <model>
                          │                         stdin=prompt

Slash commands (requireAuth=false, gateway commands.allowFrom is the auth layer):
  /cli-sonnet|opus|haiku|gemini|gemini-flash|gemini3|gemini3-flash
  /cli-codex|codex-spark|codex52|codex54|codex-mini
     └─► saves current model → ~/.openclaw/cli-bridge-state.json
     └─► openclaw models set <model>

  /cli-back   → reads state file, restores previous model, clears state
  /cli-test   → HTTP POST → localhost:31337, no global model change
  /cli-list   → formatted table of all registered models
```

---

## Known Issues & Fixes

### `spawn E2BIG` (fixed in v0.2.1)
**Symptom:** `CLI error for cli-claude/…: spawn E2BIG` after ~500+ messages.
**Cause:** Gateway injects large values into `process.env` at runtime. Spreading it into `spawn()` exceeds Linux's `ARG_MAX` (~2MB).
**Fix:** `buildMinimalEnv()` — only passes `HOME`, `PATH`, `USER`, and auth keys.

### Gemini agentic mode / hangs (fixed in v0.2.4)
**Symptom:** Gemini hangs, returns wrong answers, or says "directory does not exist".
**Cause:** `@file` syntax (`gemini -p @/tmp/xxx.txt`) triggers agentic mode — Gemini scans the working directory for project context and treats prompts as task instructions.
**Fix:** Stdin delivery (`gemini -p ""` with prompt via stdin) + `cwd=/tmp`.

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (45 tests)
```

---

## Changelog

### v0.2.20
- **fix:** `formatPrompt` now defensively coerces `content` to string via `contentToString()` — prevents `[object Object]` reaching the CLI when WhatsApp group messages contain structured content objects instead of plain strings
- **feat:** `ChatMessage.content` now accepts `string | ContentPart[] | unknown` (OpenAI multimodal content arrays supported)
- **feat:** New `contentToString()` helper: handles string, OpenAI ContentPart arrays, arbitrary objects (JSON.stringify), null/undefined

### v0.2.19
- **feat:** `/cli-list` command — formatted overview of all registered models grouped by provider
- **docs:** Rewrite README to reflect current state (correct model names, command count, requireAuth, test count, /cli-list docs)

### v0.2.18
- **feat:** Add `/cli-gemini3-flash` → `gemini-3-flash-preview`
- **feat:** Add `/cli-codex-spark` → `gpt-5.3-codex-spark`, `/cli-codex52` → `gpt-5.2-codex`, `/cli-codex54` → `gpt-5.4`
- **fix:** Update `DEFAULT_ALLOWED_CLI_MODELS` with `gemini-3-flash-preview`

### v0.2.17
- **fix:** `/cli-gemini3` model corrected to `gemini-3-pro-preview` (was `gemini-3-pro`, returns 404 from Gemini API)

### v0.2.16
- **feat(T-101):** Expand test suite to 45 tests — new cases for `formatPrompt` (mixed roles, boundary values, system messages) and `routeToCliRunner` (gemini paths, edge cases)
- **feat(T-103):** Add `DEFAULT_ALLOWED_CLI_MODELS` allowlist; `routeToCliRunner` now rejects unregistered models by default; pass `allowedModels: null` to opt out

### v0.2.15
- **docs:** Rewrite changelog (entries for v0.2.12–v0.2.14 were corrupted); all providers verified working end-to-end

### v0.2.14
- **fix:** Strip `vllm/` prefix in `routeToCliRunner` — OpenClaw sends full provider path (`vllm/cli-claude/...`) but proxy router expected bare `cli-claude/...`
- **test:** Add 4 routing tests (9 total)

### v0.2.13
- **fix:** Set `requireAuth: false` on all `/cli-*` commands — plugin-level auth uses different resolution path than `commands.allowFrom`; gateway allowlist is the correct security layer
- **fix:** Hardcoded `version: "0.2.5"` in plugin object now tracks `package.json`

### v0.2.9
- **fix:** Critical — replace `fuser -k 31337/tcp` with safe health probe to prevent gateway SIGKILL on hot-reloads

### v0.2.7–v0.2.8
- **fix:** Port leak on hot-reload — `registerService` stop() hook + `closeAllConnections()`

### v0.2.6
- **fix:** `openclaw.extensions` added to `package.json`; config patcher auto-adds vllm provider

### v0.2.5
- **feat:** `/cli-codex` + `/cli-codex-mini` (Codex OAuth provider, direct API)

### v0.2.4
- **fix:** Gemini agentic mode — stdin delivery + `cwd=/tmp`

### v0.2.3
- **feat:** `/cli-back` + `/cli-test`

### v0.2.2
- **feat:** Phase 3 — `/cli-*` slash commands

### v0.2.1
- **fix:** `spawn E2BIG` + unit tests

### v0.2.0
- **feat:** Phase 2 — local OpenAI-compatible proxy, stdin delivery, prompt truncation

### v0.1.x
- Phase 1: Codex CLI OAuth auth bridge

---

## License

MIT
