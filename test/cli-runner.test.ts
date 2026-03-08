import { describe, it, expect } from "vitest";
import { formatPrompt } from "../src/cli-runner.js";

describe("formatPrompt", () => {
  it("returns empty string for empty messages", () => {
    expect(formatPrompt([])).toBe("");
  });

  it("returns bare user text for a single short user message", () => {
    const result = formatPrompt([{ role: "user", content: "hello" }]);
    expect(result).toBe("hello");
  });

  it("truncates to MAX_MESSAGES (20) non-system messages", () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    const result = formatPrompt(messages);
    // Should contain last 20 messages, not first 10
    expect(result).toContain("msg 29");
    expect(result).not.toContain("msg 0\n");
    // Single-turn mode doesn't apply when there are multiple messages
    expect(result).toContain("[User]");
  });

  it("keeps system message + last 20 non-system messages", () => {
    const sys = { role: "system" as const, content: "You are helpful" };
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    const result = formatPrompt([sys, ...msgs]);
    expect(result).toContain("[System]");
    expect(result).toContain("You are helpful");
    expect(result).toContain("msg 24"); // last
    expect(result).not.toContain("msg 0\n"); // first (truncated)
  });

  it("truncates individual message content at MAX_MSG_CHARS (4000)", () => {
    const longContent = "x".repeat(5000);
    const result = formatPrompt([{ role: "user", content: longContent }]);
    expect(result.length).toBeLessThan(5000);
    expect(result).toContain("truncated");
  });
});
