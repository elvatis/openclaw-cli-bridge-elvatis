/**
 * gemini-api-runner.ts
 *
 * Direct Gemini API integration via @google/genai SDK.
 * Supports native text + image generation (responseModalities: ["TEXT", "IMAGE"]).
 *
 * Unlike CLI runners, this calls the Gemini API directly — no subprocess overhead.
 * Images are returned as base64 data URIs in OpenAI-compatible content_parts format.
 */
import type { ToolDefinition, ToolCall } from "./tool-protocol.js";
import type { ChatMessage } from "./cli-runner.js";
export interface ContentPart {
    type: "text" | "image_url";
    text?: string;
    image_url?: {
        url: string;
    };
}
export interface GeminiApiResult {
    /** String for text-only, array for multimodal (text + images) */
    content: string | ContentPart[];
    finishReason: string;
    promptTokens?: number;
    completionTokens?: number;
    tool_calls?: ToolCall[];
}
export declare function getApiKey(): string;
/** Reset cached key (for testing). */
export declare function _resetApiKeyCache(): void;
/** Reset client (for testing). */
export declare function _resetClient(): void;
interface GeminiContent {
    role: "user" | "model";
    parts: GeminiPart[];
}
type GeminiPart = {
    text: string;
} | {
    inlineData: {
        mimeType: string;
        data: string;
    };
} | {
    functionCall: {
        name: string;
        args: Record<string, unknown>;
    };
} | {
    functionResponse: {
        name: string;
        response: Record<string, unknown>;
    };
};
/**
 * Convert OpenAI-format messages to Gemini API format.
 * System messages → systemInstruction. Tool results → functionResponse parts.
 */
export declare function convertMessages(messages: ChatMessage[]): {
    systemInstruction?: {
        parts: Array<{
            text: string;
        }>;
    };
    contents: GeminiContent[];
};
export declare function convertTools(tools: ToolDefinition[]): Array<{
    functionDeclarations: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
}>;
export interface GeminiApiOptions {
    model: string;
    timeoutMs?: number;
    tools?: ToolDefinition[];
    log?: (msg: string) => void;
}
export declare function geminiApiComplete(messages: ChatMessage[], opts: GeminiApiOptions): Promise<GeminiApiResult>;
export declare function geminiApiCompleteStream(messages: ChatMessage[], opts: GeminiApiOptions, onToken: (token: string) => void): Promise<GeminiApiResult>;
export {};
//# sourceMappingURL=gemini-api-runner.d.ts.map