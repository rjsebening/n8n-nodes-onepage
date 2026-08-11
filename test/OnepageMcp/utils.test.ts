import { describe, expect, it } from 'vitest';

import type { McpTool } from '../../nodes/OnepageMcp/mcp/types';
import { getSelectedTools } from '../../nodes/OnepageMcp/mcp/utils';

function tool(name: string): McpTool {
  return { name, inputSchema: { type: 'object', properties: {} } };
}

const tools = [tool('list_pages'), tool('get_page'), tool('update_page')];
const names = (result: McpTool[]) => result.map((entry) => entry.name);

describe('getSelectedTools', () => {
  it('exposes every tool in "all" mode', () => {
    expect(names(getSelectedTools({ mode: 'all', tools }))).toEqual([
      'list_pages',
      'get_page',
      'update_page',
    ]);
  });

  it('exposes only the listed tools in "selected" mode', () => {
    expect(
      names(getSelectedTools({ mode: 'selected', includeTools: ['get_page'], tools })),
    ).toEqual(['get_page']);
  });

  it('exposes every tool when "selected" has no selection yet', () => {
    expect(names(getSelectedTools({ mode: 'selected', includeTools: [], tools }))).toHaveLength(3);
    expect(names(getSelectedTools({ mode: 'selected', tools }))).toHaveLength(3);
  });

  it('removes the listed tools in "except" mode', () => {
    expect(
      names(getSelectedTools({ mode: 'except', excludeTools: ['update_page'], tools })),
    ).toEqual(['list_pages', 'get_page']);
  });

  it('removes nothing when the exclude list is empty', () => {
    expect(names(getSelectedTools({ mode: 'except', excludeTools: [], tools }))).toHaveLength(3);
  });

  it('ignores names the server no longer offers', () => {
    expect(
      names(getSelectedTools({ mode: 'selected', includeTools: ['gone', 'get_page'], tools })),
    ).toEqual(['get_page']);
    expect(names(getSelectedTools({ mode: 'except', excludeTools: ['gone'], tools }))).toHaveLength(
      3,
    );
  });

  it('handles duplicate names in the filter lists', () => {
    expect(
      names(getSelectedTools({ mode: 'selected', includeTools: ['get_page', 'get_page'], tools })),
    ).toEqual(['get_page']);
  });

  it('can filter every tool away', () => {
    expect(
      getSelectedTools({
        mode: 'except',
        excludeTools: ['list_pages', 'get_page', 'update_page'],
        tools,
      }),
    ).toEqual([]);
  });
});
