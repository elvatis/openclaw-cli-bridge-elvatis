# LOG.md — openclaw-cli-bridge-elvatis

_Last 10 sessions. Older entries in LOG-ARCHIVE.md._

---

## 2026-04-10 — Session 10 (Claude Opus 4.6)

> **Agent:** claude-opus-4-6
> **Phase:** fix
> **Commit before:** v2.2.0
> **Commit after:** v2.2.1

**T-018: Fix vllm apiKey corruption causing 401 + harden config-patcher**

### Problem
The vllm provider in `~/.openclaw/openclaw.json` had `"apiKey": "__OPENCLAW_KEEP__"` instead of `"cli-bridge"`. The CLI bridge proxy on port 31337 expects `Authorization: Bearer cli-bridge` and rejects any other value with HTTP 401.

This caused all `vllm/cli-claude/*` requests to fail silently, triggering the self-healing plugin's model fallback to `openai-codex/gpt-5.1`.

**Root cause:** An OpenClaw config migration overwrote the apiKey with the marker value `__OPENCLAW_KEEP__`. The config-patcher only checked whether cli-bridge models existed (line 46–53) — if they did, it skipped re-patching even though the apiKey was wrong.

### Fix (src/config-patcher.ts)
- Added `existingApiKey` / `hasCorrectApiKey` check to the skip-guard (line 55)
- Patcher now re-patches if `apiKey !== "cli-bridge"`, preventing recurrence after future config migrations

### Also in this session
- Fixed `~/.openclaw/openclaw.json` directly: `"apiKey": "__OPENCLAW_KEEP__"` → `"cli-bridge"`
- Gateway restarted — no 401 errors, self-heal model order confirmed working

### Build
- `npm run build` — ✅ (pre-existing TS errors from missing openclaw/plugin-sdk, JS emitted via `--noEmitOnError false`)

### Version
2.2.0 → 2.2.1

---

## 2026-04-09 — Session 9 (Claude Opus 4.6)

> **Agent:** claude-opus-4-6
> **Phase:** fix
> **Commit before:** v2.1.3
> **Commit after:** v2.2.0

**T-017: Fix log spam, restart loops, CLI blocking**

### Problems
1. `register()` called per-agent (~11×) — every call logged Chrome check, provider registration, and all 32 commands
2. `fuser -k` port cleanup killed the gateway process itself (proxy runs in-process), causing systemd restart loops
3. `openclaw models status` (and other CLI commands) hung indefinitely because session restore launched 4 Chromium instances

### Fixes (index.ts, src/proxy-server.ts)
- Module-level `_registerLoggedOnce` guard — Chrome/provider/commands logged once per process start
- Module-level `_proxyStarted` guard — proxy start runs once, not per-agent
- Shortened command log: count + `/cli-list` reference instead of listing all 32 names
- Removed `fuser -k` — EADDRINUSE handled gracefully (skip + log)
- `_proxyOwnedByThisProcess` flag — session restore only runs in gateway mode, skipped for CLI commands
- Codex auth import runs once per startup, not per-agent

