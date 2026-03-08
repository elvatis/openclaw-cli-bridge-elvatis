# CONVENTIONS.md — openclaw-cli-bridge-elvatis

## Language & Runtime
- TypeScript strict mode, ESM (`"type": "module"`)
- Node 16 module resolution (`"moduleResolution": "Node16"`)
- Target: ES2022

## Package
- Scope: `@elvatis_com/openclaw-cli-bridge-elvatis`
- Plugin ID: `openclaw-cli-bridge-elvatis`
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

### Before release
1. `npm run typecheck` — must pass
2. `npm test` — all tests must pass
3. Bump version in ALL of these (grep to find all occurrences first!):
   - `package.json`
   - `openclaw.plugin.json`
   - `README.md` → `**Current version:** \`X.Y.Z\``
   - `SKILL.md` → `**Version:** X.Y.Z` (at the bottom)
   - `.ai/handoff/STATUS.md` → header line + npm/ClawHub lines
   - Add changelog entry for new version in `README.md`
   ```bash
   grep -rn "X\.Y\.Z\|Current version\|Version:" \
     --include="*.md" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git
   ```

### Publish (all three platforms, no exceptions)
4. `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`
5. `gh release create vX.Y.Z --title "..." --notes "..."`
6. `npm publish --access public`
7. ClawHub (use rsync workaround — `.clawhubignore` is NOT respected by `clawhub publish`):
   ```bash
   TMP=$(mktemp -d)
   rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' \
     --exclude='package-lock.json' ./ "$TMP/"
   clawhub publish "$TMP" --slug openclaw-cli-bridge-elvatis \
     --name "OpenClaw CLI Bridge" --version X.Y.Z --changelog "..." --no-input
   rm -rf "$TMP"
   ```

### After release
8. Update ALL docs in this repo: STATUS.md, DASHBOARD.md, LOG.md, NEXT_ACTIONS.md, README.md, SKILL.md
9. Update MEMORY.md on server if architecture decisions changed

## Documentation Rule (MANDATORY)
**Every release MUST update the following files before committing:**
- `.ai/handoff/STATUS.md` — current version, state, open risks
- `.ai/handoff/DASHBOARD.md` — task table
- `.ai/handoff/LOG.md` — append entry for this session
- `.ai/handoff/NEXT_ACTIONS.md` — move done tasks, add new ones
- `README.md` — version number + any changed behavior
- `SKILL.md` — if commands or config changed

Skipping documentation = incomplete release. No exceptions.
