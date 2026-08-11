// @langchain/core is a devDependency only — it is never imported by the shipped node, but the
// published node has to satisfy these very guards, so the tests check against the real thing.
import { isLangChainTool } from '@langchain/core/tools';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildMcpToolkit } from '../../nodes/OnepageMcp/mcp/runtime';
import type { McpDynamicTool, McpToolkit, ResolvedMcpConfig } from '../../nodes/OnepageMcp/mcp/types';
import { createNode, createSupplyDataContext, installFetchMock } from './mcpTestServer';
import type { McpMockServerOptions } from './mcpTestServer';

const TOOLS = [
  { name: 'list_pages', description: 'List all pages' },
  {
    name: 'get_page',
    description: 'Get one page',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string' }, expand: { type: 'boolean' } },
      required: ['pageId'],
    },
  },
  { name: 'update_page', description: 'Update a page' },
];

function config(overrides: Partial<ResolvedMcpConfig['toolFilter']> = {}): ResolvedMcpConfig {
  return {
    timeout: 5000,
    toolFilter: { mode: 'all', includeTools: [], excludeTools: [], ...overrides },
  };
}

async function supply(
  options: McpMockServerOptions = { toolPages: [TOOLS] },
  toolFilter: Partial<ResolvedMcpConfig['toolFilter']> = {},
) {
  const mocked = installFetchMock(options);
  const ctx = createSupplyDataContext(createNode({ name: 'Onepage MCP' }));
  const supplyData = await buildMcpToolkit(ctx, 0, config(toolFilter));
  const toolkit = supplyData.response as McpToolkit;
  return { ...mocked, ctx, supplyData, toolkit };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildMcpToolkit', () => {
  it('exposes every MCP tool as its own AI tool', async () => {
    const { toolkit, supplyData } = await supply();

    expect(toolkit.tools).toHaveLength(3);
    expect(toolkit.getTools()).toBe(toolkit.tools);
    expect(toolkit.tools.map((tool) => tool.name)).toEqual([
      'Onepage_MCP_list_pages',
      'Onepage_MCP_get_page',
      'Onepage_MCP_update_page',
    ]);
    expect(toolkit.tools.map((tool) => tool.description)).toEqual([
      'List all pages',
      'Get one page',
      'Update a page',
    ]);
    expect(supplyData.closeFunction).toBeTypeOf('function');
  });

  it('satisfies n8n-core\'s StructuredToolkit duck check', async () => {
    const { toolkit } = await supply();

    // `StructuredToolkit[Symbol.hasInstance]` checks exactly these two, and
    // `utils/helpers.ts::getConnectedTools` then reads the `tools` property.
    expect(Array.isArray(toolkit.tools)).toBe(true);
    expect(typeof toolkit.getTools).toBe('function');
  });

  it('produces tools the real LangChain guards accept', async () => {
    const { toolkit } = await supply();

    for (const tool of toolkit.tools) {
      expect(isLangChainTool(tool)).toBe(true);

      const openAiTool = convertToOpenAITool(tool);
      expect(openAiTool.type).toBe('function');
      expect(openAiTool.function.name).toBe(tool.name);
      // The MCP schema reaches the model untouched, without a JSON-string wrapper.
      expect(openAiTool.function.parameters).toEqual(tool.schema);
      expect(openAiTool.function.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);

      expect(tool.metadata).toEqual({ isFromToolkit: true });
      expect(tool.returnDirect).toBe(false);
      expect(typeof tool.invoke).toBe('function');
    }
  });

  it('lets n8n mutate metadata and schema', async () => {
    const { toolkit } = await supply();
    const [tool] = toolkit.tools;

    tool.metadata.sourceNodeName = 'Onepage MCP';
    tool.schema = { type: 'object', properties: { replaced: { type: 'string' } } };

    expect(tool.metadata.sourceNodeName).toBe('Onepage MCP');
    expect(tool.schema.properties).toEqual({ replaced: { type: 'string' } });
  });

  it('takes the input schema straight from the MCP server', async () => {
    const { toolkit } = await supply();
    const getPage = toolkit.tools.find((tool) => tool.name === 'Onepage_MCP_get_page');

    expect(getPage?.schema).toEqual({
      type: 'object',
      properties: { pageId: { type: 'string' }, expand: { type: 'boolean' } },
      required: ['pageId'],
    });
  });

  it('gives a tool without parameters an empty object schema', async () => {
    const { toolkit } = await supply();
    const listPages = toolkit.tools.find((tool) => tool.name === 'Onepage_MCP_list_pages');

    expect(listPages?.schema).toEqual({ type: 'object', properties: {} });
  });

  it('applies the "Selected" filter', async () => {
    const { toolkit } = await supply({ toolPages: [TOOLS] }, {
      mode: 'selected',
      includeTools: ['get_page'],
    });

    expect(toolkit.tools.map((tool) => tool.name)).toEqual(['Onepage_MCP_get_page']);
  });

  it('applies the "All Except" filter', async () => {
    const { toolkit } = await supply({ toolPages: [TOOLS] }, {
      mode: 'except',
      excludeTools: ['update_page'],
    });

    expect(toolkit.tools.map((tool) => tool.name)).toEqual([
      'Onepage_MCP_list_pages',
      'Onepage_MCP_get_page',
    ]);
  });

  it('fails and closes the client when the filter leaves nothing', async () => {
    installFetchMock({ toolPages: [TOOLS] });
    const ctx = createSupplyDataContext();

    await expect(
      buildMcpToolkit(
        ctx,
        0,
        config({ mode: 'except', excludeTools: TOOLS.map((tool) => tool.name) }),
      ),
    ).rejects.toThrow('Onepage MCP Server returned no tools');
    expect(ctx.addOutputData).toHaveBeenCalledWith(
      NodeConnectionTypes.AiTool,
      0,
      expect.any(NodeOperationError),
    );
  });

  it('fails when the server returns no tools at all', async () => {
    installFetchMock({ toolPages: [[]] });
    const ctx = createSupplyDataContext();

    await expect(buildMcpToolkit(ctx, 0, config())).rejects.toThrow(
      'Onepage MCP Server returned no tools',
    );
  });

  it('reports a connection failure on the ai_tool output', async () => {
    installFetchMock({ failWith: [{ status: 500, body: 'gateway down' }] });
    const ctx = createSupplyDataContext();

    await expect(buildMcpToolkit(ctx, 0, config())).rejects.toThrow(
      'Could not connect to the Onepage MCP server',
    );
    expect(ctx.addOutputData).toHaveBeenCalled();
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it('reports a tools/list failure separately from a connection failure', async () => {
    const { fetchMock } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = createSupplyDataContext();
    // Let the handshake through, then fail the tools/list call.
    fetchMock.mockImplementationOnce(fetchMock.getMockImplementation()!);
    fetchMock.mockImplementationOnce(fetchMock.getMockImplementation()!);
    fetchMock.mockImplementationOnce(async () => new Response('nope', { status: 503 }));

    await expect(buildMcpToolkit(ctx, 0, config())).rejects.toThrow(
      'Could not load the tool list from the Onepage MCP server',
    );
  });

  it('maps an OAuth failure onto an authentication error', async () => {
    const { fetchMock } = installFetchMock();
    const ctx = createSupplyDataContext();
    fetchMock.mockImplementation(async () => new Response('denied', { status: 401 }));

    await expect(buildMcpToolkit(ctx, 0, config())).rejects.toThrow(/Authentication failed/);
  });

  it('refuses to connect when the execution was already cancelled', async () => {
    const { fetchMock } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = createSupplyDataContext();
    const controller = new AbortController();
    controller.abort();
    ctx.getExecutionCancelSignal.mockReturnValue(controller.signal);

    await expect(buildMcpToolkit(ctx, 0, config())).rejects.toThrow('Execution was cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes the client through closeFunction', async () => {
    const { supplyData, requests } = await supply();

    await supplyData.closeFunction?.();

    expect(requests.at(-1)?.method).toBe('DELETE');
  });
});

describe('tool invocation through supplyData', () => {
  async function invoke(
    toolName: string,
    input: unknown,
    options: McpMockServerOptions = { toolPages: [TOOLS] },
  ) {
    const supplied = await supply(options);
    const tool = supplied.toolkit.tools.find(
      (entry: McpDynamicTool) => entry.name === toolName,
    ) as McpDynamicTool;
    const output = await tool.invoke(input);
    return { ...supplied, output };
  }

  it('calls the MCP server with the original tool name', async () => {
    const callTool = vi.fn(() => ({ content: [{ type: 'text', text: 'done' }] }));
    const { output, requests } = await invoke(
      'Onepage_MCP_get_page',
      { pageId: 'p1' },
      { toolPages: [TOOLS], callTool },
    );

    expect(callTool).toHaveBeenCalledWith('get_page', { pageId: 'p1' });
    expect(requests.at(-1)?.body?.params).toEqual({
      name: 'get_page',
      arguments: { pageId: 'p1' },
    });
    expect(output).toBe('done');
  });

  it('drops arguments the input schema does not declare', async () => {
    const callTool = vi.fn(() => ({ content: [] }));
    await invoke(
      'Onepage_MCP_get_page',
      { pageId: 'p1', injected: 'nope' },
      { toolPages: [TOOLS], callTool },
    );

    expect(callTool).toHaveBeenCalledWith('get_page', { pageId: 'p1' });
  });

  it('accepts a LangChain ToolCall envelope', async () => {
    const callTool = vi.fn(() => ({ content: [] }));
    await invoke(
      'Onepage_MCP_get_page',
      { name: 'Onepage_MCP_get_page', args: { pageId: 'p2' }, id: 'call-1', type: 'tool_call' },
      { toolPages: [TOOLS], callTool },
    );

    expect(callTool).toHaveBeenCalledWith('get_page', { pageId: 'p2' });
  });

  it('serialises structured content for the LLM', async () => {
    const { output } = await invoke(
      'Onepage_MCP_list_pages',
      {},
      { toolPages: [TOOLS], callTool: () => ({ structuredContent: { total: 2 } }) },
    );

    expect(output).toBe('{"total":2}');
  });

  it('hands an MCP isError result back as text and reports it', async () => {
    const { output, ctx } = await invoke(
      'Onepage_MCP_list_pages',
      {},
      {
        toolPages: [TOOLS],
        callTool: () => ({ isError: true, content: [{ type: 'text', text: 'quota exceeded' }] }),
      },
    );

    expect(output).toBe('quota exceeded');
    expect(ctx.addOutputData).toHaveBeenCalledWith(
      NodeConnectionTypes.AiTool,
      0,
      expect.any(NodeOperationError),
    );
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it('hands a transport failure back as text instead of throwing', async () => {
    const supplied = await supply();
    supplied.fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
    const tool = supplied.toolkit.tools[0];

    await expect(tool.invoke({})).resolves.toContain('HTTP 500');
    expect(supplied.ctx.addOutputData).toHaveBeenCalled();
  });

  it('returns a cancellation notice instead of calling the server', async () => {
    const supplied = await supply();
    const controller = new AbortController();
    controller.abort();
    supplied.ctx.getExecutionCancelSignal.mockReturnValue(controller.signal);

    await expect(supplied.toolkit.tools[0].invoke({})).resolves.toBe('Execution was cancelled');
  });
});
