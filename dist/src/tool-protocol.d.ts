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
export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}
export interface CliToolResult {
    content: string | null;
    tool_calls?: ToolCall[];
}
export declare function buildToolPromptBlock(tools: ToolDefinition[]): string;
/**
 * Returns a JSON schema that constrains Claude's output to either:
 * - { "content": "text response" }
 * - { "tool_calls": [{ "name": "...", "arguments": { ... } }] }
 */
export declare function buildToolCallJsonSchema(): object;
/**
 * Parse CLI output text into a CliToolResult.
 *
 * Tries to extract JSON from the text. If valid JSON with tool_calls is found,
 * returns structured tool calls. Otherwise returns the text as content.
 *
 * Never throws — always returns a valid result.
 */
export declare function parseToolCallResponse(text: string): CliToolResult;
/** Generate a unique tool call ID: "call_" + 12 random hex characters. */
export declare function generateCallId(): string;
//# sourceMappingURL=tool-protocol.d.ts.map