import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INode,
  ISupplyDataFunctions,
  NodeParameterValueType,
} from 'n8n-workflow';
import { vi } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface RecordedRequest {
  method: string;
  headers: Headers;
  body?: IDataObject;
}

export interface McpMockServerOptions {
  /** Tool pages returned by `tools/list`; more than one entry exercises cursor pagination. */
  toolPages?: McpToolDefinition[][];
  /** Result of `tools/call`. Throwing here produces a JSON-RPC error response. */
  callTool?: (name: string, args: IDataObject) => unknown;
  sessionId?: string;
  /** Whether responses come back as `application/json` or `text/event-stream`. */
  transport?: 'json' | 'sse';
  /** Statuses returned before the mock starts behaving normally, e.g. `[401]`. */
  failWith?: Array<{ status: number; body?: string }>;
}

function jsonRpcResult(id: unknown, result: unknown): IDataObject {
  return { jsonrpc: '2.0', id, result } as IDataObject;
}

function toResponse(
  payload: unknown,
  transport: 'json' | 'sse',
  headers: Record<string, string>,
): Response {
  if (transport === 'sse') {
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', ...headers },
    });
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * A `fetch` stand-in that speaks just enough Streamable HTTP MCP to drive the real client:
 * `initialize`, `notifications/initialized`, cursor-paginated `tools/list`, `tools/call`
 * and session termination via DELETE.
 */
export function createMcpFetchMock(options: McpMockServerOptions = {}) {
  const {
    toolPages = [[]],
    callTool = () => ({ content: [{ type: 'text', text: 'ok' }] }),
    sessionId = 'session-1',
    transport = 'json',
  } = options;

  const pendingFailures = [...(options.failWith ?? [])];
  const requests: RecordedRequest[] = [];

  const fetchMock = vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);
    const rawBody = typeof init.body === 'string' ? init.body : undefined;
    const body = rawBody ? (JSON.parse(rawBody) as IDataObject) : undefined;

    requests.push({ method: init.method ?? 'GET', headers, body });

    if (init.signal?.aborted) {
      throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    }

    const failure = pendingFailures.shift();
    if (failure) {
      return new Response(failure.body ?? 'denied', { status: failure.status });
    }

    if ((init.method ?? 'GET') === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    const sessionHeaders = { 'mcp-session-id': sessionId };
    const { id, method, params } = (body ?? {}) as {
      id?: unknown;
      method?: string;
      params?: IDataObject;
    };

    if (method === 'initialize') {
      return toResponse(
        jsonRpcResult(id, {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'onepage-mcp', version: '1.0.0' },
        }),
        transport,
        sessionHeaders,
      );
    }

    if (method === 'notifications/initialized') {
      return new Response(null, { status: 202, headers: sessionHeaders });
    }

    if (method === 'tools/list') {
      const cursor = typeof params?.cursor === 'string' ? Number(params.cursor) : 0;
      const tools = toolPages[cursor] ?? [];
      const hasMore = cursor + 1 < toolPages.length;
      return toResponse(
        jsonRpcResult(id, { tools, ...(hasMore ? { nextCursor: String(cursor + 1) } : {}) }),
        transport,
        sessionHeaders,
      );
    }

    if (method === 'tools/call') {
      const name = typeof params?.name === 'string' ? params.name : '';
      const args = (params?.arguments ?? {}) as IDataObject;
      try {
        return toResponse(jsonRpcResult(id, callTool(name, args)), transport, sessionHeaders);
      } catch (error) {
        return toResponse(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: (error as Error).message },
          },
          transport,
          sessionHeaders,
        );
      }
    }

    return toResponse({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unknown' } }, transport, sessionHeaders);
  });

  return { fetchMock, requests };
}

export function installFetchMock(options: McpMockServerOptions = {}) {
  const mocked = createMcpFetchMock(options);
  vi.stubGlobal('fetch', mocked.fetchMock);
  return mocked;
}

export function createNode(overrides: Partial<INode> = {}): INode {
  return {
    id: 'node-1',
    name: 'Onepage MCP',
    type: 'n8n-nodes-onepage.onepageMcp',
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...overrides,
  };
}

function applyCommonContextDefaults(
  ctx: DeepMockProxy<ISupplyDataFunctions | IExecuteFunctions | ILoadOptionsFunctions>,
  node: INode,
): void {
  ctx.getNode.mockReturnValue(node);
  ctx.getCredentials.mockResolvedValue({ oauthTokenData: { access_token: 'access-token' } });
}

export type NodeParameters = Record<string, NodeParameterValueType>;

export function createSupplyDataContext(
  node: INode = createNode(),
  parameters: NodeParameters = {},
) {
  const ctx = mockDeep<ISupplyDataFunctions>();
  applyCommonContextDefaults(ctx, node);
  ctx.getExecutionCancelSignal.mockReturnValue(undefined);
  ctx.helpers.refreshOAuth2Token.mockResolvedValue(undefined);
  ctx.getNodeParameter.mockImplementation((name, _itemIndex, fallback) =>
    name in parameters ? parameters[name] : (fallback as NodeParameterValueType),
  );
  return ctx;
}

export function createExecuteContext(
  options: { node?: INode; executionId?: string; parameters?: NodeParameters } = {},
) {
  const parameters = options.parameters ?? {};
  const ctx = mockDeep<IExecuteFunctions>();
  applyCommonContextDefaults(ctx, options.node ?? createNode());
  ctx.getExecutionCancelSignal.mockReturnValue(undefined);
  ctx.getExecutionId.mockReturnValue(options.executionId ?? 'execution-1');
  ctx.helpers.refreshOAuth2Token.mockResolvedValue(undefined);
  ctx.getNodeParameter.mockImplementation((name, _itemIndex, fallback) =>
    name in parameters ? parameters[name] : (fallback as NodeParameterValueType),
  );
  return ctx;
}

export function createLoadOptionsContext(node: INode = createNode()) {
  const ctx = mockDeep<ILoadOptionsFunctions>();
  applyCommonContextDefaults(ctx, node);
  ctx.helpers.refreshOAuth2Token.mockResolvedValue(undefined);
  return ctx;
}
