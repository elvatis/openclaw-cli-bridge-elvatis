# Contributing & Release Checklist

## 🚨 Pflicht-Workflow vor jedem Release

**Kein Publish ohne erfolgreichen `/bridge-status` Test!**

### 1. Lint + Build

```bash
npm run lint    # ESLint — 0 errors required, warnings ok
npm run build   # Exit 0 erwartet — TS-Fehler sind ok (--noEmitOnError false), aber Exit != 0 blockiert
```

### 2. Gateway neu starten

```bash
openclaw gateway restart
# oder via Chat: gateway restart
```

### 3. Smoke Tests (alle müssen grün sein)

```
/bridge-status     → Grok ✅ + Gemini ✅ (beide connected, nicht "not connected")
/cli-test          → CLI bridge OK, Latency < 10s
/grok-status       → valid (Cookie-Expiry prüfen)
/gemini-status     → valid (Cookie-Expiry prüfen)
```

**Erst wenn alle Tests grün sind → publishen!**

### 4. Publish (Reihenfolge einhalten)

```bash
# 1. Version bump in package.json + openclaw.plugin.json (beide!)
# 2. Git commit + tag
git add package.json openclaw.plugin.json
git commit -m "chore: bump to vX.Y.Z — <kurze Beschreibung>"
git tag vX.Y.Z
git push origin main vX.Y.Z

# 3. GitHub Release erstellen (Tag ≠ Release!)
gh release create vX.Y.Z --title "vX.Y.Z — <Titel>" --notes "<Notes>" --latest

# 4. npm publish
npm publish --access public

# 5. ClawHub publish (aus tmp-Dir, nicht direkt aus Repo)
TMPDIR=$(mktemp -d)
rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' \
  --exclude='package-lock.json' --exclude='test' ./ "$TMPDIR/"
clawhub publish "$TMPDIR" --slug openclaw-cli-bridge-elvatis --version X.Y.Z \
  --tags "latest" --changelog "<Changelog>"
```

> ⚠️ **ClawHub Bug (CLI v0.7.0):** `acceptLicenseTerms: invalid value` — Workaround: `publish.js` vor dem Publish patchen und danach zurücksetzen. Details in AGENTS.md / MEMORY.md des Workspaces.

---

## 🚨 Doku-Regel (PFLICHT)

**Wenn ein Feature hinzukommt, geändert oder entfernt wird → SOFORT in ALLEN Doku-Dateien aktualisieren.**

Gilt für: `README.md`, `SKILL.md`, `CONTRIBUTING.md`, `openclaw.plugin.json`, ClawHub, npm, GitHub.

**Konkret für Slash Commands:**
- Neuer Command (`/cli-xyz`) → sofort in README Utility-Tabelle + ASCII-Beispielblock eintragen
- Command entfernt → sofort aus README + SKILL.md entfernen, nicht beim nächsten Release
- Command umbenannt → beide Stellen gleichzeitig ändern

**Tested Badge:**
- Neues Feature getestet → sofort `✅ Tested` Badge in README setzen

Kein "machen wir beim nächsten Release" — immer sofort, im gleichen Commit.

---

## Versionsstellen — alle prüfen vor Release

```bash
grep -rn "X\.Y\.Z\|version" \
  --include="*.md" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  | grep -i "version"
```

Typische Stellen:
- `package.json` → `"version": "..."` (Hauptquelle — `index.ts` liest automatisch daraus)
- `openclaw.plugin.json` → `"version": "..."`
- `README.md` → `**Current version:** ...` (falls vorhanden)

> **Seit v1.9.0:** `index.ts` liest die Version automatisch aus `package.json` — kein manuelles Sync mehr nötig für die Runtime-Version.

---

## Breaking Changes

Bei Breaking Changes (Major oder entfernte Commands):
- Version-Bump auf nächste **Minor** (z.B. 1.4.x → 1.5.0)
- GitHub Release Notes: `## ⚠️ Breaking Change` Sektion
- README Changelog: Was wurde entfernt + warum
- `/bridge-status` muss die entfernten Provider NICHT mehr zeigen

---

## TS-Build-Fehler

Die folgenden TS-Fehler sind bekannt und ignorierbar (kein Runtime-Problem):
- `TS2307: Cannot find module 'openclaw/plugin-sdk'` — Typ-Deklarationen fehlen in npm-Paket
- `TS2339: Property 'handler' does not exist on type 'unknown'` — folgt aus TS2307
- `TS7006: Parameter implicitly has 'any' type` — minor, kein Effekt

Build läuft mit `--noEmitOnError false` durch. `npm run build` → Exit 0 ist das Kriterium, nicht null TS-Fehler.

---

## Cookie Expiry Store (seit v1.9.0)

Cookie-Expiry-Daten werden jetzt in **einer** Datei gespeichert:
- `~/.openclaw/cookie-expiry.json` — enthält alle 4 Provider (grok, gemini, claude, chatgpt)

Legacy-Dateien (`grok-cookie-expiry.json`, `gemini-cookie-expiry.json`, etc.) werden beim ersten Start automatisch migriert und gelöscht.

---

## Model Fallback Chain (seit v1.9.0)

Wenn ein CLI-Modell fehlschlägt (Timeout, Fehler), wird automatisch ein leichteres Modell versucht:
- `gemini-2.5-pro` → `gemini-2.5-flash`
- `gemini-3-pro-preview` → `gemini-3-flash-preview`
- `claude-opus-4-6` → `claude-sonnet-4-6`
- `claude-sonnet-4-6` → `claude-haiku-4-5`

Die Response enthält das tatsächlich verwendete Modell im `model`-Feld.
