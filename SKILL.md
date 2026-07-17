---
name: openclaw-cli-bridge-elvatis
description: Bridge local AI CLIs, web sessions, and API providers into OpenClaw as model providers. Instant model switching, multi-phase pipeline, LM Studio, OpenRouter, Perplexity, and browser automation.
homepage: https://github.com/elvatis/openclaw-cli-bridge-elvatis
metadata:
  {
    "openclaw":
      {
        "emoji": "🌉",
        "requires": { "bins": ["openclaw"] },
        "commands": [
          "/cli-fable5", "/cli-sonnet5", "/cli-sonnet", "/cli-opus", "/cli-opus47", "/cli-opus46", "/cli-haiku",
          "/cli-gemini", "/cli-gemini-flash", "/cli-gemini3", "/cli-gemini3-pro-preview", "/cli-gemini3-flash",
          "/cli-codex", "/cli-codex-spark", "/cli-codex52", "/cli-codex54", "/cli-codex55", "/cli-codex-mini",
          "/cli-opencode", "/cli-pi", "/cli-grok", "/cli-bitnet",
          "/lms", "/lms-models", "/lms-status", "/lms-use",
          "/or-opus", "/or-sonnet", "/or-haiku", "/or-gpt4o", "/or-gpt41", "/or-o3",
          "/or-gemini", "/or-gemini-flash", "/or-grok3", "/or-deepseek", "/or-deepseek-v3", "/or-llama4",
          "/plex-opus", "/plex-sonnet", "/plex-haiku", "/plex-gpt5", "/plex-gpt54", "/plex-gpt55",
          "/plex-grok4", "/plex-gemini", "/plex-sonar",
          "/cli-back", "/cli-apply", "/cli-test", "/cli-list", "/cli-help",
          "/pipeline",
          "/grok-login", "/grok-status", "/grok-logout",
          "/gemini-login", "/gemini-status", "/gemini-logout",
          "/claude-login", "/claude-status", "/claude-logout",
          "/chatgpt-login", "/chatgpt-status", "/chatgpt-logout",
          "/bridge-status"
        ]
      }
  }
---

# OpenClaw CLI Bridge

Bridges locally installed AI CLIs, web browser sessions, and REST API providers into OpenClaw as model providers. Includes instant model switching via slash commands, a multi-phase `/pipeline`, LM Studio local inference, OpenRouter, Perplexity API, and Playwright-based browser automation.

## Architecture

```
OpenClaw Gateway (vllm provider)
        |
        v
  Proxy (127.0.0.1:31337)   ← OpenAI-compatible HTTP
   /v1/chat/completions
        |
   ┌────┴────────────────────────────────────────────┐
   │                                                  │
   ▼                                                  ▼
CLI subprocess                                 REST API call
(claude, gemini,                        (Perplexity, OpenRouter,
 codex, grok, etc.)                      LM Studio, BitNet)
```

Prompts go via stdin/tmpfile — never as shell arguments (prevents `E2BIG` for long sessions).

---

## Phase 1 — Codex Auth Bridge

Registers `openai-codex` provider from existing `~/.codex/auth.json` tokens. No re-login required.

---

## Phase 2 — Request Proxy

Local OpenAI-compatible proxy on `127.0.0.1:31337`. Routes vllm model IDs to the correct backend.

### Claude Code CLI models (`cli-claude/*`)

| vllm model ID | Notes |
|---|---|
| `vllm/cli-claude/claude-fable-5` | Claude Fable 5, 1M ctx |
| `vllm/cli-claude/claude-sonnet-5` | Claude Sonnet 5, 1M ctx |
| `vllm/cli-claude/claude-opus-4-8` | Claude Opus 4.8, 1M ctx |
| `vllm/cli-claude/claude-opus-4-7` | Claude Opus 4.7, 1M ctx |
| `vllm/cli-claude/claude-sonnet-4-6` | Claude Sonnet 4.6 |
| `vllm/cli-claude/claude-opus-4-6` | Claude Opus 4.6 |
| `vllm/cli-claude/claude-haiku-4-5` | Claude Haiku 4.5, 200K ctx |

### Gemini CLI models (`cli-gemini/*`)

| vllm model ID | Notes |
|---|---|
| `vllm/cli-gemini/gemini-2.5-pro` | 1M ctx |
| `vllm/cli-gemini/gemini-2.5-flash` | 1M ctx |
| `vllm/cli-gemini/gemini-3.1-pro-preview` | 1M ctx |
| `vllm/cli-gemini/gemini-3-pro-preview` | 1M ctx |
| `vllm/cli-gemini/gemini-3-flash-preview` | 1M ctx |

