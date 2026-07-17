# openclaw-cli-bridge-elvatis

> OpenClaw plugin that bridges multiple AI model providers into OpenClaw via a local OpenAI-compatible proxy on port 31337. Supports CLI subprocesses, browser sessions, and direct API integrations -- all accessible through a unified slash-command interface and multi-phase pipeline.

**Version:** `2026.7.1` | **Node.js:** 22+ | **OpenClaw:** 2026.7.x

---

## What's new in v2026.7.1

- Switched to date-based versioning (`YYYY.M.D`) aligned with OpenClaw releases.
- Plugin now compiles against OpenClaw 2026.7.1 SDK (resolved `openclaw/plugin-sdk` module path change).
- **Claude Code CLI models re-added** with the latest models: Fable 5, Sonnet 5, Opus 4.8, and legacy variants. Each runs in `--print` mode via stdin.
- **Grok CLI added** (`cli-grok/grok-4.5`) via `--prompt-file` headless mode.
- **Phase 5 expanded:** Perplexity API (35 models), OpenRouter (17+ models), LM Studio (dynamic discovery).
- **Phase 6 added:** `/pipeline` multi-phase AI pipeline (research, architect, implement, review).
- Project is actively maintained again. Archive notice removed.

---

## Table of Contents

1. [How it works](#how-it-works)
2. [Phase 1 -- Codex Auth Bridge](#phase-1----codex-auth-bridge)
3. [Phase 2 -- Local Proxy (CLI Subprocesses)](#phase-2----local-proxy-cli-subprocesses)
4. [Phase 3 -- Slash Commands](#phase-3----slash-commands)
5. [Phase 4 -- Web Browser Providers](#phase-4----web-browser-providers)
6. [Phase 5 -- API Integrations](#phase-5----api-integrations)
7. [Phase 6 -- Pipeline](#phase-6----pipeline)
8. [Configuration](#configuration)
9. [Setup](#setup)
10. [Architecture](#architecture)
11. [Requirements](#requirements)
12. [Development](#development)
13. [Known Issues and Fixes](#known-issues-and-fixes)
14. [Changelog](#changelog)

---

## How it works

The plugin starts a local OpenAI-compatible HTTP proxy on `127.0.0.1:31337`. OpenClaw connects to it via the `vllm` provider. Incoming requests are dispatched to the appropriate backend based on the model path:

```
vllm/cli-claude/<model>   -> Claude Code CLI subprocess (stdin, --print mode)
vllm/cli-gemini/<model>   -> Gemini CLI subprocess (stdin, cwd=/tmp)
vllm/cli-grok/<model>     -> Grok CLI subprocess (--prompt-file, headless)
openai-codex/<model>      -> OpenAI API (direct, via Codex OAuth tokens)
vllm/local-bitnet/<model> -> llama-server on 127.0.0.1:8082
vllm/opencode/default     -> OpenCode CLI
vllm/pi/default           -> Pi CLI
perplexity/<model>        -> Perplexity REST API
openrouter/<model>        -> OpenRouter REST API
lmstudio/<model>          -> LM Studio REST API
```

All slash commands use staged switching by default: `/cli-<name>` stages the switch, `/cli-apply` applies it. Add `--now` to any switch command for an immediate switch.

---

## Phase 1 -- Codex Auth Bridge

Reads existing OAuth tokens from `~/.codex/auth.json` and registers an `openai-codex` provider in OpenClaw. No re-login is required. Tokens are refreshed automatically 30 minutes before expiry.

The `openai-codex` provider routes directly to the OpenAI API -- it does not go through the local proxy.

---

## Phase 2 -- Local Proxy (CLI Subprocesses)

A local proxy on `127.0.0.1:31337` routes model calls to locally installed CLI tools. Prompts are always delivered via stdin to avoid `E2BIG` errors on long sessions. Message history is truncated to the last 20 messages + system message.

### Claude Code CLI models

| Model path | CLI invoked | Context |
|---|---|---|
| `vllm/cli-claude/claude-fable-5` | `claude -p --output-format json --model claude-fable-5` | 1M |
| `vllm/cli-claude/claude-sonnet-5` | `claude -p --output-format json --model claude-sonnet-5` | 1M |
| `vllm/cli-claude/claude-opus-4-8` | `claude -p --output-format json --model claude-opus-4-8` | 1M |
| `vllm/cli-claude/claude-opus-4-7` | `claude -p --output-format json --model claude-opus-4-7` | 1M |
| `vllm/cli-claude/claude-opus-4-6` | `claude -p --output-format json --model claude-opus-4-6` | 1M |
| `vllm/cli-claude/claude-sonnet-4-6` | `claude -p --output-format json --model claude-sonnet-4-6` | 1M |
| `vllm/cli-claude/claude-haiku-4-5` | `claude -p --output-format json --model claude-haiku-4-5` | 200k |

### Gemini CLI models

Prompt is sent via stdin. `cwd=/tmp` prevents agentic mode from activating.

| Model path | Gemini model flag |
|---|---|
| `vllm/cli-gemini/gemini-2.5-pro` | `gemini-2.5-pro` |
| `vllm/cli-gemini/gemini-2.5-flash` | `gemini-2.5-flash` |
| `vllm/cli-gemini/gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` |
| `vllm/cli-gemini/gemini-3-pro-preview` | `gemini-3-pro-preview` (legacy alias) |
| `vllm/cli-gemini/gemini-3-flash-preview` | `gemini-3-flash-preview` |

### Grok CLI

| Model path | CLI invoked |
|---|---|
| `vllm/cli-grok/grok-4.5` | `grok --prompt-file <tmpfile>` (headless) |

### Codex CLI (OAuth)

These models use the `openai-codex` provider and call the OpenAI API directly via your Codex OAuth session. They do not go through the local proxy.

| Model path | Notes |
|---|---|
| `openai-codex/gpt-5.3-codex` | Tested |
| `openai-codex/gpt-5.3-codex-spark` | Tested |
| `openai-codex/gpt-5.2-codex` | Tested |
| `openai-codex/gpt-5.4` | May require upgraded OAuth scope |
| `openai-codex/gpt-5.5` | May require upgraded OAuth scope |
| `openai-codex/gpt-5.1-codex-mini` | Tested |

### Other CLI providers

| Model path | CLI invoked | Notes |
|---|---|---|
| `vllm/opencode/default` | `opencode run "prompt"` | Requires `opencode` CLI |
| `vllm/pi/default` | `pi -p "prompt"` | Requires `pi` CLI |
| `vllm/local-bitnet/bitnet-2b` | llama-server on port 8082 | CPU inference, no API key |

---

## Phase 3 -- Slash Commands

All slash commands use staged switching by default. A staged switch is queued but not applied until you run `/cli-apply`, preventing mid-session model disruption. Use `--now` to apply immediately.

### Claude Code CLI

| Command | Model |
|---|---|
| `/cli-fable5` | `vllm/cli-claude/claude-fable-5` |
| `/cli-sonnet5` | `vllm/cli-claude/claude-sonnet-5` |
| `/cli-opus` | `vllm/cli-claude/claude-opus-4-8` |
| `/cli-opus47` | `vllm/cli-claude/claude-opus-4-7` |
| `/cli-opus46` | `vllm/cli-claude/claude-opus-4-6` |
| `/cli-sonnet` | `vllm/cli-claude/claude-sonnet-4-6` |
| `/cli-haiku` | `vllm/cli-claude/claude-haiku-4-5` |

### Gemini CLI

| Command | Model |
|---|---|
| `/cli-gemini` | `vllm/cli-gemini/gemini-2.5-pro` |
| `/cli-gemini-flash` | `vllm/cli-gemini/gemini-2.5-flash` |
| `/cli-gemini3` | `vllm/cli-gemini/gemini-3.1-pro-preview` |
| `/cli-gemini3-pro-preview` | `vllm/cli-gemini/gemini-3-pro-preview` |
| `/cli-gemini3-flash` | `vllm/cli-gemini/gemini-3-flash-preview` |

### Codex CLI

| Command | Model |
|---|---|
| `/cli-codex` | `openai-codex/gpt-5.3-codex` |
| `/cli-codex-spark` | `openai-codex/gpt-5.3-codex-spark` |
| `/cli-codex52` | `openai-codex/gpt-5.2-codex` |
| `/cli-codex54` | `openai-codex/gpt-5.4` |
| `/cli-codex55` | `openai-codex/gpt-5.5` |
| `/cli-codex-mini` | `openai-codex/gpt-5.1-codex-mini` |

### Grok CLI

| Command | Model |
|---|---|
| `/cli-grok` | `vllm/cli-grok/grok-4.5` |

### Other CLI providers

| Command | Model |
|---|---|
| `/cli-opencode` | `vllm/opencode/default` |
| `/cli-pi` | `vllm/pi/default` |
| `/cli-bitnet` | `vllm/local-bitnet/bitnet-2b` |

### Perplexity API

| Command | Model |
|---|---|
| `/plex-opus` | Claude Opus via Perplexity |
| `/plex-sonnet` | Claude Sonnet via Perplexity |
| `/plex-haiku` | Claude Haiku via Perplexity |
| `/plex-gpt5` | GPT-5 via Perplexity |
| `/plex-gpt54` | GPT-5.4 via Perplexity |
| `/plex-gpt55` | GPT-5.5 via Perplexity |
| `/plex-grok4` | Grok 4 via Perplexity |
| `/plex-gemini` | Gemini via Perplexity |
| `/plex-sonar` | Perplexity Sonar (web-search) |

### OpenRouter API

| Command | Model |
|---|---|
| `/or-opus` | Claude Opus |
| `/or-sonnet` | Claude Sonnet |
| `/or-haiku` | Claude Haiku |
| `/or-gpt4o` | GPT-4o |
| `/or-gpt41` | GPT-4.1 |
| `/or-o3` | o3 |
| `/or-gemini` | Gemini 2.5 Pro |
| `/or-gemini-flash` | Gemini 2.5 Flash |
| `/or-grok3` | Grok 3 |
| `/or-deepseek` | DeepSeek R1 |
| `/or-deepseek-v3` | DeepSeek V3 |
| `/or-llama4` | Llama 4 Maverick |

### LM Studio

| Command | What it does |
|---|---|
| `/lms` | Switch to the currently active model in LM Studio |
| `/lms-models` | List all models loaded in LM Studio |
| `/lms-status` | Show LM Studio connection status |
| `/lms-use <model-id>` | Switch to a specific LM Studio model by ID |

### Utility commands

| Command | What it does |
|---|---|
| `/cli-back` | Restore the model active before the last `/cli-*` switch |
| `/cli-apply` | Apply a staged model switch |
| `/cli-pending` | Show the currently staged switch (if any) |
| `/cli-test [model]` | Health check the proxy without switching your active model |
| `/cli-list` | List all registered models grouped by provider |
| `/cli-help` | Full reference card with sections, expiry info, examples, and dashboard link |

**`/cli-back` details**

Before every `/cli-*` switch, the current model is saved to `~/.openclaw/cli-bridge-state.json`. `/cli-back` reads that file, restores the previous model, then clears the file. State survives gateway restarts.

**`/cli-test` details**

Accepts a short form (`cli-sonnet`) or full path (`vllm/cli-claude/claude-sonnet-4-6`). Default when no argument is given: `cli-claude/claude-sonnet-4-6`. Reports response content, latency, and confirms your active model is unchanged.

---

## Phase 4 -- Web Browser Providers

Routes requests through real browser sessions on the provider's web UI. Uses persistent Chromium profiles -- sessions survive gateway restarts. No API key required.

The first time you use a provider, run `/xxx-login` to authenticate. If headless login fails, a headed browser opens for manual login (5-minute timeout). After login, cookies are saved to a persistent profile.

On gateway restart, sessions are automatically restored from saved profiles (~25 seconds after start).

### Grok (grok.com -- SuperGrok subscription)

| Model | Notes |
|---|---|
| `web-grok/grok-4` | Full model |
| `web-grok/grok-3` | Previous generation |
| `web-grok/grok-3-fast` | Faster variant |
| `web-grok/grok-3-mini` | Lightweight |
| `web-grok/grok-3-mini-fast` | Fastest |

| Command | What it does |
|---|---|
| `/grok-login` | Authenticate via X.com OAuth, save session to `~/.openclaw/grok-profile/` |
| `/grok-status` | Show session validity and cookie expiry |
| `/grok-logout` | Clear session |

### Gemini (gemini.google.com)

| Model | Notes |
|---|---|
| `web-gemini/gemini-3-1-pro` | Gemini 3.1 Pro |
| `web-gemini/gemini-2-5-pro` | Gemini 2.5 Pro |
| `web-gemini/gemini-2-5-flash` | Gemini 2.5 Flash |
| `web-gemini/gemini-3-pro` | Gemini 3 Pro |
| `web-gemini/gemini-3-flash` | Gemini 3 Flash |

| Command | What it does |
|---|---|
| `/gemini-login` | Authenticate, save cookies to `~/.openclaw/gemini-profile/` |
| `/gemini-status` | Show session validity and cookie expiry |
| `/gemini-logout` | Clear session |

### Claude.ai

| Command | What it does |
|---|---|
| `/claude-login` | Authenticate, save session to `~/.openclaw/claude-profile/` |
| `/claude-status` | Show session validity |
| `/claude-logout` | Clear session |

### ChatGPT

| Command | What it does |
|---|---|
| `/chatgpt-login` | Authenticate, save session to `~/.openclaw/chatgpt-profile/` |
| `/chatgpt-status` | Show session validity |
| `/chatgpt-logout` | Clear session |

### All providers at a glance

```
/bridge-status
```

Shows all four providers with login state and cookie expiry in one view.

### Status dashboard

Live HTML dashboard at: `http://127.0.0.1:31337/status`

Auto-refreshes every 10 seconds. Includes provider health, active requests, request log, fallback history, and live log viewer.

---

## Phase 5 -- API Integrations

Pure REST integrations -- no subprocess overhead, no browser.

### Perplexity API

Set `PERPLEXITY_API_KEY` in `~/.openclaw/.env`. Provides access to 35 models across OpenAI, Anthropic, Google, xAI, NVIDIA, and Perplexity-native providers.

Notable model: `plex-sonar` uses Perplexity Sonar for web-search-augmented responses. Recommended as the default `research` phase model in `/pipeline`.

### OpenRouter API

Set `OPENROUTER_API_KEY` in `~/.openclaw/.env`. Provides 17+ models:

- Claude Opus, Sonnet, Haiku
- GPT-4o, GPT-4.1, o3
- Gemini 2.5 Pro, Gemini 2.5 Flash
- Grok 3
- DeepSeek R1, DeepSeek V3
- Llama 4 Maverick

### LM Studio

Set `LM_STUDIO_URL` in `~/.openclaw/.env` (default: `http://127.0.0.1:1234`). Connects to any LM Studio instance on the network. Models are discovered dynamically -- no hardcoded model list required.

```
/lms              Switch to the currently active LM Studio model
/lms-models       List available models
/lms-status       Show connection status
/lms-use <id>     Switch to a specific model
```

---

## Phase 6 -- Pipeline

`/pipeline` runs a multi-phase AI workflow where each phase uses a different model and each phase's output feeds into the next as context.

**Phases:** research -> architect -> implement -> review

**Usage:**

```
/pipeline "topic"
/pipeline "topic" research=plex-sonar architect=cli-fable5 implement=or-sonnet review=or-deepseek
/pipeline "topic" --skip=research,architect implement=or-o3 review=plex-opus
```

**Default model assignments:**

| Phase | Default model |
|---|---|
| research | `plex-sonar` |
| architect | `cli-opus` |
| implement | `cli-sonnet` |
| review | `plex-gpt55` |

Model names are the slash-command names from `/cli-list` without the leading `/`. Any model reachable via the bridge can be used in any phase.

---

## Configuration

### API keys

All API keys go in `~/.openclaw/.env`:

```env
PERPLEXITY_API_KEY=pplx-...
OPENROUTER_API_KEY=sk-or-v1-...
LM_STUDIO_URL=http://192.168.177.4:1234   # optional, default: http://127.0.0.1:1234
```

### Plugin config

In `~/.openclaw/openclaw.json` under `plugins.entries.openclaw-cli-bridge-elvatis.config`:

```json5
{
  "enableCodex": true,         // register openai-codex from Codex CLI auth (default: true)
  "enableProxy": true,         // start local CLI proxy server (default: true)
  "proxyPort": 31337,          // proxy port (default: 31337)
  "proxyApiKey": "cli-bridge", // key between OpenClaw vllm provider and proxy (default: "cli-bridge")
  "proxyTimeoutMs": 300000,    // base CLI subprocess timeout in ms (default: 300s)
  "modelTimeouts": {           // per-model timeout overrides in ms (optional)
    "cli-claude/claude-fable-5":      360000,
    "cli-claude/claude-sonnet-5":     300000,
    "cli-claude/claude-opus-4-8":     360000,
    "cli-claude/claude-opus-4-7":     360000,
    "cli-claude/claude-opus-4-6":     300000,
    "cli-claude/claude-sonnet-4-6":   180000,
    "cli-claude/claude-haiku-4-5":     90000,
    "cli-gemini/gemini-2.5-pro":      180000,
    "cli-gemini/gemini-2.5-flash":     90000,
    "openai-codex/gpt-5.5":          300000,
    "openai-codex/gpt-5.4":          300000,
    "openai-codex/gpt-5.3-codex":    180000,
    "openai-codex/gpt-5.1-codex-mini": 90000
  }
}
```

### Required: OpenClaw LLM idle timeout

OpenClaw's default `llm.idleTimeoutSeconds` is 60 seconds, which is too short for CLI subprocesses. Without this setting you will see `exit 143` / `status:408` / `FailoverError: LLM request timed out`.

Add to `~/.openclaw/openclaw.json`:

```json5
{
  "agents": {
    "defaults": {
      "llm": {
        "idleTimeoutSeconds": 300  // must be >= your longest per-model timeout
      }
    }
  }
}
```

Cron-triggered agents automatically have `idleTimeoutSeconds: 0` (disabled) in OpenClaw, so they are not affected.

---

## Setup

**1. Install the plugin**

The plugin loads from `~/.openclaw/extensions/openclaw-cli-bridge-elvatis/`. Enable it in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-cli-bridge-elvatis": { "enabled": true }
    }
  }
}
```

Or install from ClawHub:

```bash
clawhub install openclaw-cli-bridge-elvatis
```

**2. Add API keys**

Add keys for the API providers you want to use to `~/.openclaw/.env` (see [Configuration](#configuration)).

**3. Install CLI tools**

Install the CLI tools for any CLI providers you want to use:

```bash
npm i -g @anthropic-ai/claude-code    # for cli-claude/*
npm i -g @google/gemini-cli           # for cli-gemini/*
# grok, opencode, pi: install per their own docs
```

**4. Restart the gateway**

```bash
openclaw gateway restart
```

Check the logs for:

```
[cli-bridge] proxy ready on :31337
[cli-bridge] registered N commands (use /cli-list to see all)
[cli-bridge] openai-codex provider registered
```

**5. Explore available models**

```
/cli-list
```

**6. Test without switching your model**

```
/cli-test
/cli-test cli-gemini
```

**7. Switch models and restore**

```
/cli-fable5               # stage a switch to Claude Fable 5
/cli-apply                # apply the staged switch
...
/cli-back                 # restore the previous model
```

---

## Architecture

```
OpenClaw agent
  |
  +-- openai-codex/*  ---------------------------------> OpenAI API (direct)
  |    auth: ~/.codex/auth.json OAuth tokens
  |
  +-- vllm/cli-claude/*  ---+
  |   vllm/cli-gemini/*  ---+
  |   vllm/cli-grok/*    ---+--> 127.0.0.1:31337 (openclaw-cli-bridge proxy)
  |   vllm/opencode/*    ---+       |
  |   vllm/pi/*          ---+       +-- cli-claude/*  -> claude -p --output-format json --model <m>
  |   vllm/local-bitnet/* -+        |                   stdin=prompt, cwd=homedir()
  |                                 |
  |                                 +-- cli-gemini/*  -> gemini -m <model> -p ""
  |                                 |                   stdin=prompt, cwd=/tmp
  |                                 |
  |                                 +-- cli-grok/*    -> grok --prompt-file <tmpfile>
  |                                 |
  |                                 +-- opencode/*    -> opencode run "prompt"
  |                                 |
  |                                 +-- pi/*          -> pi -p "prompt"
  |                                 |
  |                                 +-- local-bitnet/* -> llama-server on :8082
  |
  +-- perplexity/*  ---------------------------------> Perplexity REST API
  |    key: PERPLEXITY_API_KEY in ~/.openclaw/.env
  |
  +-- openrouter/*  ---------------------------------> OpenRouter REST API
  |    key: OPENROUTER_API_KEY in ~/.openclaw/.env
  |
  +-- lmstudio/*    ---------------------------------> LM Studio REST API
       url: LM_STUDIO_URL in ~/.openclaw/.env

Proxy endpoints:
  /health          -> {"status":"ok"}
  /healthz         -> detailed JSON (version, uptime, provider status, model count)
  /status          -> HTML dashboard (auto-refreshes every 10s)
  /v1/models       -> OpenAI-compatible model list
  /v1/provider-sessions       -> active CLI sessions + stats
  /v1/provider-sessions/:id   -> DELETE to remove a session
  /api/dashboard-data         -> pre-rendered HTML sections (AJAX polling target)
  /api/logs/stream            -> SSE stream of debug.log (real-time)

Staged model switching:
  /cli-<name>       -> stages switch, saves current model to ~/.openclaw/cli-bridge-state.json
  /cli-apply        -> applies staged switch (calls openclaw models set <model>)
  /cli-pending      -> shows staged switch
  /cli-back         -> restores previous model, clears state file

Browser provider profiles:
  ~/.openclaw/grok-profile/      Grok persistent Chromium session
  ~/.openclaw/gemini-profile/    Gemini persistent Chromium session
  ~/.openclaw/claude-profile/    Claude.ai persistent Chromium session
  ~/.openclaw/chatgpt-profile/   ChatGPT persistent Chromium session
  ~/.openclaw/cookie-expiry.json Unified cookie expiry tracking

Metrics and state:
  ~/.openclaw/cli-bridge/debug.log       Request lifecycle logs (1MB rotation, 2 files)
  ~/.openclaw/cli-bridge/metrics.json    Persistent per-model metrics (debounced 5s writes)
  ~/.openclaw/cli-bridge/cli-sessions.json  CLI session registry
  ~/.openclaw/cli-bridge-state.json      Previous model for /cli-back
```

---

## Requirements

| Requirement | Notes |
|---|---|
| OpenClaw gateway | Tested with 2026.7.x |
| Node.js 22+ | Required |
| `claude` CLI | For `cli-claude/*` models |
| `gemini` CLI | For `cli-gemini/*` models |
| `grok` CLI | For `cli-grok/*` models |
| `opencode` CLI | For `vllm/opencode/default` |
| `pi` CLI | For `vllm/pi/default` |
| `codex` CLI | For `openai-codex/*` (Phase 1 auth bridge) |
| `llama-server` on port 8082 | For `local-bitnet/bitnet-2b` |
| `PERPLEXITY_API_KEY` | For Perplexity provider |
| `OPENROUTER_API_KEY` | For OpenRouter provider |
| LM Studio running | For LM Studio provider |
| System Chrome / Chromium | For web browser providers (Phase 4) |

CLI tools and API keys are optional -- install only what you plan to use.

---

## Development

```bash
npm run lint        # eslint (TypeScript-aware)
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run ci          # lint + typecheck + test
```

Debug log: `tail -f ~/.openclaw/cli-bridge/debug.log`

---

## Known Issues and Fixes

### `spawn E2BIG` (fixed in v0.2.1)

**Symptom:** `CLI error for cli-claude/...: spawn E2BIG` after ~500+ messages.

**Cause:** Gateway injects large values into `process.env` at runtime. Spreading it into `spawn()` exceeds Linux's `ARG_MAX` (~2MB).

**Fix:** `buildMinimalEnv()` passes only `HOME`, `PATH`, `USER`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, and required auth keys.

### Claude Code 401 / timeout on OAuth login (fixed in v0.2.21)

**Symptom:** `/cli-test cli-claude/*` times out after 30s; logs show `401 Invalid authentication credentials`.

**Cause:** `buildMinimalEnv()` did not forward `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS`. Claude Code authenticated via `claude.ai` OAuth (Claude Max) stores tokens in the system keyring (Gnome Keyring / libsecret) and needs these env vars to read them.

**Affects:** Only systems using `claude auth` OAuth login. API-key users (`ANTHROPIC_API_KEY`) are not affected.

**Fix:** Added `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` to `buildMinimalEnv()`.

### Gemini agentic mode / hangs (fixed in v0.2.4)

**Symptom:** Gemini hangs, returns wrong answers, or says "directory does not exist".

**Cause:** `@file` syntax triggers Gemini's agentic mode -- it scans the working directory and treats prompts as task instructions.

**Fix:** Stdin delivery (`gemini -p ""` with prompt via stdin) and `cwd=/tmp`.

### Exit 143 / status 408 / FailoverError (see Configuration)

**Symptom:** Requests to CLI models time out with `exit 143` or `FailoverError: LLM request timed out`.

**Cause:** OpenClaw's default `llm.idleTimeoutSeconds` is 60s. CLI subprocesses often need more time before producing the first token.

**Fix:** Set `agents.defaults.llm.idleTimeoutSeconds` to 300 or higher in `~/.openclaw/openclaw.json`. See [Configuration](#configuration).

---

## Changelog

### v2026.7.1

- Switched to date-based versioning (`YYYY.M.D`) aligned with OpenClaw.
- Plugin now compiles against OpenClaw 2026.7.1 SDK (resolved `openclaw/plugin-sdk` module path).
- Claude Code CLI models re-added: Fable 5, Sonnet 5, Opus 4.8, plus legacy variants.
- Grok CLI added (`cli-grok/grok-4.5`).
- Perplexity API: 35 models, new slash commands (`/plex-*`).
- OpenRouter: 17+ models, new slash commands (`/or-*`).
- LM Studio: dynamic model discovery, `/lms*` commands.
- Phase 6 pipeline (`/pipeline`) added.
- Archive notice removed -- project actively maintained.

### v3.11.5

- `/cli-opus` now targets Claude Opus 4.8; `/cli-opus47` and `/cli-opus46` kept for explicit older routing.
- `/cli-gemini3` now targets Gemini 3.1 Pro Preview; `/cli-gemini3-pro-preview` kept as legacy alias.
- Adds GPT-5.5, Claude Opus 4.8, Gemini 3.1 Pro Preview timeout and fallback defaults.
- Test coverage updated for refreshed model timeout and fallback defaults.

### v3.11.2

- New `/cli-codex55` slash command routes to `openai-codex/gpt-5.5`.
- Per-model timeouts now cover Opus 4.8, Opus 4.7, and GPT-5.5 (previously missing, fell back to base `proxyTimeoutMs`).

### v3.11.1

- SDK import path fix for OpenClaw 2026.7.1 (`openclaw/plugin-sdk/provider-auth-result` submodule).

### v3.11.0

- Real token usage from Claude CLI (`--output-format json`): `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` now flow through to OpenClaw's session table.
- Claude Opus 4.7 added (`/cli-opus47`).
- OpenClaw 2026.5.x compatibility verified.

### v3.10.0 -- v3.10.8

- `v3.10.8`: Include `dist/` in npm tarball; `openclaw.extensions` field for OpenClaw 2026.5.16 compat. Dependency bumps.
- `v3.10.6`: Pass `GEMINI_CLI_TRUST_WORKSPACE=1` to Gemini CLI subprocess.
- `v3.10.3`: Gemini session resume disabled. Filter Gemini "YOLO mode" warnings.
- `v3.10.2`: Codex session resume disabled; cwd fixed to `homedir()`.
- `v3.10.0`: Intelligent prompt routing (`src/prompt-router.ts`); keyword-based model selection.

### v3.9.0 -- v3.9.1

- `v3.9.1`: Sonnet 60s stale timeout (was 30s). Task payload rescue from subagent `{"content":"..."}` wrappers.
- `v3.9.0`: Changelog and documentation update.

### v3.8.0

- Root cause fix: Claude CLI must run from `homedir()`, not from project directories. Running from a project dir triggers agentic mode and prompt injection rejection. This caused the 90% Sonnet failure rate.
- Orchestration test script added (`test/orchestration-test.ts`).

### v3.0.0

- Dashboard v2: sidebar navigation with 9 sections.
- Live log viewer: SSE-powered real-time log streaming.
- AJAX polling replaces full-page meta-refresh (preserves scroll position).

### v2.8.0

- Gemini API provider (`gemini-api/gemini-2.5-flash`, `gemini-api/gemini-2.5-pro`): direct SDK integration with native image generation support.

### v2.6.1

- Startup warning when `idleTimeoutSeconds` is not set or is under 120s.

### v2.5.0

- Graceful timeout handling: SIGTERM -> SIGKILL with 5s grace period.
- Per-model timeout profiles: Opus 5min, Sonnet 3min, Haiku 90s.

### v2.3.0

- OpenAI tool calling protocol support for all CLI models.
- Multimodal content support (images/audio from webchat).
- Autonomous execution mode for all CLI runners.

### v2.0.0

- Phase 2: local OpenAI-compatible proxy, stdin delivery, prompt truncation.

### v1.9.0

- Model fallback chains: `gemini-2.5-pro` -> Flash, `claude-opus` -> Sonnet -> Haiku.
- `/healthz` JSON endpoint.
- Staged model switching (`/cli-apply`, `/cli-pending`).

### v1.8.0

- BitNet local inference (`local-bitnet/bitnet-2b`, llama-server on port 8082).
- `/bridge-status` shows BitNet server health.

### v1.6.0

- Persistent Chromium profiles for all four web providers.
- Sessions survive gateway restarts automatically.

### v0.1.x

- Phase 1: Codex CLI OAuth auth bridge.

---

## License

MIT
