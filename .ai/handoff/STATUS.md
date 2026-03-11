# STATUS — openclaw-cli-bridge-elvatis

## Current Version: 1.0.0 (npm + ClawHub + GitHub) ✅ RELEASED

## All 4 Providers LIVE — Tested 2026-03-11 22:24
| Provider | Status | Models | Command |
|---|---|---|---|
| Grok | ✅ | web-grok/grok-3, grok-3-fast, grok-3-mini, grok-3-mini-fast | /grok-login |
| Claude | ✅ | web-claude/claude-sonnet, claude-opus, claude-haiku | /claude-login |
| Gemini | ✅ | web-gemini/gemini-2-5-pro, gemini-2-5-flash, gemini-3-pro, gemini-3-flash | /gemini-login |
| ChatGPT | ✅ | web-chatgpt/gpt-4o, gpt-4o-mini, gpt-o3, gpt-o4-mini, gpt-5 | /chatgpt-login |

Live test: "What is the capital of France?"
- Grok: "Paris" ✅
- Claude: "Paris" ✅
- Gemini: "Paris" ✅
- ChatGPT: "Paris" ✅

## Stats
- 22 total models, 16 web-session models
- 96/96 tests green (8 test files)
- 0 zombie Chromium processes (singleton CDP, cleanupBrowsers on stop)
- Cookie expiry tracking for all 4 providers

## Known Issue: Browser persistence after Gateway restart
After SIGUSR1/full restart, OpenClaw browser is gone (CDP ECONNREFUSED).
Workaround: manually open browser + 4 provider pages → lazy connect takes over.
Fix needed: auto-start browser on plugin init, or keep-alive ping.

## Next Steps (v1.1.x)
- Auto-reconnect OpenClaw browser on plugin start
- /status command showing all 4 providers at once
- Context-window management for long conversations (new page per conversation)
- Handle model-switching within chatgpt.com (dropdown selector)
- Handle Gemini model switching (2.5 Pro vs Flash vs 3)