### Codex CLI models (`openai-codex/*`)

| vllm model ID | Notes |
|---|---|
| `openai-codex/gpt-5.4` | 1M ctx |
| `openai-codex/gpt-5.5` | latest |
| `openai-codex/gpt-5.3-codex` | 400K ctx |
| `openai-codex/gpt-5.3-codex-spark` | 400K ctx |
| `openai-codex/gpt-5.2-codex` | 200K ctx |
| `openai-codex/gpt-5.1-codex-mini` | 128K ctx |

### Grok CLI / Web models

| vllm model ID | Notes |
|---|---|
| `vllm/cli-grok/grok-4.5` | CLI subprocess |
| `vllm/web-grok/grok-4` | Browser session (requires `/grok-login`) |
| `vllm/web-grok/grok-3` | Browser session |
| `vllm/web-grok/grok-3-fast` | Browser session |
| `vllm/web-grok/grok-3-mini` | Browser session |
| `vllm/web-grok/grok-3-mini-fast` | Browser session |

### Gemini Web models

| vllm model ID | Notes |
|---|---|
| `vllm/web-gemini/gemini-3-1-pro` | Browser session (requires `/gemini-login`) |
| `vllm/web-gemini/gemini-2-5-pro` | Browser session |
| `vllm/web-gemini/gemini-2-5-flash` | Browser session |
| `vllm/web-gemini/gemini-3-pro` | Browser session |
| `vllm/web-gemini/gemini-3-flash` | Browser session |

### Gemini API (native SDK)

| vllm model ID | Notes |
|---|---|
| `vllm/gemini-api/gemini-2.5-flash` | GEMINI_API_KEY in .env |
| `vllm/gemini-api/gemini-2.5-pro` | GEMINI_API_KEY in .env |
| `vllm/gemini-api/gemini-3.1-pro-preview` | |
| `vllm/gemini-api/gemini-3-flash-preview` | |

### Other CLI models

| vllm model ID | Notes |
|---|---|
| `vllm/opencode/default` | OpenCode CLI |
| `vllm/pi/default` | Pi CLI |
| `vllm/local-bitnet/bitnet-2b` | BitNet on 127.0.0.1:8082 |
| `vllm/lm-studio/auto` | LM Studio local inference |

### Perplexity API (`perplexity-api/*`)

Requires `PERPLEXITY_API_KEY` in `~/.openclaw/.env`. No subprocess — pure REST.

| vllm model ID |
|---|
| `vllm/perplexity-api/anthropic/claude-opus-4-8` |
| `vllm/perplexity-api/anthropic/claude-opus-4-7` |
| `vllm/perplexity-api/anthropic/claude-opus-4-6` |
| `vllm/perplexity-api/anthropic/claude-sonnet-5` |
| `vllm/perplexity-api/anthropic/claude-sonnet-4-6` |
| `vllm/perplexity-api/anthropic/claude-sonnet-4-5` |
| `vllm/perplexity-api/anthropic/claude-haiku-4-5` |
| `vllm/perplexity-api/openai/gpt-5` |
| `vllm/perplexity-api/openai/gpt-5.1` |
| `vllm/perplexity-api/openai/gpt-5.2` |
| `vllm/perplexity-api/openai/gpt-5.4` |
| `vllm/perplexity-api/openai/gpt-5.5` |
| `vllm/perplexity-api/openai/gpt-5.4-nano` |
| `vllm/perplexity-api/openai/gpt-5-mini` |
| `vllm/perplexity-api/openai/gpt-5.4-mini` |
| `vllm/perplexity-api/openai/gpt-5.6-luna` |
| `vllm/perplexity-api/openai/gpt-5.6-terra` |
| `vllm/perplexity-api/openai/gpt-5.6-sol` |
| `vllm/perplexity-api/xai/grok-4.3` |
| `vllm/perplexity-api/xai/grok-4.20-reasoning` |
| `vllm/perplexity-api/xai/grok-4.20-non-reasoning` |
| `vllm/perplexity-api/xai/grok-4.20-multi-agent` |
| `vllm/perplexity-api/xai/grok-4.5` |
| `vllm/perplexity-api/google/gemini-3.1-flash-lite` |
| `vllm/perplexity-api/google/gemini-3-flash-preview` |
| `vllm/perplexity-api/google/gemini-3.5-flash` |
| `vllm/perplexity-api/google/gemini-3.1-pro-preview` |
| `vllm/perplexity-api/perplexity/sonar` |
| `vllm/perplexity-api/perplexity/kimi-k2.7-code` |
| `vllm/perplexity-api/perplexity/glm-5.2` |
| `vllm/perplexity-api/nvidia/nemotron-3-super-120b-a12b` |

