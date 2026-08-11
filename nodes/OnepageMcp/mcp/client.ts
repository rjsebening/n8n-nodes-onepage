import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { McpRpcError, OnepageAuthError } from './errors';
import { normalizeInputSchema } from './jsonSchema';
import { createAuthenticatedFetch } from './oauth';
import {
  ONEPAGE_MCP_DEFAULT_TIMEOUT,
  MCP_CLIENT_INFO,
  MCP_PROTOCOL_VERSION,
  type FetchLike,
  type McpCallToolResult,
  type McpClientContext,
  type McpTool,
} from './types';

/** Per-request overrides. `signal` carries the workflow cancel signal. */
export interface McpRequestOptions {
  signal?: AbortSignal;
  timeout?: number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: IDataObject;
  error?: { code: number; message: string; data?: unknown };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Merges the workflow cancel signal with the per-call timeout signal.
 * `AbortSignal.any` is available on every Node version n8n supports; the manual fallback exists
 * because community nodes may not use timers to build one themselves.
 */
export function combineSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(active);
  }

  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Minimal MCP client speaking the Streamable HTTP transport (single endpoint, JSON-RPC over HTTP
 * POST, responses as `application/json` or `text/event-stream`).
 *
 * Implemented on the global `fetch` because community nodes may not ship runtime dependencies, so
 * `@modelcontextprotocol/sdk` and its `StreamableHTTPClientTransport` are not available.
 */
export class OnepageMcpClient {
  private sessionId?: string;
  private protocolVersion = MCP_PROTOCOL_VERSION;
  private nextId = 1;
  private closed = false;

  constructor(
    private readonly endpoint: string,
    private readonly authFetch: FetchLike,
    private readonly defaultTimeoutMs: number = ONEPAGE_MCP_DEFAULT_TIMEOUT,
  ) {}

  get isClosed(): boolean {
    return this.closed;
  }

  /** The MCP session id assigned by the server, if it runs in stateful mode. */
  get session(): string | undefined {
    return this.sessionId;
  }

  async initialize(options: McpRequestOptions = {}): Promise<void> {
    const result = await this.request(
      'initialize',
      {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: MCP_CLIENT_INFO,
      },
      options,
    );
    if (typeof result?.protocolVersion === 'string') {
      this.protocolVersion = result.protocolVersion;
    }
    await this.notify('notifications/initialized', options);
  }

