import type { McpCallToolResult } from './types';

/**
 * Structured content must be a non-array object — same guard as n8n's `isStructuredContent`,
 * which deliberately rejects arrays so `content` arrays are not mistaken for structured output.
 */
export function isStructuredContent(value: unknown): value is Record<string, unknown> {
  return value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Pulls a human-readable message out of an MCP error result or a thrown error.
 * Mirrors n8n's `getErrorDescriptionFromToolCall`.
 */
export function getErrorDescriptionFromToolCall(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined;

  if ('content' in result && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (typeof block === 'object' && block !== null && 'text' in block) {
        const { text } = block as { text?: unknown };
        if (typeof text === 'string') return text;
      }
    }
    return undefined;
  }

  if ('toolResult' in result && typeof result.toolResult === 'string') {
    return result.toolResult;
  }

  if ('message' in result && typeof result.message === 'string') {
    return result.message;
  }

  return undefined;
}

/**
 * Reduces an MCP `CallToolResult` to the value handed back to the caller, keeping structure where
 * the server provided it. Same precedence as n8n's `createCallTool`:
 * `toolResult` (legacy servers) -> `structuredContent` -> `content` -> the whole result.
 */
export function extractToolCallOutput(result: McpCallToolResult): unknown {
  if (result.toolResult !== undefined) return result.toolResult;
  if (isStructuredContent(result.structuredContent)) return result.structuredContent;
  if (result.content !== undefined) return result.content;
  return result;
}

/**
 * Serialises a tool output for the `invoke()` path.
 *
 * `execute()` returns the structured value untouched. `invoke()` is only reached from Agent v1/v2
 * and from sub-agents, which feed the return value straight into a chat message — without a real
 * `@langchain/core` tool wrapper there is nothing else that would serialise it, so it happens here.
 */
export function stringifyToolOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';

  // A content array of pure text blocks reads far better as plain text than as JSON.
  if (Array.isArray(value)) {
    const texts = value.map((block) =>
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
        ? (block as { text: string }).text
        : undefined,
    );
    if (texts.length > 0 && texts.every((text): text is string => text !== undefined)) {
      return texts.join('\n');
    }
  }

  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}
