# STATUS — openclaw-cli-bridge-elvatis

## Current Version: 1.3.3 (npm + ClawHub + GitHub) ✅ RELEASED

## All 4 Providers Available — on-demand via /xxx-login
| Provider | Status | Models | Command |
|---|---|---|---|
| Grok | ✅ | web-grok/grok-3, grok-3-fast, grok-3-mini, grok-3-mini-fast | /grok-login |
| Claude | ✅ | web-claude/claude-sonnet, claude-opus, claude-haiku | /claude-login |
| Gemini | ✅ | web-gemini/gemini-2-5-pro, gemini-2-5-flash, gemini-3-pro, gemini-3-flash | /gemini-login |
| ChatGPT | ✅ | web-chatgpt/gpt-4o, gpt-4o-mini, gpt-o3, gpt-o4-mini, gpt-5 | /chatgpt-login |

## Stats
- 22 total models, 16 web-session models
- 96/96 tests green (8 test files)
- 0 zombie Chromium processes at startup (browsers on-demand only)
- Cookie expiry tracking for all 4 providers
- Singleton guard on ensureAllProviderContexts (no concurrent spawns)

## Architecture: Browser Lifecycle
- **On plugin start:** NO browser launched automatically
- **On /xxx-login:** launches persistent Chromium for that provider only
- **On request (no context):** returns null → caller sees "not logged in" error
- **On /xxx-logout:** closes context + deletes session file

## Known Issues
- Cloudflare may block headless Chromium for Claude/Gemini without a valid CDP session
  → Workaround: have OpenClaw browser open on the provider's page, then /xxx-login

## Release History
- v1.3.3 (2026-03-12): Remove startup auto-connect — browsers on-demand only (OOM fix)
- v1.3.2 (2026-03-12): Singleton guard on ensureAllProviderContexts (resource leak fix)
- v1.3.1 (2026-03-11): Cookie baking into persistent profiles on login
- v1.3.0 (2026-03-11): Browser auto-reconnect after gateway restart
- v1.2.0 (2026-03-11): Fresh page per request + ChatGPT model switching
- v1.1.0 (2026-03-11): Auto-connect on startup + /bridge-status
- v1.0.0 (2026-03-11): All 4 providers headless (Grok/Claude/Gemini/ChatGPT) — 96/96 tests
- v0.2.x: Grok (v0.2.26-28), Claude (v0.2.29), Gemini (v0.2.30)
- v0.2.25: Sleep-resilient token refresh + staged /cli-* switching

## Next Steps
- Context-window management for long conversations
- Gemini model switching (2.5 Pro vs Flash vs 3) via UI
- /bridge-status: show per-provider login state + cookie expiry
