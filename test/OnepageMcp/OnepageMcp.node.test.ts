import { NodeConnectionTypes } from 'n8n-workflow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnepageMcp } from '../../nodes/OnepageMcp/OnepageMcp.node';
import { mcpClientRegistry } from '../../nodes/OnepageMcp/mcp/sessions';
import type { McpToolkit } from '../../nodes/OnepageMcp/mcp/types';
import {
  createExecuteContext,
  createNode,
  createSupplyDataContext,
  installFetchMock,
  type NodeParameters,
} from './mcpTestServer';

const TOOLS = [{ name: 'list_pages', description: 'List all pages' }];

const PARAMETERS: NodeParameters = {
  include: 'all',
  includeTools: [],
  excludeTools: [],
  'options.timeout': 5000,
};

afterEach(() => {
  vi.unstubAllGlobals();
  mcpClientRegistry.reset();
});

describe('OnepageMcp node description', () => {
  const node = new OnepageMcp();

  it('is an AI tool sub-node with only the ai_tool output', () => {
    expect(node.description.inputs).toEqual([]);
    expect(node.description.outputs).toEqual([NodeConnectionTypes.AiTool]);
    expect(node.description.version).toBe(1);
  });

  it('requires the Onepage MCP OAuth2 credential', () => {
    expect(node.description.credentials).toEqual([
      { name: 'onepageMcpOAuth2Api', required: true },
    ]);
  });

  it('exposes the All / Selected / All Except filter and the timeout option', () => {
    const include = node.description.properties.find((property) => property.name === 'include');
    expect(include?.options?.map((option) => ('value' in option ? option.value : undefined))).toEqual(
      ['all', 'selected', 'except'],
    );

    const options = node.description.properties.find((property) => property.name === 'options');
    expect(options?.options?.map((option) => option.name)).toEqual(['timeout']);
  });

  it('does not expose a configurable MCP endpoint', () => {
    const names = node.description.properties.map((property) => property.name);
    expect(names).not.toContain('endpointUrl');
    expect(names).not.toContain('sseEndpoint');
    expect(names).not.toContain('serverTransport');
  });

  it('loads the tool list through the getTools loadOptions method', () => {
    expect(node.methods.loadOptions.getTools).toBeTypeOf('function');
  });
});

describe('OnepageMcp supplyData/execute wiring', () => {
  it('supplies one tool per MCP tool', async () => {
    installFetchMock({ toolPages: [TOOLS] });
    const ctx = createSupplyDataContext(createNode({ name: 'Onepage MCP' }), PARAMETERS);

    const supplyData = await new OnepageMcp().supplyData.call(ctx, 0);

    expect((supplyData.response as McpToolkit).tools.map((tool) => tool.name)).toEqual([
      'Onepage_MCP_list_pages',
    ]);
    await supplyData.closeFunction?.();
  });

  it('runs a tool call dispatched by the agent', async () => {
    installFetchMock({
      toolPages: [TOOLS],
      callTool: () => ({ content: [{ type: 'text', text: 'done' }] }),
    });
    const ctx = createExecuteContext({
      node: createNode({ name: 'Onepage MCP' }),
      parameters: PARAMETERS,
    });
    ctx.getInputData.mockReturnValue([{ json: { tool: 'Onepage_MCP_list_pages' } }]);

    const output = await new OnepageMcp().execute.call(ctx);

    expect(output[0][0].json.response).toEqual([{ type: 'text', text: 'done' }]);
  });
});
