# STATUS — openclaw-cli-bridge-elvatis

## Current Version: 1.7.3

## All 4 Providers Available — persistent Chromium profiles
| Provider | Status | Models | Login Cmd | Cookie Expiry |
|---|---|---|---|---|
| Grok | ✅ | web-grok/grok-3, grok-3-fast, grok-3-mini, grok-3-mini-fast | /grok-login | ~178d |
| Gemini | ✅ | web-gemini/gemini-2-5-pro, gemini-2-5-flash, gemini-3-pro, gemini-3-flash | /gemini-login | ~398d |
| Claude.ai | ✅ | web-claude/claude-sonnet, claude-opus, claude-haiku | /claude-login | ~364d |
| ChatGPT | ✅ | web-chatgpt/gpt-4o, gpt-4o-mini, gpt-4.1, o3, o4-mini, gpt-5, gpt-5-mini | /chatgpt-login | ~6d (re-run /chatgpt-login to refresh) |

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

## Cookie Expiry Tracking (fixed in v1.7.3)
All 4 providers now track the **longest-lived** auth cookie instead of the shortest:
- Claude: `sessionKey` (~1 year) — was `__cf_bm` (Cloudflare, ~30 min) causing false alerts
- ChatGPT: longest of `__Secure-next-auth.session-token` / `_puid` / `oai-did`
- Gemini: longest of `__Secure-1PSID` / `__Secure-3PSID` / `SID`
- Grok: longest of `sso` / `sso-rw`

## Release History
- v1.7.3 (2026-03-13): Fix cookie expiry tracking — use longest-lived auth cookie for all 4 providers
- v1.7.2 (2026-03-13): Cookie-first startup restore (skip fragile browser selector check)
- v1.7.1 (2026-03-13): /status HTML dashboard at :31337
- v1.7.0 (2026-03-13): Startup restore timeout fix, auto-relogin, keep-alive verification, vitest suite
- v1.6.1 (2026-03-13): Fix /bridge-status — use cookie expiry as source of truth
- v1.6.0 (2026-03-13): Persistent Chromium profiles for all 4 providers (Claude web + ChatGPT)
- v1.5.1 (2026-03-12): Fix hardcoded plugin version
- v1.5.0 (2026-03-12): Remove /claude-login and /chatgpt-login (pre-v1.6.0 interim)
- v1.4.0 (2026-03-12): Persistent browser fallback for Claude/Gemini/ChatGPT (no CDP required)
- v1.3.5 (2026-03-12): Startup restore guard (SIGUSR1 OOM fix)
- v1.3.0 (2026-03-11): Browser auto-reconnect after gateway restart
- v1.0.0 (2026-03-11): All 4 providers headless — 96/96 tests

## Next Steps
- /chatgpt-login should be re-run soon (~6d left on _puid cookie)
- Gemini model switching via UI (2.5 Pro vs Flash vs 3)
- Context-window management for long conversations
