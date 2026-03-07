---
name: openclaw-cli-bridge-elvatis
description: Bridge local Codex, Gemini, and Claude Code CLIs into OpenClaw (Codex OAuth auth bridge + Gemini/Claude OpenAI-compatible local proxy via vllm).
homepage: https://github.com/elvatis/openclaw-cli-bridge-elvatis
metadata:
  {
    "openclaw":
      {
        "emoji": "🌉",
        "requires": { "bins": ["openclaw", "codex", "gemini", "claude"] }
      }
  }
---

# OpenClaw CLI Bridge Elvatis

This project provides two layers:

1. **Codex auth bridge** for `openai-codex/*` by reading existing Codex CLI OAuth tokens from `~/.codex/auth.json`
2. **Local OpenAI-compatible proxy** (default `127.0.0.1:31337`) for Gemini/Claude CLI execution via OpenClaw `vllm` provider models:
   - `vllm/cli-gemini/*`
   - `vllm/cli-claude/*`

See `README.md` for setup and architecture.
