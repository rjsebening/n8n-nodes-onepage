import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { AUTHORIZATION_SERVER, PROTECTED_RESOURCE_METADATA_URL } from './types';

/** Raised on 401/403 from the MCP server after a token refresh attempt. Carries no token. */
export class OnepageAuthError extends Error {
  constructor(readonly status: number) {
    super(`Onepage MCP server returned HTTP ${status}`);
    this.name = 'OnepageAuthError';
  }
}

/** Raised when the MCP server returns a JSON-RPC error object. */
export class McpRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'McpRpcError';
  }
}

export function oauthMissingMessage(): string {
  return (
    'The Onepage OAuth connection is missing, expired, or not authorized. ' +
    'Open the "Onepage MCP OAuth2 API" credential in n8n and reconnect your account. ' +
    `Authorization server: ${AUTHORIZATION_SERVER}. ` +
    `Protected resource metadata: ${PROTECTED_RESOURCE_METADATA_URL}.`
  );
}

/** Safe error text. Tokens are only ever sent as headers, never in URLs/bodies/messages. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

/** `fetch` reports both `AbortSignal.timeout` and manual aborts as a DOMException. */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError';
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(describeError(error));
}

/**
 * Classified connection failure, mirroring n8n's `ConnectMcpClientError`
 * (`nodes/mcp/shared/utils.ts`) so the user-facing wording matches the native MCP nodes.
 */
export type McpConnectionError =
  | { type: 'invalid_url'; error: Error }
  | { type: 'connection'; error: Error }
  | { type: 'auth'; error: Error }
  | { type: 'cancelled'; error: Error }
  | { type: 'timeout'; error: Error }
  | { type: 'tools_list'; error: Error };

/**
 * An aborted request means "cancelled" only when the workflow's cancel signal fired; otherwise the
 * per-call timeout signal tripped, which deserves its own message. n8n reports both as cancelled.
 */
export function classifyConnectionError(
  error: unknown,
  signal?: AbortSignal,
): McpConnectionError['type'] {
  if (signal?.aborted) return 'cancelled';
  if (error instanceof OnepageAuthError) return 'auth';
  if (isAbortError(error)) return 'timeout';
  return 'connection';
}

export function mapToNodeOperationError(
  node: INode,
  error: McpConnectionError,
  itemIndex?: number,
): NodeOperationError {
  const options = itemIndex === undefined ? {} : { itemIndex };

  switch (error.type) {
    case 'cancelled':
      return new NodeOperationError(node, error.error, {
        ...options,
        message: 'Execution was cancelled',
      });
    case 'invalid_url':
      return new NodeOperationError(node, error.error, {
        ...options,
        message: 'Could not connect to the Onepage MCP server. The endpoint URL is invalid.',
        description: error.error.message,
      });
    case 'auth':
      return new NodeOperationError(node, error.error, {
        ...options,
        message: 'Could not connect to the Onepage MCP server. Authentication failed.',
        description: oauthMissingMessage(),
      });
    case 'timeout':
      return new NodeOperationError(node, error.error, {
        ...options,
        message: 'The Onepage MCP server did not respond in time',
        description:
          'Raise the "Timeout" value under Options if the server regularly needs longer than the configured limit.',
      });
    case 'tools_list':
      return new NodeOperationError(node, error.error, {
        ...options,
        message: 'Could not load the tool list from the Onepage MCP server',
        description: error.error.message,
      });
    case 'connection':
    default:
      return new NodeOperationError(node, error.error, {
        ...options,
        message: 'Could not connect to the Onepage MCP server',
        description: error.error.message,
      });
  }
}
