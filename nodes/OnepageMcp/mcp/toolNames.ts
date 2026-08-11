import type { McpTool } from './types';

/** OpenAI and most other tool-calling APIs cap function names at 64 characters. */
const MAX_MCP_TOOL_NAME_LENGTH = 64;

const FALLBACK_TOOL_NAME = 'tool';

/**
 * Builds the name the AI agent sees for an MCP tool.
 *
 * Follows n8n's `buildMcpToolName`: the n8n node name is used as a prefix so two MCP sub-nodes on
 * the same agent cannot collide, and the result is capped at 64 characters by shortening the
 * prefix first, then dropping it entirely.
 *
 * Deviation from n8n: the MCP tool name itself is also sanitised. n8n passes it through untouched,
 * which produces names the LLM providers reject (they require `^[a-zA-Z0-9_-]{1,64}$`). The
 * original, unsanitised name is always what gets sent in `tools/call`.
 */
export function buildMcpToolName(nodeName: string, mcpToolName: string): string {
  const prefix = nodeName.replace(/[^a-zA-Z0-9]/g, '_');
  const suffix = mcpToolName.replace(/[^a-zA-Z0-9_-]/g, '_') || FALLBACK_TOOL_NAME;

  const fullName = `${prefix}_${suffix}`;
  if (fullName.length <= MAX_MCP_TOOL_NAME_LENGTH) {
    return fullName;
  }

  const maxPrefixLength = MAX_MCP_TOOL_NAME_LENGTH - suffix.length - 1;
  return maxPrefixLength > 0
    ? `${prefix.slice(0, maxPrefixLength)}_${suffix}`
    : suffix.slice(0, MAX_MCP_TOOL_NAME_LENGTH);
}

function withCollisionSuffix(name: string, attempt: number): string {
  const suffix = `_${attempt}`;
  const room = MAX_MCP_TOOL_NAME_LENGTH - suffix.length;
  return `${name.slice(0, room)}${suffix}`;
}

/**
 * Maps every selected MCP tool to the unique name the agent sees.
 *
 * Sanitising and truncating names can make two distinct MCP tools collide; n8n resolves such a
 * collision by silently running both tools for a single call. Here the second and any further
 * occurrence gets a `_2`, `_3`, ... suffix, so the mapping stays a bijection and `execute()` can
 * resolve a call back to exactly one MCP tool. The returned map keeps `tools` order.
 */
export function buildToolNameIndex(nodeName: string, tools: McpTool[]): Map<string, McpTool> {
  const index = new Map<string, McpTool>();

  for (const tool of tools) {
    const baseName = buildMcpToolName(nodeName, tool.name);

    let visibleName = baseName;
    let attempt = 2;
    while (index.has(visibleName)) {
      visibleName = withCollisionSuffix(baseName, attempt);
      attempt += 1;
    }

    index.set(visibleName, tool);
  }

  return index;
}
