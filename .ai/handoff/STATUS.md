# STATUS — openclaw-cli-bridge-elvatis

## Current Version: 0.2.28 (npm + ClawHub + GitHub)

## What's Done
- v0.2.25: Sleep-resilient token refresh (setInterval), staged /cli-* switch
- v0.2.26: Grok DOM-polling bridge (grok-client.ts, grok-session.ts)
- v0.2.27: Persistent Chromium profile (~/.openclaw/grok-profile/)
- v0.2.28: Cookie-expiry tracking (/grok-status shows ✅/⚠️/🚨)
- claude-browser.ts: DOM-automation for claude.ai (not yet in proxy — NEXT)
- 77/77 tests green

## Next: v0.3.x → v1.0.0 — Full Headless Provider Bridge

### Provider Status
| Provider | DOM confirmed | browser.ts | Proxy routed | Login cmd | Tests |
|---|---|---|---|---|---|
| Grok | ✅ | ✅ grok-client.ts | ✅ web-grok/* | ✅ /grok-login | ✅ |
| Claude | ✅ | ✅ claude-browser.ts | ❌ | ❌ | partial |
| Gemini | ❌ | ❌ | ❌ | ❌ | ❌ |
| ChatGPT | ❌ | ❌ | ❌ | ❌ | ❌ |

### Claude DOM (confirmed 2026-03-11)
- URL: https://claude.ai/new
- Editor: .ProseMirror (tiptap)
- Messages: [data-test-render-count] divs
- Assistant msgs: child div class "group" (no "mb-1 mt-6")
- User msgs: child div class "mb-1 mt-6 group"
- CLOUDFLARE: persistent headless blocked — must use OpenClaw browser (CDP 18800)
- Tested working: CLAUDE_WORKS response confirmed via OpenClaw browser

### Next Steps (in order)
1. Add connectToOpenClawBrowser() to claude-browser.ts (same as grok-session.ts)
2. Add web-claude/* routing to proxy-server.ts (same as web-grok/*)
3. Add /claude-login, /claude-status, /claude-logout to index.ts
4. Add claude-browser integration tests (DI-override, same as grok-proxy.test.ts)
5. Repeat for Gemini (gemini.google.com) and ChatGPT (chatgpt.com)
6. Bump to v1.0.0 when all 4 providers green + all tests pass

## Key Files
- src/claude-browser.ts — Claude DOM automation (ready, not wired)
- src/grok-client.ts — reference implementation
- src/grok-session.ts — reference for login/session management
- src/proxy-server.ts — add web-claude/* routing here
- index.ts — add /claude-login here
- test/claude-browser.test.ts — unit tests (partial, needs proxy integration test)

## Constraints
- OpenClaw browser (CDP 18800) required for Cloudflare bypass
- persistent profile approach fails (fingerprint mismatch)
- Each provider: own profile dir ~/.openclaw/<provider>-profile/
- All providers share same proxy port 31337
- Publish only after full test pass (77+ tests green)
- All 3 platforms on every release: GitHub + npm + ClawHub
