# Handover: CLI Session Resume Pattern

## Problem Solved

Spawning fresh CLI processes (`claude -p`, `gemini -p`, `codex exec`) for every request forces the model to re-process the entire conversation history (20KB+) from scratch. This causes:
- **Silent hangs** — Sonnet goes completely silent (zero stdout) ~50% of the time on large prompts
- **Slow responses** — 80-120s per request instead of 5-10s
- **Wasted tokens** — the full history is re-tokenized on every call

## Solution: Session Resume

Instead of one-shot processes, maintain persistent sessions per model. First request creates a session, subsequent requests resume it — the CLI keeps the full conversation context.

## Implementation by CLI Tool

### Claude Code (`claude`)

```bash
# First request — create session
echo "user prompt" | claude -p \
  --session-id "550e8400-e29b-41d4-a716-446655440000" \
  --model claude-sonnet-4-6 \
  --output-format text \
  --permission-mode bypassPermissions \
  --dangerously-skip-permissions

# Subsequent requests — resume (Claude has full context, only new message needed)
echo "follow-up prompt" | claude -p \
  --resume "550e8400-e29b-41d4-a716-446655440000" \
  --model claude-sonnet-4-6 \
  --output-format text \
  --permission-mode bypassPermissions \
  --dangerously-skip-permissions
```

**Key flags:**
- `--session-id <uuid>` — creates a new session with this ID (first request)
- `--resume <uuid>` — resumes an existing session (subsequent requests)
- Both work with `-p` (print/headless mode)
- Session files stored by Claude CLI internally (~/.claude/projects/)

### Gemini CLI (`gemini`)

```bash
# First request — auto-creates session
echo "user prompt" | gemini -m gemini-2.5-flash -p "" --approval-mode yolo

# Subsequent requests — resume by UUID
echo "follow-up" | gemini -m gemini-2.5-flash -p "" --resume "ad79893c-4e3d-40e6-83e7-400e49dba0d6" --approval-mode yolo
```

**Key flags:**
- `--resume <uuid>` — resume by session UUID
- `--list-sessions` — list available sessions
- Session UUID is visible in `--list-sessions` output

**Note:** Gemini doesn't have a `--session-id` flag to create a specific UUID. The session is auto-created and the UUID is extracted from `--list-sessions` or from the output. For the bridge, we generate a UUID and pass it as `--resume` — Gemini creates a new session if the UUID doesn't exist.

### OpenAI Codex (`codex`)

```bash
# First request — auto-creates session
echo "user prompt" | codex exec --model gpt-5.3-codex --full-auto

# Subsequent requests — resume subcommand
echo "follow-up" | codex exec resume "550e8400-xxxx" --model gpt-5.3-codex --full-auto
```

**Key flags:**
- `codex exec resume <session-id>` — resume subcommand (not a flag)
- `--ephemeral` — skip session persistence (opposite of what we want)
- Session ID is a UUID

## Session Registry Pattern (TypeScript)

```typescript
interface CliSessionEntry {
  sessionId: string;        // UUID
  provider: string;         // "claude" | "gemini" | "codex"
  model: string;            // e.g. "claude-sonnet-4-6"
  createdAt: number;        // epoch ms
  lastUsedAt: number;       // epoch ms
  requestCount: number;     // total requests in this session
}

// Persist to JSON file
const SESSIONS_FILE = "~/.openclaw/cli-bridge/cli-sessions.json";

// Session lifecycle
function getOrCreateSession(provider: string, model: string): CliSessionEntry {
  const existing = sessions.get(model);
  
  // Reuse if fresh enough
  const TTL = 2 * 60 * 60 * 1000;     // 2 hours
  const MAX_REQUESTS = 50;              // context rotation
  if (existing && 
      (Date.now() - existing.lastUsedAt) < TTL && 
      existing.requestCount < MAX_REQUESTS) {
    return existing;
  }
  
  // Create fresh session
  return { sessionId: randomUUID(), provider, model, ... };
}

// After successful response
function recordSuccess(model: string): void {
  session.requestCount++;
  session.lastUsedAt = Date.now();
  saveToDisk();
}

// On session error (corrupted, expired, not found)
function invalidate(model: string): void {
  sessions.delete(model);
  saveToDisk();
  // Next request will auto-create a fresh session
}
```

