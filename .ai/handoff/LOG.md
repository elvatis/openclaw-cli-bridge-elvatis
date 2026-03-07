# LOG.md — openclaw-cli-bridge-elvatis

## 2026-03-08 — Session 3 (Akido / claude-sonnet-4-6)

**Critical bug: Gateway SIGKILL via fuser (fixed in v0.2.9)**

Root cause: `fuser -k 31337/tcp` (added in v0.2.8) sent SIGKILL to the gateway
process itself during in-process hot-reloads. In hybrid reload mode, the same gateway
process reloads the plugin. At that point, the gateway holds port 31337 (via the proxy
it spawned earlier). `fuser -k` found the current gateway process as the port owner and
killed it with SIGKILL — visible in systemd journal as `code=killed, status=9/KILL` with
a 1.9G memory peak.

Fix: replaced `fuser -k` with a safe health probe. Before binding, `GET /v1/models` is
sent to the existing proxy. If it responds with 200, the proxy is reused silently
(`[cli-bridge] proxy already running on :31337 — reusing`). If EADDRINUSE but no
response (genuinely stale process), wait 1s and retry once. No process killing.

**Release pipeline:**
- v0.2.9 committed, tagged, pushed to GitHub
- GitHub release: https://github.com/elvatis/openclaw-cli-bridge-elvatis/releases/tag/v0.2.9
- npm: `@elvatis_com/openclaw-cli-bridge-elvatis@0.2.9`
- ClawHub: `openclaw-cli-bridge-elvatis@0.2.9`

---

## 2026-03-07 — Session 2 (Akido / claude-sonnet-4-6)

**Bug: Port leak on gateway hot-reload (fixed in v0.2.6)**

Root cause: HTTP proxy server on port 31337 had no cleanup handler. On hot-reloads
or gateway restarts, the old server instance kept the port bound. New plugin instance
couldn't bind → EADDRINUSE → proxy failed silently.

Fix: added `api.registerService({ id: "cli-bridge-proxy", stop: async () => server.close() })`
so OpenClaw calls `stop()` on plugin teardown.

Also added missing `openclaw.extensions` field to `package.json` (required for `openclaw plugins install --link`).
Added `.clawhubignore` and documented rsync workaround in CONVENTIONS.md (clawhub publish ignores .clawhubignore).

**Root conflict with openclaw-self-healing-elvatis:**
The infinite restart loop was caused by self-healing's `lastRestartAt` being saved after
`openclaw gateway restart` (which kills the process). Fixed in self-healing v0.2.8.
Both plugins now stable together.

**Release pipeline:**
- v0.2.6 committed, tagged, pushed to GitHub
- GitHub release: https://github.com/elvatis/openclaw-cli-bridge-elvatis/releases/tag/v0.2.6
- npm published: `@elvatis_com/openclaw-cli-bridge-elvatis@0.2.6`
- ClawHub published: `openclaw-cli-bridge-elvatis@0.2.6`

---

## 2026-03-07 — Session 1 (gpt-5.3-codex / sonnet)

**Architecture: Phase 1 + 2 + 3 implemented**

- Phase 1: `openai-codex` auth bridge via `~/.codex/auth.json`
- Phase 2: local OpenAI-compatible proxy (`src/proxy-server.ts`, `src/cli-runner.ts`, `src/config-patcher.ts`)
  - Gemini CLI → `cli-gemini/*` models
  - Claude Code CLI → `cli-claude/*` models
  - Prompt delivery via stdin (avoids E2BIG + Gemini agentic mode)
- Phase 3: `/cli-sonnet`, `/cli-opus`, `/cli-haiku`, `/cli-gemini`, `/cli-gemini-flash`, `/cli-gemini3`, `/cli-codex`, `/cli-codex-mini`, `/cli-back`, `/cli-test`

- Published to GitHub, npm, ClawHub at v0.2.5

**Known issue at time of session:**
- `openai-codex/gpt-5.4` → 401 missing scope `model.request` (external, OpenAI account limitation)
