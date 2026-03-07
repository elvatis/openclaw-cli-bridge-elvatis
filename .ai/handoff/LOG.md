# LOG.md — openclaw-cli-bridge

## 2026-03-07 — Session 1 (claude-sonnet-4-6)

**Phase:** Scaffold + initial implementation

**Done:**
- Diagnosed root cause: `openai-codex` provider has no stock plugin in OpenClaw 2026.3.2
- Created project folder with AAHP structure at `.ai/handoff/`
- Built plugin skeleton: package.json, tsconfig.json, openclaw.plugin.json, index.ts, src/codex-auth.ts
- Symlinked global `openclaw` install for TypeScript type resolution (no extra dep needed)
- Typecheck: 0 errors
- Wired plugin into `~/.openclaw/openclaw.json` (allow + load.paths + entries)
- Gateway restarted successfully, no errors from doctor

**Key decisions:**
- Auth reads from `~/.codex/auth.json` directly (Codex CLI is already logged in, no re-login needed)
- `refreshOAuth` re-reads the file (Codex auto-refreshes tokens when it runs)
- `enableCodex: true` by default; Gemini + Claude bridges opt-in via config
- Token expiry estimated as `last_refresh + 3600s` (ChatGPT token lifetime)

**Not done:**
- Auth flow not yet tested end-to-end
- Model call not yet verified
