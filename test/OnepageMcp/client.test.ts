import { NodeOperationError } from 'n8n-workflow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectOnepageMcpClient } from '../../nodes/OnepageMcp/mcp/client';
import { OnepageAuthError } from '../../nodes/OnepageMcp/mcp/errors';
import { ONEPAGE_MCP_DEFAULT_ENDPOINT } from '../../nodes/OnepageMcp/mcp/types';
import { createLoadOptionsContext, installFetchMock } from './mcpTestServer';

const TIMEOUT = 5000;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function connect(options: Parameters<typeof installFetchMock>[0] = {}) {
  const mocked = installFetchMock(options);
  const ctx = createLoadOptionsContext();
  const client = await connectOnepageMcpClient(ctx, ONEPAGE_MCP_DEFAULT_ENDPOINT, TIMEOUT);
  return { ...mocked, ctx, client };
}

describe('connectOnepageMcpClient', () => {
  it('initializes the session and sends the bearer token', async () => {
    const { client, requests } = await connect();

    expect(requests[0].body?.method).toBe('initialize');
    expect(requests[0].headers.get('authorization')).toBe('Bearer access-token');
    expect(requests[0].headers.get('accept')).toBe('application/json, text/event-stream');
    expect(requests[1].body?.method).toBe('notifications/initialized');
    expect(client.session).toBe('session-1');

    await client.close();
  });

  it('rejects an invalid endpoint with a NodeOperationError', async () => {
    installFetchMock();
    const ctx = createLoadOptionsContext();

    await expect(connectOnepageMcpClient(ctx, 'not a url', TIMEOUT)).rejects.toBeInstanceOf(
      NodeOperationError,
    );
  });

  it('reports a missing access token instead of calling the server', async () => {
    const { fetchMock } = installFetchMock();
    const ctx = createLoadOptionsContext();
    ctx.getCredentials.mockResolvedValue({});

    await expect(
      connectOnepageMcpClient(ctx, ONEPAGE_MCP_DEFAULT_ENDPOINT, TIMEOUT),
    ).rejects.toBeInstanceOf(NodeOperationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes the transport when the handshake fails', async () => {
    installFetchMock({ failWith: [{ status: 500, body: 'boom' }] });
    const ctx = createLoadOptionsContext();

    await expect(
      connectOnepageMcpClient(ctx, ONEPAGE_MCP_DEFAULT_ENDPOINT, TIMEOUT),
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe('OnepageMcpClient', () => {
  it('lists tools across cursor pages', async () => {
    const { client } = await connect({
      toolPages: [
        [{ name: 'list_pages', description: 'List pages' }],
        [{ name: 'get_page', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } }],
      ],
    });

    const tools = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['list_pages', 'get_page']);
    expect(tools[0].inputSchema).toEqual({ type: 'object', properties: {} });
    expect(tools[1].inputSchema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
    });

    await client.close();
  });

  it('drops malformed tool entries', async () => {
    const { client } = await connect({
      toolPages: [[{ name: 'ok' }, { description: 'no name' } as never, null as never]],
    });

    expect((await client.listTools()).map((tool) => tool.name)).toEqual(['ok']);
    await client.close();
  });

  it('reads results delivered as an event stream', async () => {
    const { client } = await connect({
      transport: 'sse',
      toolPages: [[{ name: 'list_pages' }]],
      callTool: () => ({ content: [{ type: 'text', text: 'streamed' }] }),
    });

    expect((await client.listTools()).map((tool) => tool.name)).toEqual(['list_pages']);
    await expect(client.callTool('list_pages', {})).resolves.toEqual({
      content: [{ type: 'text', text: 'streamed' }],
    });

    await client.close();
  });

  it('surfaces JSON-RPC errors', async () => {
    const { client } = await connect({
      callTool: () => {
        throw new Error('tool exploded');
      },
    });

    await expect(client.callTool('list_pages', {})).rejects.toThrow('tool exploded');
    await client.close();
  });

  it('refreshes the token once on 401 and retries with the new one', async () => {
    const { client, fetchMock, ctx, requests } = await connect({
      toolPages: [[{ name: 'list_pages' }]],
    });

    // The token n8n hands out after the refresh.
    ctx.getCredentials.mockResolvedValue({ oauthTokenData: { access_token: 'refreshed-token' } });
    const callsBefore = fetchMock.mock.calls.length;
    fetchMock.mockImplementationOnce(async () => new Response('denied', { status: 401 }));

    const tools = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(['list_pages']);
    expect(ctx.helpers.refreshOAuth2Token).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 2);
    expect(requests.at(-1)?.headers.get('authorization')).toBe('Bearer refreshed-token');

    await client.close();
  });

  it('renews an expiring token before the handshake, without a failed request', async () => {
    installFetchMock({ toolPages: [[{ name: 'list_pages' }]] });
    const ctx = createLoadOptionsContext();
    ctx.getCredentials
      .mockResolvedValueOnce({
        oauthTokenData: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          n8n_expires_at: String(Date.now() + 30_000),
          expires_in: '3600',
        },
      })
      .mockResolvedValue({
        oauthTokenData: {
          access_token: 'renewed-token',
          refresh_token: 'refresh-token',
          n8n_expires_at: String(Date.now() + 3_600_000),
          expires_in: '3600',
        },
      });

    const client = await connectOnepageMcpClient(ctx, ONEPAGE_MCP_DEFAULT_ENDPOINT, TIMEOUT);

    expect(ctx.helpers.refreshOAuth2Token).toHaveBeenCalledTimes(1);
    // The very first request already carries the renewed token — no 401 was needed.
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    expect(new Headers((vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe(
      'Bearer renewed-token',
    );

    await client.close();
  });

  it('fails with an auth error when the refresh itself fails', async () => {
    const { client, ctx, fetchMock } = await connect();
    ctx.helpers.refreshOAuth2Token.mockRejectedValue(new Error('refresh token revoked'));
    fetchMock.mockImplementationOnce(async () => new Response('denied', { status: 401 }));

    await expect(client.listTools()).rejects.toBeInstanceOf(OnepageAuthError);
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it('fails with an auth error when the retry is still unauthorized', async () => {
    const { client, fetchMock } = await connect();
    fetchMock
      .mockImplementationOnce(async () => new Response('denied', { status: 401 }))
      .mockImplementationOnce(async () => new Response('denied', { status: 401 }));

    await expect(client.listTools()).rejects.toBeInstanceOf(OnepageAuthError);
  });

  it('aborts when the caller signal is already aborted', async () => {
    const { client } = await connect();
    const controller = new AbortController();
    controller.abort();

    await expect(client.listTools({ signal: controller.signal })).rejects.toThrow(/abort/i);
    await client.close();
  });

  it('times out a slow call', async () => {
    const { client, fetchMock } = await connect();
    fetchMock.mockImplementationOnce(
      async (_url: string, init: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
          );
        }),
    );

    await expect(client.callTool('slow', {}, { timeout: 10 })).rejects.toThrow('timed out');
    await client.close();
  });

  it('terminates the session on close and refuses further use', async () => {
    const { client, requests } = await connect();

    await client.close();

    const deleteRequest = requests.at(-1);
    expect(deleteRequest?.method).toBe('DELETE');
    expect(deleteRequest?.headers.get('mcp-session-id')).toBe('session-1');
    expect(client.isClosed).toBe(true);

    await expect(client.listTools()).rejects.toThrow(/already closed/);
  });

  it('closes only once', async () => {
    const { client, requests } = await connect();

    await client.close();
    const requestCount = requests.length;
    await client.close();

    expect(requests).toHaveLength(requestCount);
  });
});
