# openclaw-cli-bridge-elvatis

> OpenClaw plugin that bridges locally installed AI CLIs (Codex, Gemini, Claude Code) as model providers.

## What it does

**Phase 1 — Auth bridge:** Registers the `openai-codex` provider using OAuth tokens already stored by the Codex CLI (`~/.codex/auth.json`). No re-login needed.

**Phase 2 — Request bridge:** Starts a local OpenAI-compatible HTTP proxy server (default port `31337`) and configures OpenClaw's `vllm` provider to route model calls through `gemini` and `claude` CLI subprocesses.

| Model reference | CLI invoked |
|---|---|
| `vllm/cli-gemini/gemini-2.5-pro` | `gemini -m gemini-2.5-pro -p "<prompt>"` |
| `vllm/cli-gemini/gemini-2.5-flash` | `gemini -m gemini-2.5-flash -p "<prompt>"` |
| `vllm/cli-claude/claude-opus-4-6` | `claude -p -m claude-opus-4-6 --output-format text "<prompt>"` |
| `vllm/cli-claude/claude-sonnet-4-6` | `claude -p -m claude-sonnet-4-6 --output-format text "<prompt>"` |

## Requirements

- [OpenClaw](https://openclaw.ai) gateway running
- One or more of:
  - [`@openai/codex`](https://github.com/openai/codex) — `npm i -g @openai/codex` + `codex login`
  - [`@google/gemini-cli`](https://github.com/google-gemini/gemini-cli) — `npm i -g @google/gemini-cli` + `gemini auth`
  - [`@anthropic-ai/claude-code`](https://github.com/anthropic-ai/claude-code) — `npm i -g @anthropic-ai/claude-code` + `claude auth`

## Installation

```bash
# Install from ClawHub (once published)
clawhub install openclaw-cli-bridge-elvatis

# Or load directly from this repo (development)
# Add to ~/.openclaw/openclaw.json:
# plugins.load.paths: ["<path-to-this-repo>"]
# plugins.allow: ["openclaw-cli-bridge-elvatis"]
# plugins.entries.openclaw-cli-bridge-elvatis: { "enabled": true }
```

## Auth setup (Phase 1 — Codex)

After enabling the plugin, register the Codex auth profile:

```bash
openclaw models auth login --provider openai-codex
# Select: "Codex CLI (existing login)"
```

The proxy server (Phase 2) starts automatically and patches `openclaw.json` with the `vllm` provider config. Restart the gateway to activate the new models.

## Configuration

Add to your `plugins.entries.openclaw-cli-bridge-elvatis.config` in `~/.openclaw/openclaw.json`:

```json5
{
  "enableCodex": true,       // register openai-codex from Codex CLI auth
  "enableProxy": true,       // start the local CLI proxy server
  "proxyPort": 31337,        // port for the proxy (default: 31337)
  "proxyApiKey": "cli-bridge", // key used between OpenClaw and the proxy
  "proxyTimeoutMs": 120000   // CLI timeout in ms (default: 2 min)
}
```

## Architecture

```
OpenClaw agent
  │
  ├─ openai-codex/* ──► OpenAI API (auth via Codex CLI OAuth tokens)
  │
  └─ vllm/cli-gemini/*  ─┐
     vllm/cli-claude/*   ─┤─► openclaw-cli-bridge-elvatis proxy (127.0.0.1:31337)
                          │       ├─ cli-gemini/* → gemini -m <model> -p "<prompt>"
                          │       └─ cli-claude/* → claude -p -m <model> "<prompt>"
                          └──────────────────────────────────────────────────────
```

## AAHP handoff

Project tracking lives in `.ai/handoff/` (AAHP v3 protocol).

## License

MIT