### OpenRouter API (`openrouter-api/*`)

Requires `OPENROUTER_API_KEY` in `~/.openclaw/.env`. No subprocess — pure REST.

| vllm model ID | Notes |
|---|---|
| `vllm/openrouter-api/anthropic/claude-opus-4-8` | |
| `vllm/openrouter-api/anthropic/claude-sonnet-4-6` | |
| `vllm/openrouter-api/anthropic/claude-haiku-4-5` | |
| `vllm/openrouter-api/openai/gpt-4o` | |
| `vllm/openrouter-api/openai/gpt-4.1` | 1M ctx |
| `vllm/openrouter-api/openai/o3` | 200K ctx |
| `vllm/openrouter-api/google/gemini-2.5-pro` | 1M ctx |
| `vllm/openrouter-api/google/gemini-2.5-flash` | 1M ctx |
| `vllm/openrouter-api/x-ai/grok-3` | |
| `vllm/openrouter-api/x-ai/grok-3-mini` | |
| `vllm/openrouter-api/deepseek/deepseek-r1` | reasoning |
| `vllm/openrouter-api/deepseek/deepseek-chat-v3-0324` | |
| `vllm/openrouter-api/meta-llama/llama-4-maverick` | 1M ctx |
| `vllm/openrouter-api/meta-llama/llama-4-scout` | 10M ctx |
| `vllm/openrouter-api/mistralai/mistral-large-2407` | |
| `vllm/openrouter-api/mistralai/mistral-small-3.2-24b-instruct` | |

---

## Phase 3 — Slash Commands

All commands work from any channel (WhatsApp, webchat, etc.). Authorized senders only.

### Claude Code CLI

| Command | Model | Notes |
|---|---|---|
| `/cli-fable5` | Claude Fable 5 (CLI) | Flagship, 1M ctx |
| `/cli-sonnet5` | Claude Sonnet 5 (CLI) | 1M ctx |
| `/cli-sonnet` | Claude Sonnet 4.6 (CLI) | |
| `/cli-opus` | Claude Opus 4.8 (CLI) | 1M ctx |
| `/cli-opus47` | Claude Opus 4.7 (CLI) | |
| `/cli-opus46` | Claude Opus 4.6 (CLI) | |
| `/cli-haiku` | Claude Haiku 4.5 (CLI) | Fast |

### Gemini CLI

| Command | Model |
|---|---|
| `/cli-gemini` | Gemini 2.5 Pro (CLI) |
| `/cli-gemini-flash` | Gemini 2.5 Flash (CLI) |
| `/cli-gemini3` | Gemini 3.1 Pro Preview (CLI) |
| `/cli-gemini3-pro-preview` | Gemini 3 Pro Preview (CLI) |
| `/cli-gemini3-flash` | Gemini 3 Flash (CLI) |

### Codex CLI

| Command | Model |
|---|---|
| `/cli-codex` | GPT-5.3 Codex |
| `/cli-codex-spark` | GPT-5.3 Codex Spark |
| `/cli-codex52` | GPT-5.2 Codex |
| `/cli-codex54` | GPT-5.4 |
| `/cli-codex55` | GPT-5.5 |
| `/cli-codex-mini` | GPT-5.1 Codex Mini |

### Other CLI

| Command | Model |
|---|---|
| `/cli-grok` | Grok 4.5 (CLI) |
| `/cli-opencode` | OpenCode (CLI) |
| `/cli-pi` | Pi (CLI) |
| `/cli-bitnet` | BitNet 2B (local CPU) |

### LM Studio (local network)

| Command | Description |
|---|---|
| `/lms` | Switch to LM Studio (uses currently loaded model) |
| `/lms-models` | List all models available in LM Studio |
| `/lms-status` | Show LM Studio URL and connection status |
| `/lms-use <model-id>` | Pin a specific LM Studio model by ID |

Configure the URL via `LM_STUDIO_URL` in `~/.openclaw/.env` (default: `http://127.0.0.1:1234`).

### OpenRouter API

