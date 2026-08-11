import type { INodeExecutionData } from 'n8n-workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connectOnepageMcpClient } from '../../nodes/OnepageMcp/mcp/client';
import { executeMcpTool } from '../../nodes/OnepageMcp/mcp/runtime';
import { buildSessionCacheKey, mcpClientRegistry } from '../../nodes/OnepageMcp/mcp/sessions';
import { ONEPAGE_MCP_DEFAULT_ENDPOINT, type ResolvedMcpConfig } from '../../nodes/OnepageMcp/mcp/types';
import { createExecuteContext, createNode, installFetchMock } from './mcpTestServer';
import type { RecordedRequest } from './mcpTestServer';

const TOOLS = [{ name: 'list_pages', description: 'List all pages' }];

const CONFIG: ResolvedMcpConfig = {
  timeout: 5000,
  toolFilter: { mode: 'all', includeTools: [], excludeTools: [] },
};

function toolCall(): INodeExecutionData[] {
  return [{ json: { tool: 'Onepage_MCP_list_pages', toolCallId: 'call-1' } }];
}

const initializeCalls = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.body?.method === 'initialize').length;

const deleteCalls = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method === 'DELETE').length;

function contextFor(executionId: string | undefined, nodeId = 'node-1') {
  const ctx = createExecuteContext({
    node: createNode({ id: nodeId, name: 'Onepage MCP' }),
    executionId: executionId ?? '',
  });
  ctx.getInputData.mockReturnValue(toolCall());
  return ctx;
}

beforeEach(() => {
  mcpClientRegistry.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  mcpClientRegistry.reset();
});

describe('MCP session reuse', () => {
  it('reuses one session for every tool call of the same execution', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = contextFor('execution-1');

    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });
    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });
    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });

    expect(initializeCalls(requests)).toBe(1);
    expect(deleteCalls(requests)).toBe(0);
    expect(mcpClientRegistry.size).toBe(1);
  });

  it('never shares a session between two executions', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });

    await executeMcpTool(contextFor('execution-1'), () => CONFIG, { enableSessionCache: true });
    await executeMcpTool(contextFor('execution-2'), () => CONFIG, { enableSessionCache: true });

    expect(initializeCalls(requests)).toBe(2);
    expect(mcpClientRegistry.size).toBe(2);
  });

  it('keeps concurrent executions apart', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });

    await Promise.all([
      executeMcpTool(contextFor('execution-1'), () => CONFIG, { enableSessionCache: true }),
      executeMcpTool(contextFor('execution-2'), () => CONFIG, { enableSessionCache: true }),
    ]);

    expect(initializeCalls(requests)).toBe(2);
    expect(mcpClientRegistry.size).toBe(2);
  });

  it('keeps two nodes of the same execution apart', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });

    await executeMcpTool(contextFor('execution-1', 'node-a'), () => CONFIG, {
      enableSessionCache: true,
    });
    await executeMcpTool(contextFor('execution-1', 'node-b'), () => CONFIG, {
      enableSessionCache: true,
    });

    expect(initializeCalls(requests)).toBe(2);
    expect(mcpClientRegistry.size).toBe(2);
  });

  it('shares one connection between concurrent calls of the same execution', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = contextFor('execution-1');

    await Promise.all([
      executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true }),
      executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true }),
    ]);

    expect(initializeCalls(requests)).toBe(1);
  });

  it('does not cache anything without an execution id', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });

    await executeMcpTool(contextFor(undefined), () => CONFIG, { enableSessionCache: true });
    await executeMcpTool(contextFor(undefined), () => CONFIG, { enableSessionCache: true });

    expect(initializeCalls(requests)).toBe(2);
    expect(deleteCalls(requests)).toBe(2);
    expect(mcpClientRegistry.size).toBe(0);
  });

  it('closes the cached session when the execution is cancelled', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = contextFor('execution-1');
    const cancellationHandlers: Array<() => unknown> = [];
    ctx.onExecutionCancellation.mockImplementation((handler) => {
      cancellationHandlers.push(handler);
    });

    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });
    expect(mcpClientRegistry.size).toBe(1);

    for (const handler of cancellationHandlers) handler();
    await vi.waitFor(() => expect(deleteCalls(requests)).toBe(1));
    expect(mcpClientRegistry.size).toBe(0);
  });

  it('reconnects after the cached session was removed', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = contextFor('execution-1');

    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });
    mcpClientRegistry.remove(buildSessionCacheKey('execution-1', 'node-1'));
    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });

    expect(initializeCalls(requests)).toBe(2);
  });

  it('never hands out a client that has been closed', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = contextFor('execution-1');
    const key = buildSessionCacheKey('execution-1', 'node-1');

    const connected = await mcpClientRegistry.getOrConnect(key, async () => ({
      client: await connectOnepageMcpClient(ctx, ONEPAGE_MCP_DEFAULT_ENDPOINT, 5000),
      mcpTools: [],
    }));
    await connected.client.close();

    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });

    expect(initializeCalls(requests)).toBe(2);
    expect(mcpClientRegistry.size).toBe(1);
  });

  it('evicts idle sessions once the TTL has passed', async () => {
    const { requests } = installFetchMock({ toolPages: [TOOLS] });
    const ctx = contextFor('execution-1');

    await executeMcpTool(ctx, () => CONFIG, { enableSessionCache: true });

    // The registry has no timer of its own; eviction happens lazily on the next access.
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 10 * 60 * 1000);
    await executeMcpTool(contextFor('execution-2'), () => CONFIG, { enableSessionCache: true });
    vi.mocked(Date.now).mockRestore();

    expect(mcpClientRegistry.size).toBe(1);
    await vi.waitFor(() => expect(deleteCalls(requests)).toBe(1));
  });
});
