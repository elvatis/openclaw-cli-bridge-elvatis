# STATUS — openclaw-cli-bridge-elvatis

## Current Version: 1.6.1

## All 4 Providers Available — persistent Chromium profiles
| Provider | Status | Models | Login Cmd | Cookie Expiry |
|---|---|---|---|---|
| Grok | ✅ | web-grok/grok-3, grok-3-fast, grok-3-mini, grok-3-mini-fast | /grok-login | ~178d |
| Gemini | ✅ | web-gemini/gemini-2-5-pro, gemini-2-5-flash, gemini-3-pro, gemini-3-flash | /gemini-login | ~398d |
| Claude.ai | ⚠️ expired | web-claude/claude-sonnet, claude-opus, claude-haiku | /claude-login | EXPIRED |
| ChatGPT | ⚠️ expiring | web-chatgpt/gpt-4o, gpt-4o-mini, gpt-o3, gpt-o4-mini, gpt-5 | /chatgpt-login | ~6d |

## Stats
- 22 total models (6 CLI + 16 web-session)
- 96/96 tests green (8 test files)
- All 4 providers use launchPersistentContext — sessions survive gateway restarts
- /bridge-status shows cookie-based status (independent of in-memory context)

## Architecture: Browser Lifecycle
- **Profile dirs:** `~/.openclaw/{grok,gemini,claude,chatgpt}-profile/`
- **On plugin start:** startup restore attempts headless reconnect from saved profiles (5s delay)
- **On /xxx-login:** headed browser, user logs in, cookies baked to profile automatically
- **On request (no in-memory ctx):** proxy lazy-launches persistent context on first request
- **On /xxx-logout:** closes context + deletes profile + clears expiry file
- **bridge-status:** uses cookie expiry files as source of truth (not in-memory state)
  - ✅ active — browser connected and verified
  - 🟡 logged in, browser not loaded — cookies valid, lazy-loads on first request
  - 🔴 session expired — needs /xxx-login
  - ⚪ never logged in

## Release History
- v1.6.1 (2026-03-13): Fix /bridge-status — use cookie expiry as source of truth, not in-memory context
- v1.6.0 (2026-03-13): Persistent Chromium profiles for all 4 providers (Claude web + ChatGPT)
- v1.5.1 (2026-03-12): Fix hardcoded plugin version
- v1.5.0 (2026-03-12): Remove /claude-login and /chatgpt-login (pre-v1.6.0 interim)
- v1.4.0 (2026-03-12): Persistent browser fallback for Claude/Gemini/ChatGPT (no CDP required)
- v1.3.5 (2026-03-12): Startup restore guard (SIGUSR1 OOM fix)
- v1.3.0 (2026-03-11): Browser auto-reconnect after gateway restart
- v1.0.0 (2026-03-11): All 4 providers headless — 96/96 tests

## Next Steps
- /claude-login needs to be run (session expired)
- /chatgpt-login needs to be run in ~6 days
- Gemini model switching via UI (2.5 Pro vs Flash vs 3)
- Context-window management for long conversations
