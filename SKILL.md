---
name: openclaw-cli-bridge-elvatis
description: Bridge local Codex, Gemini, and Claude Code CLIs into OpenClaw as vllm model providers. Includes /cli-* slash commands for instant model switching (/cli-sonnet, /cli-opus, /cli-haiku, /cli-gemini, /cli-gemini-flash, /cli-gemini3). E2BIG-safe spawn via minimal env.
homepage: https://github.com/elvatis/openclaw-cli-bridge-elvatis
metadata:
  {
    "openclaw":
      {
        "emoji": "🌉",
        "requires": { "bins": ["openclaw", "claude", "gemini"] },
        "commands": ["/cli-sonnet", "/cli-opus", "/cli-haiku", "/cli-gemini", "/cli-gemini-flash", "/cli-gemini3"]
      }
  }
---

# OpenClaw CLI Bridge

Bridges locally installed AI CLIs (Codex, Gemini, Claude Code) as OpenClaw model providers. Three phases:

## Phase 1 — Codex Auth Bridge
Registers `openai-codex` provider from existing `~/.codex/auth.json` tokens. No re-login.

## Phase 2 — Request Proxy
Local OpenAI-compatible HTTP proxy (`127.0.0.1:31337`) routes vllm model calls to CLI subprocesses:
- `vllm/cli-gemini/gemini-2.5-pro` / `gemini-2.5-flash` / `gemini-3-pro`
- `vllm/cli-claude/claude-sonnet-4-6` / `claude-opus-4-6` / `claude-haiku-4-5`

Prompts go via stdin/tmpfile — never as CLI args (prevents `E2BIG` for long sessions).

## Phase 3 — Slash Commands
Six instant model-switch commands (authorized senders only):

| Command | Model |
|---|---|
| `/cli-sonnet` | `vllm/cli-claude/claude-sonnet-4-6` |
| `/cli-opus` | `vllm/cli-claude/claude-opus-4-6` |
| `/cli-haiku` | `vllm/cli-claude/claude-haiku-4-5` |
| `/cli-gemini` | `vllm/cli-gemini/gemini-2.5-pro` |
| `/cli-gemini-flash` | `vllm/cli-gemini/gemini-2.5-flash` |
| `/cli-gemini3` | `vllm/cli-gemini/gemini-3-pro` |
| `/cli-codex` | `openai-codex/gpt-5.3-codex` |
| `/cli-codex-mini` | `openai-codex/gpt-5.1-codex-mini` |
| `/cli-back` | Restore previous model |
| `/cli-test [model]` | Health check (no model switch) |

Each command runs `openclaw models set <model>` atomically and replies with a confirmation.

## Setup

1. Enable plugin + restart gateway
2. (Optional) Register Codex auth: `openclaw models auth login --provider openai-codex`
3. Use `/cli-*` commands to switch models from any channel

See `README.md` for full configuration reference and architecture diagram.

**Version:** 0.2.20
