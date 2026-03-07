# NEXT_ACTIONS.md — openclaw-cli-bridge

_Last updated: 2026-03-07_

## Immediate (T-003)

1. **Test auth flow**
   ```bash
   openclaw models auth login --provider openai-codex
   ```
   Expected: sees "Codex CLI (existing login)" option, reads tokens from `~/.codex/auth.json`, registers profile.

2. **Verify model call**
   Switch to `openai-codex/gpt-5.2` or `openai-codex/gpt-5.3-codex` and send a test message.

## Next (T-005, T-006)

3. **Gemini bridge** — implement `src/gemini-auth.ts` that reads `~/.gemini/` or Google CLI token store and registers a fallback `google-gemini-cli` provider.

4. **Claude Code bridge** — implement `src/claude-auth.ts` reading `~/.claude/` OAuth credentials.

## Later (T-007)

5. **Publish** — GitHub repo (elvatis org), npm `@elvatis_com/openclaw-cli-bridge`, ClawHub.
6. **README** — installation + usage instructions.
7. **Self-heal integration** — update `openclaw-self-healing-elvatis` model order to use `openai-codex` via this bridge.
