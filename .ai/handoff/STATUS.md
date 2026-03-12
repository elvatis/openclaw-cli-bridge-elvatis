# STATUS — openclaw-cli-bridge-elvatis

## Current Version: 1.4.0

## All 4 Providers Available — on-demand via /xxx-login (no CDP required)
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
- Persistent Chromium fallback for all 4 providers (no CDP dependency)

## Architecture: Browser Lifecycle
- **On plugin start:** NO browser launched automatically
- **On /xxx-login:** tries CDP import (optional) then launches persistent Chromium for that provider
- **CDP unavailable?** No problem - persistent Chromium from saved profile is used automatically
- **On request (no context):** proxy callbacks also use persistent fallback before returning null
- **On /xxx-logout:** closes context + deletes session file

## Known Issues
- Cloudflare may block headless Chromium for some providers without cookies
  - Workaround: first login via OpenClaw browser (CDP), subsequent restarts use saved profile

## Release History
- v1.4.0 (2026-03-12): Persistent browser fallback for Claude/Gemini/ChatGPT (no CDP required)
- v1.3.5 (2026-03-12): Startup restore guard - runs only once per process (SIGUSR1 fix)
- v1.3.4 (2026-03-12): Safe sequential session restore from saved profiles
- v1.3.3 (2026-03-12): Remove startup auto-connect - browsers on-demand only (OOM fix)
- v1.3.2 (2026-03-12): Singleton guard on ensureAllProviderContexts (resource leak fix)
- v1.3.1 (2026-03-11): Cookie baking into persistent profiles on login
- v1.3.0 (2026-03-11): Browser auto-reconnect after gateway restart
- v1.2.0 (2026-03-11): Fresh page per request + ChatGPT model switching
- v1.1.0 (2026-03-11): Auto-connect on startup + /bridge-status
- v1.0.0 (2026-03-11): All 4 providers headless (Grok/Claude/Gemini/ChatGPT) - 96/96 tests

## Next Steps
- Context-window management for long conversations
- Gemini model switching (2.5 Pro vs Flash vs 3) via UI
