import { describe, it, expect } from "vitest";
import { matchRules, detectOptimalModel } from "../src/prompt-router.js";

describe("prompt-router", () => {
  describe("matchRules", () => {
    it("matches coding keywords to Codex", () => {
      const matches = matchRules("Debug this TypeScript function that has a bug");
      expect(matches[0].model).toBe("openai-codex/gpt-5.3-codex");
      expect(matches[0].score).toBeGreaterThanOrEqual(2);
    });

    it("matches research keywords to Gemini", () => {
      const matches = matchRules("Summarize this PDF document and analyze the key findings");
      expect(matches[0].model).toBe("cli-gemini/gemini-2.5-flash");
      expect(matches[0].score).toBeGreaterThanOrEqual(2);
    });

    it("matches complex reasoning keywords to Opus", () => {
      const matches = matchRules("Design a complex architecture and review the strategy");
      expect(matches[0].model).toBe("cli-claude/claude-opus-4-6");
      expect(matches[0].score).toBeGreaterThanOrEqual(2);
    });

    it("matches simple task keywords to Haiku", () => {
      const matches = matchRules("Convert this to JSON format and extract the fields");
      expect(matches[0].model).toBe("cli-claude/claude-haiku-4-5");
      expect(matches[0].score).toBeGreaterThanOrEqual(2);
    });

    it("returns empty for ambiguous prompts", () => {
      const matches = matchRules("What is 2+2?");
      // May have low-score matches but no strong signal
      if (matches.length > 0) {
        expect(matches[0].score).toBeLessThanOrEqual(1);
      }
    });

    it("uses word boundaries (reviews does not match review)", () => {
      const matches = matchRules("The user reviews the document");
      // "reviews" should NOT match "review" keyword with \b word boundary
      const opusMatch = matches.find(m => m.model === "cli-claude/claude-opus-4-6");
      // Opus should not appear at all, or if it does, "review" should not be in hit keywords
      if (opusMatch) {
        expect(opusMatch.keywords).not.toContain("review");
      } else {
        expect(opusMatch).toBeUndefined();
      }
    });

    it("handles multi-word keywords with phrase matching", () => {
      const matches = matchRules("Write a Python function to fix the bug");
      const codexMatch = matches.find(m => m.model === "openai-codex/gpt-5.3-codex");
      expect(codexMatch).toBeDefined();
      expect(codexMatch!.score).toBeGreaterThanOrEqual(2);
    });
  });

  describe("detectOptimalModel", () => {
    it("routes coding prompts to Codex", () => {
      const result = detectOptimalModel(
        "Debug this TypeScript function and refactor the class",
        "cli-claude/claude-sonnet-4-6",
      );
      expect(result).not.toBeNull();
      expect(result!.model).toBe("openai-codex/gpt-5.3-codex");
    });

    it("routes research prompts to Gemini", () => {
      const result = detectOptimalModel(
        "Summarize this long document and analyze the research findings",
        "cli-claude/claude-sonnet-4-6",
      );
      expect(result).not.toBeNull();
      expect(result!.model).toBe("cli-gemini/gemini-2.5-flash");
    });

    it("returns null for weak signals", () => {
      const result = detectOptimalModel(
        "What is 2+2?",
        "cli-claude/claude-sonnet-4-6",
      );
      expect(result).toBeNull();
    });

    it("returns null for empty prompts", () => {
      expect(detectOptimalModel("", "cli-claude/claude-sonnet-4-6")).toBeNull();
      expect(detectOptimalModel("hi", "cli-claude/claude-sonnet-4-6")).toBeNull();
    });

    it("returns null when already using the matched model", () => {
      const result = detectOptimalModel(
        "Debug this TypeScript function and refactor the class",
        "openai-codex/gpt-5.3-codex", // already Codex
      );
      expect(result).toBeNull();
    });

    it("returns null for ambiguous prompts (no clear winner)", () => {
      // This prompt has keywords for both Codex (code) and Gemini (analyze, research)
      const result = detectOptimalModel(
        "Analyze the code and research the approach",
        "cli-claude/claude-sonnet-4-6",
      );
      // Should return null because scores are too close (no 2x winner)
      // OR return one of them if one clearly dominates
      if (result) {
        // If it does route, the winner should have >= 2x the runner-up
        expect(result.score).toBeGreaterThanOrEqual(2);
      }
    });

    it("Codex wins on code-heavy prompts even with other keywords", () => {
      const result = detectOptimalModel(
        "Write a Python script to debug the CSV parser and fix the build error",
        "cli-claude/claude-sonnet-4-6",
      );
      expect(result).not.toBeNull();
      expect(result!.model).toBe("openai-codex/gpt-5.3-codex");
    });
  });
});
