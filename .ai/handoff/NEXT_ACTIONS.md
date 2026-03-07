# NEXT_ACTIONS.md — openclaw-cli-bridge-elvatis

_Last updated: 2026-03-07_

## Immediate

1. **Validate proxy runtime**
   - Confirm local proxy listens on `127.0.0.1:31337`
   - Test:
     - `GET /v1/models`
     - `POST /v1/chat/completions` (non-stream + stream)

2. **Validate OpenClaw vllm integration**
   - Ensure `models.providers.vllm` contains `cli-gemini/*` + `cli-claude/*`
   - Send live test prompts with:
     - `vllm/cli-gemini/gemini-2.5-pro`
     - `vllm/cli-claude/claude-sonnet-4-6`

3. **Stability pass**
   - Confirm timeout behavior and error mapping (CLI exits, malformed output)
   - Confirm no secret leakage in logs

## Next

4. **Self-heal integration**
   - Update `openclaw-self-healing-elvatis` model order for dev-safe default fallback chain.

5. **Release pipeline**
   - GitHub release tag
   - npm publish (`@elvatis_com/openclaw-cli-bridge-elvatis`)
   - ClawHub publish

## Optional hardening

- Add unit tests for prompt formatter + model router
- Add proxy auth key rotation via config
- Add explicit model allowlist for CLI execution
