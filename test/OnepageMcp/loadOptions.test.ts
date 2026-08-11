import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadMcpToolOptions } from '../../nodes/OnepageMcp/mcp/runtime';
import { createLoadOptionsContext, installFetchMock } from './mcpTestServer';

const TOOLS = [
  { name: 'list_pages', description: 'List all pages' },
  { name: 'get_page' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadMcpToolOptions', () => {
  it('offers the raw MCP tool names, which is what the runtime filter matches on', async () => {
    installFetchMock({ toolPages: [TOOLS] });

    const options = await loadMcpToolOptions(createLoadOptionsContext(), 5000);

    expect(options).toEqual([
      { name: 'list_pages', value: 'list_pages', description: 'List all pages' },
      { name: 'get_page', value: 'get_page', description: undefined },
    ]);
  });

  it('closes the client afterwards', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });

    await loadMcpToolOptions(createLoadOptionsContext(), 5000);

    expect(requests.at(-1)?.method).toBe('DELETE');
  });

  it('reports an OAuth failure in terms the user can act on', async () => {
    const { fetchMock } = installFetchMock();
    fetchMock.mockImplementation(async () => new Response('denied', { status: 401 }));

    await expect(loadMcpToolOptions(createLoadOptionsContext(), 5000)).rejects.toThrow(
      /Authentication failed/,
    );
  });

  it('reports a connection failure', async () => {
    installFetchMock({ failWith: [{ status: 502, body: 'bad gateway' }] });

    await expect(loadMcpToolOptions(createLoadOptionsContext(), 5000)).rejects.toThrow(
      'Could not connect to the Onepage MCP server',
    );
  });

  it('returns an empty list when the server has no tools', async () => {
    installFetchMock({ toolPages: [[]] });

    await expect(loadMcpToolOptions(createLoadOptionsContext(), 5000)).resolves.toEqual([]);
  });
});
