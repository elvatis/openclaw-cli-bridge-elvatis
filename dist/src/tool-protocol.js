/**
 * tool-protocol.ts
 *
 * Translates between the OpenAI tool-calling protocol and CLI text I/O.
 *
 * - buildToolPromptBlock(): injects tool definitions + instructions into the prompt
 * - buildToolCallJsonSchema(): returns JSON schema for Claude's --json-schema flag
 * - parseToolCallResponse(): extracts tool_calls from CLI output text/JSON
 * - generateCallId(): unique call IDs for tool_calls
 */
import { randomBytes } from "node:crypto";
import { debugLog } from "./debug-log.js";
// ──────────────────────────────────────────────────────────────────────────────
// Prompt building
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Build a text block describing available tools and response format instructions.
 * This block is prepended to the system message (or added as a new system message).
 */
/** Threshold: when tool count exceeds this, use compact schema to reduce prompt size. */
const COMPACT_TOOL_THRESHOLD = 8;
/**
 * Build a compact tool description: name + required param names only.
 * Cuts prompt size by ~60-70% for large tool sets.
 */
function compactToolDescription(t) {
    const fn = t.function;
    const params = fn.parameters;
    const required = params?.required ?? Object.keys(params?.properties ?? {});
    const paramList = required.length > 0 ? `(${required.join(", ")})` : "()";
    return `- ${fn.name}${paramList}: ${fn.description}`;
}
/**
 * Build a full tool description: name, description, and full JSON schema.
 */
function fullToolDescription(t) {
    const fn = t.function;
    const params = JSON.stringify(fn.parameters);
    return `- name: ${fn.name}\n  description: ${fn.description}\n  parameters: ${params}`;
}
export function buildToolPromptBlock(tools) {
    const useCompact = tools.length > COMPACT_TOOL_THRESHOLD;
    const toolDescriptions = tools
        .map(useCompact ? compactToolDescription : fullToolDescription)
        .join("\n");
    return [
        "You have access to the following tools.",
        "",
        "IMPORTANT: You must respond with ONLY valid JSON in one of these two formats:",
        "",
        'To call one or more tools, respond with ONLY:',
        '{"tool_calls":[{"name":"<tool_name>","arguments":{<parameters as JSON object>}}]}',
        "",
        'To respond with text (no tool call needed), respond with ONLY:',
        '{"content":"<your text response>"}',
        "",
        "Do NOT include any text outside the JSON. Do NOT wrap in markdown code blocks.",
        useCompact ? "Call ONE tool at a time. Do NOT batch multiple tool calls." : "",
        "",
        "Available tools:",
        toolDescriptions,
    ].join("\n");
}
// ──────────────────────────────────────────────────────────────────────────────
// JSON Schema for Claude's --json-schema flag
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Returns a JSON schema that constrains Claude's output to either:
 * - { "content": "text response" }
 * - { "tool_calls": [{ "name": "...", "arguments": { ... } }] }
 */
export function buildToolCallJsonSchema() {
    return {
        type: "object",
        properties: {
            content: { type: "string" },
            tool_calls: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        arguments: { type: "object" },
                    },
                    required: ["name", "arguments"],
                },
            },
        },
        additionalProperties: false,
    };
}
// ──────────────────────────────────────────────────────────────────────────────
// Response parsing
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Parse CLI output text into a CliToolResult.
 *
 * Tries to extract JSON from the text. If valid JSON with tool_calls is found,
 * returns structured tool calls. Otherwise returns the text as content.
 *
 * Never throws — always returns a valid result.
 */
export function parseToolCallResponse(text) {
    const trimmed = text.trim();
    const preview = trimmed.slice(0, 120);
    // Check for Claude's --output-format json wrapper FIRST.
    // Claude returns: { "type": "result", "result": "..." }
    // The inner `result` field contains the actual model output (with tool_calls or content).
    const claudeResult = tryExtractClaudeJsonResult(trimmed);
    if (claudeResult) {
        const inner = tryParseJson(claudeResult);
        if (inner) {
            const result = normalizeResult(inner);
            debugLog("PARSE", `claude-json → ${result.tool_calls ? "tool_calls" : "content"}`, { toolCalls: result.tool_calls?.length ?? 0 });
            return result;
        }
        // Claude result is plain text
        debugLog("PARSE", "claude-json → plain text", { len: claudeResult.length });
        return { content: claudeResult };
    }
    // Try direct JSON parse (for non-Claude outputs)
    const parsed = tryParseJson(trimmed);
    if (parsed) {
        const result = normalizeResult(parsed);
        debugLog("PARSE", `direct-json → ${result.tool_calls ? "tool_calls" : "content"}`, { toolCalls: result.tool_calls?.length ?? 0 });
        return result;
    }
    // Try extracting JSON from markdown code blocks: ```json ... ```
    const codeBlock = tryExtractCodeBlock(trimmed);
    if (codeBlock) {
        const inner = tryParseJson(codeBlock);
        if (inner) {
            const result = normalizeResult(inner);
            debugLog("PARSE", `code-block → ${result.tool_calls ? "tool_calls" : "content"}`, { toolCalls: result.tool_calls?.length ?? 0 });
            return result;
        }
    }
    // Try finding a JSON object anywhere in the text
    const embedded = tryExtractEmbeddedJson(trimmed);
    if (embedded) {
        const inner = tryParseJson(embedded);
        if (inner) {
            const result = normalizeResult(inner);
            debugLog("PARSE", `embedded-json → ${result.tool_calls ? "tool_calls" : "content"}`, { toolCalls: result.tool_calls?.length ?? 0 });
            return result;
        }
    }
    // Fallback: treat entire text as content
    debugLog("PARSE", "no JSON found → raw content", { len: trimmed.length, preview });
    return { content: trimmed || null };
}
/**
 * Normalize a parsed JSON object into a CliToolResult.
 */
