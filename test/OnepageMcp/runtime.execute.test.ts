import type { INodeExecutionData } from 'n8n-workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeMcpTool } from '../../nodes/OnepageMcp/mcp/runtime';
import { mcpClientRegistry } from '../../nodes/OnepageMcp/mcp/sessions';
import type { ResolvedMcpConfig } from '../../nodes/OnepageMcp/mcp/types';
import { createExecuteContext, createNode, installFetchMock } from './mcpTestServer';
import type { McpMockServerOptions } from './mcpTestServer';

const TOOLS = [
  { name: 'list_pages', description: 'List all pages' },
  {
    name: 'get_page',
    description: 'Get one page',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string' } },
      required: ['pageId'],
    },
  },
];

function config(overrides: Partial<ResolvedMcpConfig['toolFilter']> = {}): ResolvedMcpConfig {
  return {
    timeout: 5000,
    toolFilter: { mode: 'all', includeTools: [], excludeTools: [], ...overrides },
  };
}

function toolCallItem(tool: string, args: Record<string, unknown> = {}): INodeExecutionData {
  // Shape produced by the execution engine for a toolkit dispatch.
  return { json: { ...args, tool, toolCallId: 'call-1' } };
}

function setup(
  items: INodeExecutionData[],
  options: McpMockServerOptions = { toolPages: [TOOLS] },
  contextOptions: { executionId?: string } = {},
) {
  const mocked = installFetchMock(options);
  const ctx = createExecuteContext({
    node: createNode({ name: 'Onepage MCP' }),
    ...contextOptions,
  });
  ctx.getInputData.mockReturnValue(items);
  return { ...mocked, ctx };
}

beforeEach(() => {
  mcpClientRegistry.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  mcpClientRegistry.reset();
});

