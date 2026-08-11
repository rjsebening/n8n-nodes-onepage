import type { McpTool, McpToolIncludeMode } from './types';

/**
 * Applies the "Tools to Include" filter. Matches n8n's `getSelectedTools`, including the two
 * empty-list cases: an empty include list means "not configured yet" and exposes every tool, an
 * empty exclude list removes nothing. Filtering runs on the raw MCP tool names, which is exactly
 * what the loadOptions dropdown stores.
 */
export function getSelectedTools(params: {
  mode: McpToolIncludeMode;
  includeTools?: string[];
  excludeTools?: string[];
  tools: McpTool[];
}): McpTool[] {
  const { mode, includeTools, excludeTools, tools } = params;

  switch (mode) {
    case 'selected': {
      if (!includeTools?.length) return tools;
      const include = new Set(includeTools);
      return tools.filter((tool) => include.has(tool.name));
    }
    case 'except': {
      if (!excludeTools?.length) return tools;
      const exclude = new Set(excludeTools);
      return tools.filter((tool) => !exclude.has(tool.name));
    }
    case 'all':
    default:
      return tools;
  }
}