function normalizeResult(obj) {
    // Check for tool_calls array
    if (Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
        const toolCalls = obj.tool_calls.map((tc) => ({
            id: generateCallId(),
            type: "function",
            function: {
                name: String(tc.name ?? ""),
                arguments: typeof tc.arguments === "string"
                    ? tc.arguments
                    : JSON.stringify(tc.arguments ?? {}),
            },
        }));
        // If the model also returned a content string alongside tool_calls, include it
        const content = typeof obj.content === "string" ? obj.content : null;
        return { content, tool_calls: toolCalls };
    }
    // Check for content field — but rescue embedded tool_calls JSON from inside content strings.
    // Models sometimes wrap tool calls inside a content string:
    //   {"content":"I'll write that file.\n{\"tool_calls\":[...]}"}
    if (typeof obj.content === "string") {
        const rescued = tryRescueToolCallsFromContent(obj.content);
        if (rescued)
            return rescued;
        return { content: obj.content };
    }
    // Unknown structure — serialize as content
    return { content: JSON.stringify(obj) };
}
/**
 * Rescue tool_calls embedded inside a content string.
 * Handles cases where the model wraps tool calls in a content field:
 *   {"content":"Some text\n{\"tool_calls\":[...]}"}
 *   {"content":"{\"tool_calls\":[{\"name\":\"write\",...}]}"}
 */
function tryRescueToolCallsFromContent(content) {
    // Only attempt rescue if content contains the tool_calls signature
    if (!content.includes('"tool_calls"') && !content.includes("tool_calls"))
        return null;
    // Try to find embedded JSON with tool_calls
    const embedded = tryExtractEmbeddedJson(content);
    if (!embedded)
        return null;
    const parsed = tryParseJson(embedded);
    if (!parsed || !Array.isArray(parsed.tool_calls) || parsed.tool_calls.length === 0)
        return null;
    // Extract the text content before the JSON (if any)
    const jsonStart = content.indexOf(embedded);
    const textBefore = jsonStart > 0 ? content.slice(0, jsonStart).trim() : null;
    const toolCalls = parsed.tool_calls.map((tc) => ({
        id: generateCallId(),
        type: "function",
        function: {
            name: String(tc.name ?? ""),
            arguments: typeof tc.arguments === "string"
                ? tc.arguments
                : JSON.stringify(tc.arguments ?? {}),
        },
    }));
    return { content: textBefore || null, tool_calls: toolCalls };
}
function tryParseJson(text) {
    try {
        const obj = JSON.parse(text);
        if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
            return obj;
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Extract the model output from Claude's JSON output wrapper.
 * Claude CLI with --output-format json returns:
 * { "type": "result", "result": "the model output",
 *   "structured_output": { "content": "..." }, ... }
 *
 * When --json-schema is used, the `result` field is the JSON-schema-constrained output.
 * The `structured_output.content` field may also contain the raw output.
 */
function tryExtractClaudeJsonResult(text) {
    try {
        const obj = JSON.parse(text);
        if (obj?.type === "result") {
            // Prefer structured_output.content if available
            if (typeof obj.structured_output?.content === "string") {
                return obj.structured_output.content;
            }
            if (typeof obj.result === "string") {
                return obj.result;
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
/** Extract JSON from ```json ... ``` or ``` ... ``` code blocks. */
function tryExtractCodeBlock(text) {
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    return match?.[1]?.trim() ?? null;
}
/** Find the first { ... } JSON object in text (greedy, balanced braces). */
function tryExtractEmbeddedJson(text) {
    const start = text.indexOf("{");
    if (start === -1)
        return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === "\\") {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (ch === "{")
            depth++;
        if (ch === "}") {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }
    return null;
}
// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────
/** Generate a unique tool call ID: "call_" + 12 random hex characters. */
export function generateCallId() {
    return "call_" + randomBytes(6).toString("hex");
}
//# sourceMappingURL=tool-protocol.js.map