### Also in this session
- Installed cli-bridge plugin on production server (operator@production-gateway)
- Set default model to `vllm/cli-claude/claude-sonnet-4-6` (Claude CLI, no API costs)
- Merged 3 Dependabot PRs (#13, #17, #19)

---

## 2026-03-13 — Session 8 (Claude Opus 4.6)

> **Agent:** claude-opus-4-6
> **Phase:** fix
> **Commit before:** v1.7.2
> **Commit after:** v1.7.3

**T-013: Fix cookie expiry tracking — longest-lived auth cookie for all 4 providers**

### Problem
`scanClaudeCookieExpiry()` included `__cf_bm` (Cloudflare Bot Management cookie, ~30 min lifetime)
in its cookie filter list and sorted ascending by expiry (earliest first). Result: the saved
`claude-cookie-expiry.json` always showed `cookieName: "__cf_bm"` expiring in ~30 minutes.

**Impact:**
- Every gateway startup, the cookie-first check (`expiresAt - Date.now() > 1h`) failed immediately
- Fallback browser-check (headless `.ProseMirror` selector) also failed (Cloudflare block)
- `/claude-login` added to `needsLogin[]` → WhatsApp alert sent on every restart
- Same pattern affected ChatGPT (`_puid` ~7d was picked over longer-lived session tokens),
  Gemini, and Grok (all sorted ascending = shortest wins)

### Fix (index.ts)

**`scanClaudeCookieExpiry()`** (line 152):
- Removed `__cf_bm` from cookie filter list (only `sessionKey`, `lastActiveOrg` remain)
- Reversed sort: `(b.expires) - (a.expires)` → picks longest-lived cookie
- Renamed variable `earliest` → `longest` for clarity

**`scanChatGPTCookieExpiry()`** (line 176):
- Reversed sort: now picks longest-lived of `__Secure-next-auth.session-token` / `_puid` / `oai-did`

**`scanGeminiCookieExpiry()`** (line 135):
- Reversed sort: now picks longest-lived of `__Secure-1PSID` / `__Secure-3PSID` / `SID`

**`scanCookieExpiry()` (Grok)** (line 216):
- Reversed reduce: `c.expires > min.expires` instead of `<`

**Stale files deleted:**
- `~/.openclaw/claude-cookie-expiry.json` (contained `__cf_bm` with 30-min expiry)
- `~/.openclaw/chatgpt-cookie-expiry.json` (contained `_puid` with ~7d expiry)

### Build
- `npm run build` — ✅ (pre-existing TS errors from missing openclaw/plugin-sdk, JS emitted via `--noEmitOnError false`)

### Version
1.7.2 → 1.7.3

---

## 2026-03-12 — Session 7 (Claude Opus 4.6)

> **Agent:** claude-opus-4-6
> **Phase:** fix
> **Commit before:** v1.3.5
> **Commit after:** v1.4.0

**T-012: Persistent browser fallback for Claude/Gemini/ChatGPT login commands**

### Problem
`/claude-login`, `/gemini-login`, `/chatgpt-login` all called `connectToOpenClawBrowser()` directly,
which only tries CDP on `http://127.0.0.1:18800`. If Chrome was not running with
`--remote-debugging-port=18800`, all three commands failed with "Could not connect to OpenClaw browser".
Grok already had the fallback pattern (CDP -> persistent Chromium) since v0.2.27, but the other
three providers never got it.

### Fix (index.ts)

**New constants:** `CLAUDE_PROFILE_DIR`, `GEMINI_PROFILE_DIR`, `CHATGPT_PROFILE_DIR`

**New functions:** `getOrLaunchClaudeContext()`, `getOrLaunchGeminiContext()`, `getOrLaunchChatGPTContext()`
- Same pattern as `getOrLaunchGrokContext()`: return existing context -> try CDP -> fall back to persistent Chromium
- Concurrent launch requests coalesced via promise guard (no duplicate Chromium spawns)

**Updated login handlers:** `/claude-login`, `/gemini-login`, `/chatgpt-login` now follow the Grok pattern:
1. Try to import cookies from CDP (optional, catches errors gracefully)
2. `getOrLaunchXxxContext()` (CDP or persistent Chromium fallback)
3. Inject imported cookies if available
4. Navigate and verify

**Updated proxy callbacks:** `connectClaudeContext`, `connectGeminiContext`, `connectChatGPTContext` in
both proxy server setup blocks now use `getOrLaunchXxxContext()` instead of `connectToOpenClawBrowser()`.

**Updated `cleanupBrowsers()`:** Now properly closes Claude, Gemini, and ChatGPT persistent contexts.

### Build + Tests
- `npm run build` - only pre-existing errors (openclaw/plugin-sdk not available locally)
- `npm test` - 96/96 green, 0 failures

### Version
1.3.5 -> 1.4.0 (feature: persistent fallback for all providers)

---

## 2026-03-11 — Session 6 (Akido / claude-sonnet-4-6)

> **Agent:** claude-sonnet-4-6
> **Phase:** implementation
> **Commit before:** (unpublished local, v0.2.24 base)
> **Commit after:** pending (v0.2.25)

**T-011: Session-safe staged model switching**

### Problem
`/cli-*` commands called `openclaw models set <model>` immediately — a global, instantaneous
switch. If a conversation was in progress, the running agent lost its context mid-task:
tool calls failed silently, plan files weren't written, no error feedback. Session had to
be abandoned. Root cause: no API exists in the plugin SDK to detect if a session is active;
the switch always went through regardless.

### Fix (index.ts)

**New state file:** `~/.openclaw/cli-bridge-pending.json` — stores a staged switch
(`{ model, label, requestedAt }`).

**`switchModel()` refactored into two paths:**
- `applyModelSwitch()` — runs `openclaw models set` immediately (extracted helper)
- `switchModel(forceNow=false)` — stages by default, calls `applyModelSwitch` only with `--now`

**New commands registered:**
- `/cli-apply` — apply staged switch; safe to run after finishing the current task
- `/cli-pending` — show current staged switch state
- `/cli-back` — now also calls `clearPending()` to discard any staged switch

**All `/cli-*` switch commands updated:**
- `acceptsArgs: true` — passes `--now` flag through
- Default: stages + shows warning with instructions
- `--now`: immediate (explicit user choice)

**`/cli-list` updated** to show pending state inline and switching instructions.

### Build + Tests
- `npm run build` — ✅ clean
- `npm test` — ✅ 51/51 (no test changes needed; new code is command-handler logic)

### Version
0.2.24 → 0.2.25 (feature bump: staged switching is new behavior, not just a fix)

---

## 2026-03-11 — Session 5 (Akido / claude-sonnet-4-6)

> **Agent:** claude-sonnet-4-6
> **Phase:** fix
> **Commit before:** (unpublished local, v0.2.23 base)
> **Commit after:** pending (v0.2.24, not yet committed)

**T-009: Stability — sleep-resilient token refresh + timer cleanup**

### Problem
`scheduleTokenRefresh()` in `claude-auth.ts` used a single long `setTimeout` (potentially hours).
Three issues:
1. **Sleep-miss:** If the server went to sleep/hibernate during the timeout window, the timer fired late or not at all. Token expired silently.
2. **Timer-leak:** Repeated calls to `scheduleTokenRefresh()` (e.g., after a refresh) didn't reliably clear the old timer. Duplicate intervals could accumulate.
3. **No cleanup hook:** The `setInterval`/`setTimeout` was never stopped when the proxy server closed, leaving orphaned timers after plugin teardown.

### Fix (3 files)

**`src/claude-auth.ts`:**
- Replaced `refreshTimer: ReturnType<typeof setTimeout>` with `refreshTimer: ReturnType<typeof setInterval>`
- Added `nextRefreshAt: number` state variable — tracks when the next refresh is due (epoch ms)
- Replaced `setTimeout(msUntilRefresh)` with `setInterval(10 * 60 * 1000)` — polls every 10 min, checks `Date.now() >= nextRefreshAt`
- Exported `stopTokenRefresh()` — clears the interval and resets state; safe to call multiple times
- `stopTokenRefresh()` called at top of `scheduleTokenRefresh()` — guarantees no duplicate intervals
- `doRefresh()` no longer calls `scheduleTokenRefresh()` recursively — updates `nextRefreshAt` in-place instead

**`src/proxy-server.ts`:**
- Imported `stopTokenRefresh` from `claude-auth.js`
- Added `server.on("close", () => { stopTokenRefresh(); })` — interval is cleaned up automatically when the server closes

**`openclaw.plugin.json` + `index.ts` + `package.json`:**
- Version bumped 0.2.23 → 0.2.24

### Build
`npm run build` — ✅ clean, no TypeScript errors

### Not yet done
- `npm test` not run (no logic changes to model routing/proxy; assumed passing)
- Not published to GitHub/npm/ClawHub yet → T-010

---

## 2026-03-11 — Session 4 (Akido / claude-sonnet-4-6)

> **Agent:** claude-sonnet-4-6
> **Phase:** review + analysis
> **Note:** Planning session. Code analysis of proxy/auth architecture. Plan written to `~/.claude/plans/buzzing-honking-corbato.md`. Implementation deferred to Session 5.

---

## 2026-03-08 — Session 3 (Akido / claude-sonnet-4-6)

**Critical bug: Gateway SIGKILL via fuser (fixed in v0.2.9)**

Root cause: `fuser -k 31337/tcp` (added in v0.2.8) sent SIGKILL to the gateway process itself during in-process hot-reloads. The same gateway process holds port 31337 after spawning the proxy. `fuser -k` found it as the port owner and killed it → `code=killed, status=9/KILL` in systemd journal, 1.9G memory peak at death.

Fix: replaced `fuser -k` with a safe health probe. Before binding, `GET /v1/models` is sent to the existing proxy. If 200 → reuse silently. If EADDRINUSE + no response → wait 1s and retry once. No process killing.

**Release pipeline:**
- v0.2.9 → v0.2.21 (incremental fixes: requireAuth, vllm prefix, XDG env vars, model allowlist, tests)
- All published to GitHub, npm, ClawHub

---

## 2026-03-07 — Session 2 (Akido / claude-sonnet-4-6)

**Bug: Port leak on gateway hot-reload (fixed in v0.2.6)**

Root cause: HTTP proxy server on port 31337 had no cleanup handler. On hot-reloads, old server kept port bound. Fix: `api.registerService({ stop: async () => server.close() })` + `closeAllConnections()`.

Also fixed: `openclaw.extensions` missing from `package.json`; `.clawhubignore` documented with rsync workaround.

**Root conflict with openclaw-self-healing-elvatis** resolved: self-healing's `lastRestartAt` was saved after `openclaw gateway restart` (kills process). Fixed in self-healing v0.2.8.

---

## 2026-03-07 — Session 1 (gpt-5.3-codex / sonnet)

**Architecture: Phase 1 + 2 + 3 implemented**

- Phase 1: `openai-codex` auth bridge via `~/.codex/auth.json`
- Phase 2: local OpenAI-compatible proxy (`src/proxy-server.ts`, `src/cli-runner.ts`, `src/config-patcher.ts`)
  - Gemini CLI → `cli-gemini/*` models (prompt via stdin, cwd=tmpdir)
  - Claude Code CLI → `cli-claude/*` models (prompt via stdin, --permission-mode plan)
- Phase 3: `/cli-sonnet`, `/cli-opus`, `/cli-haiku`, `/cli-gemini`, `/cli-gemini-flash`, `/cli-gemini3`, `/cli-codex`, `/cli-codex-mini`, `/cli-back`, `/cli-test`

Published to GitHub, npm, ClawHub at v0.2.5.

Known issue: `openai-codex/gpt-5.4` → 401 missing scope `model.request` (OpenAI account limitation, not a bug).