  async listTools(options: McpRequestOptions = {}): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.request('tools/list', cursor ? { cursor } : {}, options);
      for (const entry of Array.isArray(result?.tools) ? result.tools : []) {
        const tool = toMcpTool(entry);
        if (tool) tools.push(tool);
      }
      cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : undefined;
    } while (cursor);

    return tools;
  }

  async callTool(
    name: string,
    args: IDataObject,
    options: McpRequestOptions = {},
  ): Promise<McpCallToolResult> {
    const result = await this.request('tools/call', { name, arguments: args }, options);
    return (result ?? {}) as McpCallToolResult;
  }

  /**
   * Terminates the MCP session and blocks any further use of this client, so a client that was
   * closed after an error can never silently open a second session.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const { sessionId } = this;
    this.sessionId = undefined;
    if (!sessionId) return;

    try {
      await this.authFetch(this.endpoint, {
        method: 'DELETE',
        headers: {
          'MCP-Protocol-Version': this.protocolVersion,
          'Mcp-Session-Id': sessionId,
        },
      });
    } catch {
      // Best effort: session termination is optional in the MCP spec, and a failure here must not
      // mask the error that caused the close.
    }
  }

  private baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'MCP-Protocol-Version': this.protocolVersion };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  private async post(payload: IDataObject, options: McpRequestOptions): Promise<Response> {
    if (this.closed) {
      throw new Error('The Onepage MCP client is already closed');
    }

    const timeout = options.timeout ?? this.defaultTimeoutMs;
    const response = await this.authFetch(this.endpoint, {
      method: 'POST',
      headers: {
        ...this.baseHeaders(),
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: combineSignals(
        options.signal,
        timeout > 0 ? AbortSignal.timeout(timeout) : undefined,
      ),
    });

    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) this.sessionId = sessionId;

    if (response.status === 401 || response.status === 403) {
      throw new OnepageAuthError(response.status);
    }
    if (!response.ok) {
      const detail = await safeText(response);
      throw new Error(
        `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
      );
    }
    return response;
  }

  private async request(
    method: string,
    params: IDataObject,
    options: McpRequestOptions,
  ): Promise<IDataObject | undefined> {
    const id = this.nextId++;
    const response = await this.post({ jsonrpc: '2.0', id, method, params }, options);
    const message = await this.readResponse(response, id);
    if (message.error) {
      throw new McpRpcError(message.error.code, message.error.message);
    }
    return message.result;
  }

  private async notify(method: string, options: McpRequestOptions): Promise<void> {
    const response = await this.post({ jsonrpc: '2.0', method, params: {} }, options);
    // Notifications get a 202 with no JSON-RPC body; release the connection.
    try {
      await response.body?.cancel();
    } catch {
      // The body may already be consumed or absent; nothing to release then.
    }
  }

  private async readResponse(response: Response, id: number): Promise<JsonRpcResponse> {
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

    if (contentType.includes('text/event-stream')) {
      return await this.readFromEventStream(response, id);
    }

    const data = (await response.json()) as JsonRpcResponse | JsonRpcResponse[];
    if (Array.isArray(data)) {
      const match = data.find((message) => message.id === id);
      if (!match) throw new Error('MCP server response did not contain a matching message');
      return match;
    }
    return data;
  }

  /** Reads a text/event-stream until the JSON-RPC message matching `id` arrives, then stops. */
  private async readFromEventStream(response: Response, id: number): Promise<JsonRpcResponse> {
    const body = response.body;
    if (!body) throw new Error('MCP server returned an empty event stream');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');

        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const data = rawEvent
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (data === '') continue;

          let message: JsonRpcResponse;
          try {
            message = JSON.parse(data) as JsonRpcResponse;
          } catch {
            continue; // ignore keep-alive / non-JSON events
          }
          if (message.id === id) return message;
        }
      }
    } finally {
      void reader.cancel().catch(() => {
        // The stream is already being torn down; a failed cancel has nothing left to report.
      });
    }

    throw new Error('MCP server closed the event stream without a matching response');
  }
}

/** Validates one `tools/list` entry. Entries without a usable name are dropped. */
function toMcpTool(entry: unknown): McpTool | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;

  const { name, description, inputSchema } = entry as {
    name?: unknown;
    description?: unknown;
    inputSchema?: unknown;
  };
  if (typeof name !== 'string' || name.length === 0) return undefined;

  return {
    name,
    description: typeof description === 'string' ? description : undefined,
    inputSchema: normalizeInputSchema(inputSchema),
  };
}

/**
 * Creates and initializes an MCP client connected to the Onepage server. Throws raw errors
 * (`OnepageAuthError` / `Error`); callers map them onto `NodeOperationError`.
 */
export async function connectOnepageMcpClient(
  ctx: McpClientContext,
  endpoint: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<OnepageMcpClient> {
  let parsedEndpoint: string;
  try {
    parsedEndpoint = new URL(endpoint).toString();
  } catch {
    throw new NodeOperationError(ctx.getNode(), `Invalid Onepage MCP endpoint URL: "${endpoint}".`);
  }

  const client = new OnepageMcpClient(parsedEndpoint, createAuthenticatedFetch(ctx), timeout);

  let initError: unknown;
  try {
    await client.initialize({ signal });
  } catch (error) {
    initError = error;
  }

  // Rethrown outside the catch so a failed handshake never leaves the transport open.
  if (initError !== undefined) {
    await client.close();
    throw initError;
  }

  return client;
}
