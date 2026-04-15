/**
 * prompt-router.ts
 *
 * Intelligent prompt-based model routing for the CLI bridge.
 * Analyzes user message content and routes to the best model for the task.
 *
 * Routing rules ported from elvatis-mcp (https://github.com/elvatis/elvatis-mcp)
 * and adapted for cli-bridge model IDs.
 *
 * Strategy: keyword matching with word boundaries. Only reroutes when there
 * is a clear winner (score >= 2 AND >= 2x the runner-up). Weak signals
 * keep the original model to avoid false positives.
 */

import { debugLog } from "./debug-log.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoutingRule {
  model: string;
  keywords: string[];
  reason: string;
}

export interface RoutingMatch {
  model: string;
  reason: string;
  score: number;
  keywords: string[];
}

// ── Routing Rules ────────────────────────────────────────────────────────────
// Ported from elvatis-mcp/src/tools/routing-rules.ts
// Adapted: MCP tool names replaced with cli-bridge model IDs

// Only cross-provider routing: route to a DIFFERENT provider when there's a clear advantage.
// Claude-to-Claude rerouting (Sonnet to Opus/Haiku) is left to the OpenClaw gateway,
// which has 60+ models with direct API access and doesn't need CLI subprocess overhead.
export const ROUTING_RULES: RoutingRule[] = [
  {
    model: "openai-codex/gpt-5.3-codex",
    keywords: [
      "code", "debug", "refactor", "function", "class", "bug", "test",
      "script", "typescript", "javascript", "python", "error", "compile",
      "build", "lint", "implement", "write a", "fix the", "generate code",
      "shell", "bash", "git", "commit", "deploy", "dockerfile",
    ],
    reason: "Codex is purpose-built for coding tasks",
  },
  {
    model: "cli-gemini/gemini-2.5-flash",
    keywords: [
      "summarize", "explain", "analyze", "what is", "describe", "translate",
      "image", "photo", "screenshot", "long", "document", "pdf", "compare",
      "research", "overview", "draft", "write an email", "proofread",
    ],
    reason: "Gemini excels at analysis, long context (1M tokens), and multimodal input",
  },
];

// ── Matching ─────────────────────────────────────────────────────────────────

/**
 * Score routing rules against user text using word boundary matching.
 * Returns matches sorted by score (highest first).
 *
 * Single-word keywords use \b word boundaries to prevent partial matches
 * (e.g. "reviews" won't match "review"). Multi-word keywords use includes()
 * for phrase matching.
 *
 * Ported from elvatis-mcp matchRules().
 */
export function matchRules(text: string): RoutingMatch[] {
  const lower = text.toLowerCase();
  const matches: RoutingMatch[] = [];

  for (const rule of ROUTING_RULES) {
    let score = 0;
    const hitKeywords: string[] = [];

    for (const kw of rule.keywords) {
      if (kw.includes(" ")) {
        // Multi-word: phrase matching
        if (lower.includes(kw)) { score++; hitKeywords.push(kw); }
      } else {
        // Single-word: word boundary regex
        const re = new RegExp(`\\b${kw}\\b`, "i");
        if (re.test(lower)) { score++; hitKeywords.push(kw); }
      }
    }

    if (score > 0) {
      matches.push({ model: rule.model, reason: rule.reason, score, keywords: hitKeywords });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ── Model Selection ──────────────────────────────────────────────────────────

/**
 * Detect the optimal model for a prompt based on keyword analysis.
 *
 * Returns null (keep original model) unless:
 * - Top match has score >= 2 (at least 2 keyword hits)
 * - Top match has >= 2x the score of the runner-up (clear winner)
 * - The matched model is different from the original
 *
 * This conservative threshold avoids false positives on ambiguous prompts.
 */
export function detectOptimalModel(
  userText: string,
  originalModel: string,
): { model: string; reason: string; score: number; keywords: string[] } | null {
  if (!userText || userText.trim().length < 10) return null;

  const matches = matchRules(userText);
  if (matches.length === 0) return null;

  const top = matches[0];
  const runnerUp = matches[1];

  // Need at least 2 keyword hits for confidence
  if (top.score < 2) return null;

  // Need clear winner: at least 2x the runner-up score
  if (runnerUp && top.score < runnerUp.score * 2) return null;

  // Don't reroute if already using the matched model
  if (top.model === originalModel) return null;

  return top;
}

// ── Routing Guide ────────────────────────────────────────────────────────────
// Compact guide for injection when user asks for help.
// Based on elvatis-mcp ROUTING_GUIDE.

export const ROUTING_GUIDE = `
# CLI Bridge: Model Routing Guide

## Cross-Provider Routing

The bridge routes to a different provider when there is a clear advantage.
Claude-to-Claude routing (Sonnet/Opus/Haiku) is handled by the OpenClaw gateway
which has 60+ models with direct API access.

| Prompt keywords | Routed to | Why |
|----------------|-----------|-----|
| code, debug, refactor, typescript, python, bash | Codex (GPT-5.3) | Purpose-built for coding |
| summarize, analyze, research, document, pdf, image | Gemini Flash | 1M context, multimodal |
| Everything else | Keeps original model | Gateway decides Claude variant |

## OpenClaw Models (60+ available)

The gateway manages models across 10 providers:
- Claude (anthropic, claude-cli): Sonnet, Opus, Haiku via direct API
- GitHub Copilot: GPT-5, Gemini 3, Claude, Grok
- Codex: GPT-5.1 to 5.4 via CLI
- Gemini: 2.0 Flash to 3.1 Pro via CLI
- Perplexity: Sonar Pro, Deep Research via API
- Local: BitNet, llama.cpp via bridge

The bridge only spawns CLI subprocesses for vllm/* models. All other
models are accessed by the gateway directly.

## Fallback Chain

If the primary model fails, the bridge tries:
- Sonnet -> Opus -> Gemini Flash -> Codex
- Opus -> Sonnet -> Gemini Pro -> Haiku
`.trim();