## Session Expiry Strategy

| Condition | Action | Why |
|-----------|--------|-----|
| `lastUsedAt > 2 hours` | Create new session | Context may be stale |
| `requestCount >= 50` | Create new session | Prevent context bloat |
| CLI returns "session not found" | Invalidate + retry | Session file was cleaned up |
| CLI returns auth error | Refresh token + retry | OAuth token expired |
| CLI timeout (exit 143) | Keep session alive | Session is valid, API was slow |

## Performance Impact (measured on openclaw-cli-bridge)

| Metric | Before (one-shot) | After (session resume) |
|--------|-------------------|----------------------|
| Prompt size per request | 18-25 KB | < 1 KB (new message only) |
| Sonnet response time | 80-120s (50% hang rate) | 5-10s |
| Haiku response time | 5-15s | 3-5s |
| Silent hang rate | ~50% | Near 0% |

## Stream-JSON Mode (Future Enhancement)

Claude CLI supports bidirectional streaming via `--input-format stream-json --output-format stream-json --verbose`. This enables:
- **Persistent process** — don't spawn/kill per request, keep one running
- **Real-time streaming** — token-by-token output via SSE
- **Native tool calls** — Claude's own tools (Bash, Read, Write, Edit, Grep)
- **Rate limit visibility** — `rate_limit_event` messages show quota state
- **Cost tracking** — per-request cost in USD

```bash
# Bidirectional streaming session
echo '{"type":"user","message":{"role":"user","content":"hello"}}' | \
  claude -p \
  --model claude-sonnet-4-6 \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --permission-mode bypassPermissions \
  --dangerously-skip-permissions
```

Response includes `session_id`, tool list, model info, thinking blocks, and full usage metrics. This is the path to a fully persistent agent process.

## Files Reference (openclaw-cli-bridge-elvatis)

| File | What it does |
|------|-------------|
| `src/cli-runner.ts` | Session registry + `runClaude()`, `runGemini()`, `runCodex()` with resume |
| `src/config.ts` | `STALE_OUTPUT_TIMEOUT_MS = 30_000` (kill silent processes fast) |
| `src/tool-protocol.ts` | Tool schema injection + JSON response parsing |
| `src/proxy-server.ts` | Cross-provider fallback chains, empty-response detection |
| `src/debug-log.ts` | File-based debug log + SSE streaming |
| `~/.openclaw/cli-bridge/cli-sessions.json` | Persisted session registry |
| `~/.openclaw/cli-bridge/debug.log` | Real-time request lifecycle log |

## Key Learnings

1. **Claude Sonnet hangs silently** on large prompts (~50% of the time). NOT RAM (28GB free). Likely API-side rate limiting. Session resume fixes it by keeping prompts small.

2. **Exit code 143 = SIGTERM**, not OOM. Our stale-output detector sends it when the CLI produces zero stdout for 30 seconds.

3. **Haiku ignores JSON tool format** in long conversations — returns conversational text instead of `{"tool_calls":[...]}`. Fix: JSON reminder at the END of the prompt + reject text responses during tool loops.

4. **Empty responses (0 bytes) must trigger fallback**, not be treated as success. The model exits 0 but produces nothing useful.

5. **Cross-provider fallback chains** are essential: `Sonnet → Haiku → Gemini Flash → Codex`. Each provider has different failure modes.

6. **The gateway loads plugins from `~/.openclaw/extensions/`**, NOT from the workspace. Must rsync + `openclaw gateway restart` after every change.
