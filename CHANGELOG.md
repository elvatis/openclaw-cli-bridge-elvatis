# Changelog

## v2026.7.1 — 2026-07-17

### Added

**OpenRouter integration**
- New `openrouter-api/*` provider routes 16 models via `OPENROUTER_API_KEY` in `.env`
- Models: Claude Opus/Sonnet/Haiku, GPT-4o, GPT-4.1, o3, Gemini 2.5 Pro/Flash, Grok 3, DeepSeek R1/V3, Llama 4 Maverick/Scout, Mistral Large/Small
- Slash commands: `/or-opus`, `/or-sonnet`, `/or-haiku`, `/or-gpt4o`, `/or-gpt41`, `/or-o3`, `/or-gemini`, `/or-gemini-flash`, `/or-grok3`, `/or-deepseek`, `/or-deepseek-v3`, `/or-llama4`

**LM Studio integration**
- New `lm-studio/auto` route — connects to LM Studio (or any OpenAI-compatible local server) via `LM_STUDIO_URL` in `.env` (default: `http://127.0.0.1:1234`)
- No auth required; model discovered dynamically at startup via `/v1/models`
- Slash commands: `/lms`, `/lms-models`, `/lms-status`, `/lms-use <model-id>`

**Perplexity API expansion**
- 35 models across 5 providers: OpenAI, Anthropic, Google, xAI, Perplexity-native, NVIDIA
- Slash commands: `/plex-opus`, `/plex-sonnet`, `/plex-haiku`, `/plex-gpt5`, `/plex-gpt54`, `/plex-gpt55`, `/plex-grok4`, `/plex-gemini`, `/plex-sonar`

**New Claude models**
- Claude Fable 5 (`cli-claude/claude-fable-5`, 1M ctx) — `/cli-fable5`
- Claude Sonnet 5 (`cli-claude/claude-sonnet-5`, 1M ctx) — `/cli-sonnet5`

**Grok CLI**
- Grok 4.5 via CLI subprocess (`cli-grok/grok-4.5`) — `/cli-grok`

**Multi-phase pipeline**
- New `/pipeline` command runs a topic sequentially through four AI phases
- Phases: research (plex-sonar) → architect (cli-opus) → implement (cli-sonnet) → review (plex-gpt55)
- Per-phase model overrides via `--research=`, `--architect=`, `--implement=`, `--review=`
- Skip phases via `--skip=research,review`

**Codex models**
- GPT-5.5 (`openai-codex/gpt-5.5`) — `/cli-codex55`
- GPT-5.3 Codex Spark (`openai-codex/gpt-5.3-codex-spark`) — `/cli-codex-spark`
- GPT-5.2 Codex (`openai-codex/gpt-5.2-codex`) — `/cli-codex52`

**Gemini models**
- Gemini 3 Pro Preview (legacy alias) — `/cli-gemini3-pro-preview`
- Gemini 3 Flash Preview — `/cli-gemini3-flash`

**GitHub Actions CI**
- Supply-chain-guard style workflow with pinned action SHAs
- Publishes to npm (`@elvatis_com/openclaw-cli-bridge-elvatis`) on version tag
- Publishes to ClawHub (`registry.clawhub.ai`) on version tag
- Creates GitHub Release from CHANGELOG.md on successful publish

### Fixed

- npm audit: resolved brace-expansion and protobufjs vulnerabilities (0 remaining)
- Merged Dependabot PRs: vite, @google/genai, vitest, @types/node, eslint

### Version convention

This project uses OpenClaw date-based versioning: `YYYY.M.patch`. All features in this release ship under `2026.7.1`. The next release will be `2026.8.1` (or `2026.7.2` for a patch within July).

---

## v1.x — Legacy

Earlier `1.x` versions are archived. See git history for details.
