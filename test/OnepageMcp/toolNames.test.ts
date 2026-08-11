import { describe, expect, it } from 'vitest';

import { buildMcpToolName, buildToolNameIndex } from '../../nodes/OnepageMcp/mcp/toolNames';
import type { McpTool } from '../../nodes/OnepageMcp/mcp/types';

function tool(name: string): McpTool {
  return { name, inputSchema: { type: 'object', properties: {} } };
}

describe('buildMcpToolName', () => {
  it('prefixes the MCP tool name with the sanitised node name', () => {
    expect(buildMcpToolName('Onepage MCP', 'list_pages')).toBe('Onepage_MCP_list_pages');
  });

  it('sanitises characters that tool-calling APIs reject', () => {
    expect(buildMcpToolName('Onepage', 'list pages/v2')).toBe('Onepage_list_pages_v2');
    expect(buildMcpToolName('Onepage', 'get-page')).toBe('Onepage_get-page');
  });

  it('falls back to a generic name when the MCP name sanitises to nothing', () => {
    expect(buildMcpToolName('Onepage', '///')).toBe('Onepage____');
    expect(buildMcpToolName('Onepage', '')).toBe('Onepage_tool');
  });

  it('shortens the prefix to stay within 64 characters', () => {
    const name = buildMcpToolName('A'.repeat(60), 'list_pages');
    expect(name).toHaveLength(64);
    expect(name.endsWith('_list_pages')).toBe(true);
  });

  it('drops the prefix entirely when the tool name alone fills the budget', () => {
    const longToolName = 'b'.repeat(70);
    const name = buildMcpToolName('Onepage', longToolName);
    expect(name).toBe('b'.repeat(64));
  });
});

describe('buildToolNameIndex', () => {
  it('maps every visible name back to the original MCP tool', () => {
    const tools = [tool('list_pages'), tool('get_page')];
    const index = buildToolNameIndex('Onepage', tools);

    expect([...index.keys()]).toEqual(['Onepage_list_pages', 'Onepage_get_page']);
    expect(index.get('Onepage_list_pages')?.name).toBe('list_pages');
    expect(index.get('Onepage_get_page')?.name).toBe('get_page');
  });

  it('keeps the mapping unique when sanitising makes two names collide', () => {
    const tools = [tool('get page'), tool('get/page')];
    const index = buildToolNameIndex('Onepage', tools);

    expect([...index.keys()]).toEqual(['Onepage_get_page', 'Onepage_get_page_2']);
    expect(index.get('Onepage_get_page')?.name).toBe('get page');
    expect(index.get('Onepage_get_page_2')?.name).toBe('get/page');
  });

  it('keeps collision-suffixed names within the length limit', () => {
    const tools = [tool(`a${'b'.repeat(69)}`), tool(`a${'b'.repeat(69)}`)];
    const index = buildToolNameIndex('Onepage', tools);

    for (const name of index.keys()) {
      expect(name.length).toBeLessThanOrEqual(64);
    }
    expect(index.size).toBe(2);
  });

  it('returns an empty index for an empty tool list', () => {
    expect(buildToolNameIndex('Onepage', []).size).toBe(0);
  });
});
