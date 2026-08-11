// Shared constants and types for the Onepage MCP node.

import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  ISupplyDataFunctions,
} from 'n8n-workflow';

/** Any n8n context that can drive the MCP client (supply data, loadOptions dropdown, execute). */
export type McpClientContext = ISupplyDataFunctions | ILoadOptionsFunctions | IExecuteFunctions;

/** The subset of `fetch` the MCP transport needs; the authenticated wrapper implements it. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const ONEPAGE_MCP_DEFAULT_ENDPOINT = 'https://mcp.onepage.io/';
export const ONEPAGE_MCP_CREDENTIAL_NAME = 'onepageMcpOAuth2Api';
export const ONEPAGE_MCP_DEFAULT_TIMEOUT = 60000;

export const PROTECTED_RESOURCE_METADATA_URL =
  'https://mcp.onepage.io/.well-known/oauth-protected-resource';
export const AUTHORIZATION_SERVER = 'https://auth.onepage.io/oauth';
/**
 * Identity sent in the MCP `initialize` handshake. Tracks the node type and its `typeVersion`, the
 * way n8n's own MCP nodes do — not the npm package version, which would drift on every release.
 */
export const MCP_CLIENT_INFO = { name: 'n8n-nodes-onepage.onepageMcp', version: '1' };
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * Minimal JSON Schema shape. n8n's MCP nodes use `JSONSchema7` from the `json-schema` package;
 * community nodes cannot ship runtime dependencies, so only the subset the runtime actually
 * inspects is modelled here. The index signature keeps every other keyword (enum, items, $defs,
 * anyOf, ...) intact so the server-provided schema reaches the agent unchanged.
 */
export interface JsonSchemaObject {
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean | Record<string, unknown>;
  [keyword: string]: unknown;
}

/** How the "Tools to Include" parameter selects which MCP tools are exposed. */
export type McpToolIncludeMode = 'all' | 'selected' | 'except';

/** A tool as reported by the MCP server's `tools/list`. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: JsonSchemaObject;
}

/** A single element of an MCP `CallToolResult.content` array. */
export interface McpContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** The result of an MCP `tools/call`. */
export interface McpCallToolResult {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  /** Pre-spec-2025 servers return the payload directly; kept for compatibility, like n8n does. */
  toolResult?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * A LangChain-compatible structured tool, structurally typed.
 *
 * A community node may not depend on `@langchain/core` at runtime, so the object is built by hand.
 * n8n only ever reads `name`/`description` and mutates `schema`/`metadata`
 * (`utils/helpers.ts::getConnectedTools` -> `normalizeToolSchema`), and `@langchain/core`'s
 * `isLangChainTool()` accepts `{ name, schema }` with a plain JSON Schema. Keeping `schema` as JSON
 * Schema is deliberate: n8n converts it with its *own* zod copy, so a zod schema built here would
 * fail n8n's `instanceof ZodType` check and get mangled.
 */
export interface McpDynamicTool {
  name: string;
  description: string;
  schema: JsonSchemaObject;
  /** n8n writes `sourceNodeName` and `isFromToolkit` here, so it must stay writable. */
  metadata: IDataObject;
  returnDirect: boolean;
  lc_namespace: string[];
  getName(): string;
  /** Used by Agent v1/v2 and by sub-agents; Agent v3 dispatches through `execute()` instead. */
  invoke(input: unknown): Promise<string>;
  call(input: unknown): Promise<string>;
}

/**
 * A LangChain-compatible toolkit, structurally typed.
 *
 * n8n-core's `StructuredToolkit` recognises foreign toolkits via
 * `static [Symbol.hasInstance]`, which checks exactly `Array.isArray(value.tools)` and
 * `typeof value.getTools === 'function'`. `utils/helpers.ts` then reads the `tools` *property*,
 * so both members are required. Needs n8n >= 2.32.0 (or 2.30.8 / 2.31.5).
 */
export interface McpToolkit {
  tools: McpDynamicTool[];
  getTools(): McpDynamicTool[];
}

/** Node parameters resolved into a config consumed by the runtime helpers. */
export interface ResolvedMcpConfig {
  timeout: number;
  toolFilter: {
    mode: McpToolIncludeMode;
    includeTools: string[];
    excludeTools: string[];
  };
}