describe('executeMcpTool', () => {
  it('dispatches on item.json.tool and calls the original MCP tool name', async () => {
    const callTool = vi.fn(() => ({ content: [{ type: 'text', text: 'page one' }] }));
    const { ctx } = setup([toolCallItem('Onepage_MCP_get_page', { pageId: 'p1' })], {
      toolPages: [TOOLS],
      callTool,
    });

    const output = await executeMcpTool(ctx, () => config(), { enableSessionCache: true });

    expect(callTool).toHaveBeenCalledWith('get_page', { pageId: 'p1' });
    expect(output).toEqual([
      [
        {
          json: { response: [{ type: 'text', text: 'page one' }] },
          pairedItem: { item: 0 },
        },
      ],
    ]);
  });

  it('strips the dispatch keys and undeclared arguments', async () => {
    const callTool = vi.fn(() => ({ content: [] }));
    const { ctx } = setup(
      [toolCallItem('Onepage_MCP_get_page', { pageId: 'p1', chatInput: 'from the agent' })],
      { toolPages: [TOOLS], callTool },
    );

    await executeMcpTool(ctx, () => config(), { enableSessionCache: true });

    expect(callTool).toHaveBeenCalledWith('get_page', { pageId: 'p1' });
  });

  it('keeps structured content next to the response', async () => {
    const { ctx } = setup([toolCallItem('Onepage_MCP_list_pages')], {
      toolPages: [TOOLS],
      callTool: () => ({
        content: [{ type: 'text', text: '{"total":2}' }],
        structuredContent: { total: 2 },
      }),
    });

    const output = await executeMcpTool(ctx, () => config(), { enableSessionCache: true });

    expect(output[0][0].json).toEqual({
      response: [{ type: 'text', text: '{"total":2}' }],
      structuredContent: { total: 2 },
    });
  });

  it('falls back to the extracted output when the server sends no content', async () => {
    const { ctx } = setup([toolCallItem('Onepage_MCP_list_pages')], {
      toolPages: [TOOLS],
      callTool: () => ({ structuredContent: { total: 2 } }),
    });

    const output = await executeMcpTool(ctx, () => config(), { enableSessionCache: true });

    expect(output[0][0].json.response).toEqual({ total: 2 });
  });

  it('handles several tool calls in one execution', async () => {
    const callTool = vi.fn((name: string) => ({ content: [{ type: 'text', text: name }] }));
    const { ctx } = setup(
      [toolCallItem('Onepage_MCP_list_pages'), toolCallItem('Onepage_MCP_get_page', { pageId: 'p1' })],
      { toolPages: [TOOLS], callTool },
    );

    const output = await executeMcpTool(ctx, () => config(), { enableSessionCache: true });

    expect(output[0]).toHaveLength(2);
    expect(output[0].map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
    expect(callTool.mock.calls.map(([name]) => name)).toEqual(['list_pages', 'get_page']);
  });

  it('turns an MCP isError result into a node error', async () => {
    const { ctx } = setup([toolCallItem('Onepage_MCP_list_pages')], {
      toolPages: [TOOLS],
      callTool: () => ({ isError: true, content: [{ type: 'text', text: 'quota exceeded' }] }),
    });

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: true }),
    ).rejects.toThrow('quota exceeded');
  });

  it('rejects an unknown tool name', async () => {
    const { ctx } = setup([toolCallItem('Onepage_MCP_delete_everything')]);

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: true }),
    ).rejects.toThrow('Unknown Onepage MCP tool "Onepage_MCP_delete_everything"');
  });

  it('refuses a tool that the filter excludes', async () => {
    const { ctx } = setup([toolCallItem('Onepage_MCP_get_page', { pageId: 'p1' })]);

    await expect(
      executeMcpTool(ctx, () => config({ mode: 'except', excludeTools: ['get_page'] }), {
        enableSessionCache: true,
      }),
    ).rejects.toThrow('Unknown Onepage MCP tool');
  });

  it('rejects an item without a tool name', async () => {
    const { ctx } = setup([{ json: { pageId: 'p1' } }]);

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: true }),
    ).rejects.toThrow('No tool name found in the incoming item');
  });

  it('does nothing without input items', async () => {
    const { ctx, fetchMock } = setup([]);

    await expect(executeMcpTool(ctx, () => config(), { enableSessionCache: true })).resolves.toEqual(
      [[]],
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops before connecting when the execution was cancelled', async () => {
    const { ctx, fetchMock } = setup([toolCallItem('Onepage_MCP_list_pages')]);
    const controller = new AbortController();
    controller.abort();
    ctx.getExecutionCancelSignal.mockReturnValue(controller.signal);

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: true }),
    ).rejects.toThrow('Execution was cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes the client after every call when the session cache is off', async () => {
    const { ctx, requests } = setup([toolCallItem('Onepage_MCP_list_pages')]);

    await executeMcpTool(ctx, () => config(), { enableSessionCache: false });

    expect(requests.at(-1)?.method).toBe('DELETE');
    expect(mcpClientRegistry.size).toBe(0);
  });

  it('closes the client when a call fails and the session cache is off', async () => {
    const { ctx, requests } = setup([toolCallItem('Onepage_MCP_unknown')]);

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: false }),
    ).rejects.toThrow('Unknown Onepage MCP tool');
    expect(requests.at(-1)?.method).toBe('DELETE');
  });

  it('drops the cached session when a call fails', async () => {
    const { ctx } = setup([toolCallItem('Onepage_MCP_unknown')]);

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: true }),
    ).rejects.toThrow('Unknown Onepage MCP tool');
    expect(mcpClientRegistry.size).toBe(0);
  });

  it('reports a timeout separately from a cancellation', async () => {
    const { ctx, fetchMock } = setup([toolCallItem('Onepage_MCP_list_pages')]);
    fetchMock.mockImplementationOnce(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      });
    });

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: true }),
    ).rejects.toThrow('The Onepage MCP server did not respond in time');
  });

  it('reports a tools/list failure', async () => {
    const { ctx, fetchMock } = setup([toolCallItem('Onepage_MCP_list_pages')]);
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce(implementation);
    fetchMock.mockImplementationOnce(implementation);
    fetchMock.mockImplementationOnce(async () => new Response('nope', { status: 503 }));

    await expect(
      executeMcpTool(ctx, () => config(), { enableSessionCache: true }),
    ).rejects.toThrow('Could not load the tool list from the Onepage MCP server');
  });
});
