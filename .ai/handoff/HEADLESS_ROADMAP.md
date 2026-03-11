# Headless Browser Bridge — Roadmap

## Ziel
Alle Provider (Claude, Gemini, Codex/ChatGPT, Grok) über Playwright Browser-Sessions
betreiben — keine lokalen CLI-Binaries mehr nötig. Ein headless Chromium, ein Proxy.

## Aktueller Stand (v0.2.28)
- ✅ Grok: DOM-Polling via grok.com (FERTIG, produktiv)
- ⏳ Claude: claude CLI binary → Ziel: claude.ai headless
- ⏳ Gemini: gemini CLI binary → Ziel: gemini.google.com headless
- ⏳ Codex: codex CLI binary → Ziel: chatgpt.com headless

## Reihenfolge
1. **Claude headless** (claude.ai) — höchste Priorität, meistgenutzt
2. **Gemini headless** (gemini.google.com)
3. **Codex/ChatGPT headless** (chatgpt.com)

## Pro Provider: Was zu bauen ist
Für jeden Provider brauchen wir:
1. `src/<provider>-browser.ts` — DOM-Automation (analog zu grok-client.ts)
   - `sendAndWait(page, message, timeoutMs)` — message senden, auf stable DOM warten
   - `getOrCreatePage(context)` — existierende Page reuse
2. Persistent profile dir: `~/.openclaw/<provider>-profile/`
3. Cookie-Expiry Tracking (analog zu grok-cookie-expiry.json)
4. `/provider-login`, `/provider-status`, `/provider-logout` Commands
5. `web-<provider>/*` Modell-Routing im Proxy
6. Tests: DOM-Stub via DI-Override (analog zu grok-proxy.test.ts)

## Pro Provider: DOM-Struktur zu ermitteln
(Muss live gecaptured werden — Browser offen lassen)

### Claude (claude.ai)
- Login: Google OAuth oder Email
- Editor selector: TBD (ProseMirror ähnlich wie Grok?)
- Response selector: TBD
- Anti-bot: Cloudflare?

### Gemini (gemini.google.com)
- Login: Google Account (gleicher wie Gemini CLI)
- Editor selector: TBD
- Response selector: TBD
- Anti-bot: Google reCAPTCHA?

### ChatGPT (chatgpt.com)
- Login: OpenAI Account oder Google/Microsoft OAuth
- Editor selector: TBD (ProseMirror?)
- Response selector: TBD
- Anti-bot: Cloudflare?

## Modell-IDs (nach Implementierung)
```
web-claude/claude-sonnet    → claude.ai (Sonnet)
web-claude/claude-opus      → claude.ai (Opus, Pro plan)
web-gemini/gemini-2-5-pro   → gemini.google.com (2.5 Pro)
web-gemini/gemini-flash     → gemini.google.com (Flash)
web-chatgpt/gpt-4o          → chatgpt.com (GPT-4o)
web-chatgpt/gpt-o3          → chatgpt.com (o3)
web-grok/grok-3             → grok.com (✅ bereits fertig)
```

## Version-Plan
- v0.2.x  — Claude headless (+ Tests)
- v0.3.x  — Gemini headless (+ Tests)
- v0.4.x  — ChatGPT headless (+ Tests)
- **v1.0.0** — Alle 4 Provider headless, CLI-Dependencies optional,
               vollständige Testabdeckung, CHANGELOG komplett

## Voraussetzungen vor jedem Provider-Release
- [ ] Alle Tests grün (inkl. neuer Provider-Tests)
- [ ] DOM-Struktur gecaptured (echte Requests intercepted)
- [ ] Cookie-Expiry Tracking implementiert
- [ ] Persistent profile directory dokumentiert
- [ ] Manuelle End-to-End Test durchgeführt
- [ ] Alle 3 Plattformen published (GitHub, npm, ClawHub)

## Notizen
- DOM-Polling interval: 500ms, stable after 3 consecutive identical reads
- Timeout default: 120s (konfigurierbar via pluginConfig.timeoutMs)
- Jeder Provider: eigenes Chromium-Profil → Cookies unabhängig
- Grok-Strategie: grok.com öffnen, ProseMirror füllen, Enter, .message-bubble pollen
- Cloudflare-Bypass: KEINE direkten fetch()-Calls — immer DOM-Automation
