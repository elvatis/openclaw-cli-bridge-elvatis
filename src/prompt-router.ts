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
  {
    model: "cli-claude/claude-opus-4-6",
    keywords: [
      "complex", "nuanced", "creative", "strategy", "plan",
      "cross-check", "second opinion", "verify", "architecture",
      "design", "review", "audit", "evaluate",
    ],
    reason: "Opus handles complex reasoning and strategic planning",
  },
  {
    model: "cli-claude/claude-haiku-4-5",
    keywords: [
      "quick", "simple", "classify", "label", "rewrite", "format",
      "short answer", "yes or no", "extract", "parse", "convert",
      "json", "csv", "rephrase", "grammar", "markdown", "sentiment",
      "positive", "negative", "neutral",
    ],
    reason: "Haiku is fast and cheap for simple tasks",
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

## Available Models

| Model | Best for | Avg latency |
|-------|----------|-------------|
| Sonnet (default) | General tasks, conversation | 5-10s |
| Opus | Complex reasoning, strategy, long-form | 7-15s |
| Haiku | Simple tasks, formatting, classification | 2-4s |
| Gemini Flash | Research, analysis, long documents, images | 6-8s |
| Codex (GPT-5.3) | Coding, debugging, shell scripts | 5-7s |

## Automatic Routing

The bridge automatically routes based on prompt keywords:
- **Coding** (code, debug, refactor, typescript, python) -> Codex
- **Research** (summarize, analyze, research, document) -> Gemini
- **Complex reasoning** (complex, strategy, plan, architecture) -> Opus
- **Simple tasks** (quick, format, extract, classify, json) -> Haiku
- **Everything else** -> Sonnet (default)

## Fallback Chain

If the primary model fails, the bridge tries:
- Sonnet -> Opus -> Gemini Flash -> Codex
- Opus -> Sonnet -> Gemini Pro -> Haiku
`.trim();
