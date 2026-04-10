# STATUS — openclaw-cli-bridge-elvatis

## Current Version: 2.2.1

- **npm:** @elvatis_com/openclaw-cli-bridge-elvatis@2.2.1 (pending publish)
- **ClawHub:** openclaw-cli-bridge-elvatis@2.2.1 (pending publish)
- **GitHub:** https://github.com/elvatis/openclaw-cli-bridge-elvatis (pushed to main)

## CLI Model Token Limits (corrected in v1.9.2)
| Model | Context Window | Max Output |
|---|---|---|
| Claude Opus 4.6 (CLI) | 1,000,000 | 128,000 |
| Claude Sonnet 4.6 (CLI) | 1,000,000 | 64,000 |
| Claude Haiku 4.5 (CLI) | 200,000 | 64,000 |
| Gemini 2.5 Pro (CLI) | 1,048,576 | 65,535 |
| Gemini 2.5 Flash (CLI) | 1,048,576 | 65,535 |
| Gemini 3 Pro Preview (CLI) | 1,048,576 | 65,536 |
| Gemini 3 Flash Preview (CLI) | 1,048,576 | 65,536 |

## Architecture
- **Proxy server:** `http://127.0.0.1:31337/v1` (OpenAI-compatible)
- **OpenClaw connects via** `vllm` provider with `api: openai-completions`
- **CLI models** (`cli-claude/*`, `cli-gemini/*`): plain text completions only — NO tool/function call support
- **Web-session models** (`web-grok/*`, `web-gemini/*`): browser-based, require `/xxx-login`
- **Codex models** (`openai-codex/*`): OAuth auth bridge
- **BitNet** (`local-bitnet/*`): local CPU inference

## Tool Support Limitation
CLI models explicitly reject tool/function call requests (HTTP 400):
```
Model cli-claude/claude-opus-4-6 does not support tool/function calls.
Use a native API model (e.g. github-copilot/gpt-5-mini) for agents that need tools.
```
This is by design — CLI tools output plain text only.

## All 4 Browser Providers
| Provider | Models | Login Cmd | Profile Dir |
|---|---|---|---|
| Grok | web-grok/grok-3, grok-3-fast, grok-3-mini, grok-3-mini-fast | /grok-login | ~/.openclaw/grok-profile/ |
| Gemini | web-gemini/gemini-2-5-pro, gemini-2-5-flash, gemini-3-pro, gemini-3-flash | /gemini-login | ~/.openclaw/gemini-profile/ |
| Claude | web-claude/* (removed in v1.6.x) | /claude-login | ~/.openclaw/claude-profile/ |
| ChatGPT | web-chatgpt/* (removed in v1.6.x) | /chatgpt-login | ~/.openclaw/chatgpt-profile/ |

## Stats
- 22+ total models (7 CLI + 5 Codex + 4 Grok + 4 Gemini + 1 BitNet)
- Persistent Chromium profiles survive gateway restarts
- /bridge-status shows cookie-based status

## Release History (recent)
- v2.2.1 (2026-04-10): Fix vllm apiKey corruption (401 Unauthorized) + harden config-patcher to re-patch on wrong apiKey
- v2.2.0 (2026-04-09): Fix log spam (module-level guards), remove fuser -k restart loops, session restore gateway-only, EADDRINUSE graceful handling
- v2.1.0 (2026-03-19): Issue #6 workdir isolation, Issue #4 session mgmt enhancements, Issue #2 codex auth auto-import
- v2.0.0: Major version bump
- v1.9.2 (2026-03-15): Fix maxTokens/contextWindow for all CLI_MODELS (were 8192, now correct per vendor specs)
- v1.9.1: Previous stable
- v1.7.3 (2026-03-13): Fix cookie expiry tracking
- v1.7.0 (2026-03-13): Startup restore timeout fix, auto-relogin, vitest suite
- v1.6.0 (2026-03-13): Persistent Chromium profiles for all 4 providers

## Known Issues
- CLI models cannot do tool calls (by design — plain text proxy)
- Opus via CLI proxy may halluzinate XML tool-call tags when maxTokens was too low (fixed in v1.9.2)