| Command | Model |
|---|---|
| `/or-opus` | Claude Opus 4.8 (OpenRouter) |
| `/or-sonnet` | Claude Sonnet 4.6 (OpenRouter) |
| `/or-haiku` | Claude Haiku 4.5 (OpenRouter) |
| `/or-gpt4o` | GPT-4o (OpenRouter) |
| `/or-gpt41` | GPT-4.1 (OpenRouter) |
| `/or-o3` | o3 (OpenRouter) |
| `/or-gemini` | Gemini 2.5 Pro (OpenRouter) |
| `/or-gemini-flash` | Gemini 2.5 Flash (OpenRouter) |
| `/or-grok3` | Grok 3 (OpenRouter) |
| `/or-deepseek` | DeepSeek R1 (OpenRouter) |
| `/or-deepseek-v3` | DeepSeek V3 (OpenRouter) |
| `/or-llama4` | Llama 4 Maverick (OpenRouter) |

### Perplexity API

| Command | Model |
|---|---|
| `/plex-opus` | Claude Opus 4.8 (Perplexity) |
| `/plex-sonnet` | Claude Sonnet 4.6 (Perplexity) |
| `/plex-haiku` | Claude Haiku 4.5 (Perplexity) |
| `/plex-gpt5` | GPT-5 (Perplexity) |
| `/plex-gpt54` | GPT-5.4 (Perplexity) |
| `/plex-gpt55` | GPT-5.5 (Perplexity) |
| `/plex-grok4` | Grok 4.5 (Perplexity) |
| `/plex-gemini` | Gemini 3.1 Pro Preview (Perplexity) |
| `/plex-sonar` | Perplexity Sonar (native web search) |

### Switch control

| Command | Description |
|---|---|
| `/cli-apply` | Apply the staged model switch |
| `/cli-back` | Restore the previous model |
| `/cli-test [model]` | Health-check a model without switching |
| `/cli-list` | Show all available models grouped by provider |
| `/cli-help` | Show slash-command reference |

All `/cli-*` and `/or-*`/`/plex-*` commands stage the switch by default. Add `--now` to apply immediately without staging.

---

## Phase 4 — Multi-Phase Pipeline

### `/pipeline`

Runs a topic through four sequential AI phases, each feeding into the next.

```
/pipeline "topic"
/pipeline "topic" --research=plex-sonar --architect=cli-opus --implement=cli-sonnet --review=plex-gpt55
/pipeline "topic" --skip=research,review
```

| Phase | Default model | Role |
|---|---|---|
| research | `plex-sonar` | Web-grounded research and context gathering |
| architect | `cli-opus` | High-level design and decisions |
| implement | `cli-sonnet` | Code or detailed content generation |
| review | `plex-gpt55` | Critique, gaps, and improvements |

Phase model overrides accept any slash-command name (e.g. `--architect=or-o3` or `--review=cli-fable5`).

---

## Phase 5 — Web Browser Providers

Persistent Chromium profiles for 4 web providers. No API key needed.

| Provider | Login | Status | Logout | Models |
|---|---|---|---|---|
| Grok | `/grok-login` | `/grok-status` | `/grok-logout` | `web-grok/*` |
| Gemini | `/gemini-login` | `/gemini-status` | `/gemini-logout` | `web-gemini/*` |
| Claude.ai | `/claude-login` | `/claude-status` | `/claude-logout` | `web-claude/*` |
| ChatGPT | `/chatgpt-login` | `/chatgpt-status` | `/chatgpt-logout` | `web-chatgpt/*` |

Sessions survive gateway restarts. Use `/bridge-status` to see all 4 at a glance.

On restart, if any session has expired, a **WhatsApp alert** is sent automatically with the exact `/xxx-login` command needed.

**Health dashboard:** `http://127.0.0.1:31337/status` — live overview with cookie expiry and model list.

---

## Setup

1. Install and enable the plugin, then restart gateway
2. Add API keys to `~/.openclaw/.env`:
   ```
   PERPLEXITY_API_KEY=pplx-...
   OPENROUTER_API_KEY=sk-or-...
   GEMINI_API_KEY=...
   LM_STUDIO_URL=http://192.168.1.100:1234   # optional, if remote
   ```
3. (Optional) Register Codex auth: `openclaw models auth login --provider openai-codex`
4. (Optional) Log in to browser providers: `/grok-login`, `/gemini-login`, etc.
5. Use any `/cli-*`, `/plex-*`, `/or-*`, or `/lms` command to switch models

See `README.md` for architecture details and configuration reference.

**Version:** 2026.7.1
