# CONVENTIONS.md — openclaw-cli-bridge

## Language & Runtime
- TypeScript strict mode, ESM (`"type": "module"`)
- Node 16 module resolution (`"moduleResolution": "Node16"`)
- Target: ES2022

## Package
- Scope: `@elvatis_com/openclaw-cli-bridge`
- Plugin ID: `openclaw-cli-bridge`
- Providers declared: `["openai-codex"]`

## File Layout
```
.ai/handoff/         ← AAHP protocol files (this folder)
src/                 ← per-CLI auth modules (codex-auth.ts, gemini-auth.ts, ...)
index.ts             ← plugin entry point (registerProvider calls)
openclaw.plugin.json ← manifest
package.json / tsconfig.json
```

## Code Style
- Named exports from `src/`, default export from `index.ts`
- No secrets printed to logs — redact tokens with `[REDACTED]`
- Auth files accessed read-only
- Error messages must include actionable fix hint (e.g. "Run 'codex login' and retry")

## Release Checklist (mandatory for every publish)
1. GitHub tag + release (elvatis org)
2. `npm publish --access public`
3. `clawhub publish`
