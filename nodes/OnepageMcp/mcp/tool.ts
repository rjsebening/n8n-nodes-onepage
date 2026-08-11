import type { IDataObject } from 'n8n-workflow';

import { isPlainObject } from './jsonSchema';
import { stringifyToolOutput } from './results';
import type { JsonSchemaObject, McpDynamicTool, McpToolkit } from './types';

/** LangChain's `ToolCall` shape — `{ name, args, id, type: 'tool_call' }`. */
function isToolCallEnvelope(value: Record<string, unknown>): boolean {
  if (!isPlainObject(value.args)) return false;
  return value.type === 'tool_call' || typeof value.name === 'string';
}

/**
 * Accepts both call shapes LangChain uses: the bare argument object and a `ToolCall` envelope.
 * A scalar is only accepted when the schema is a wrapped non-object schema (see
 * `normalizeInputSchema`), which is the single case where a `value` property exists by construction.
 */
export function normalizeToolInvocationInput(
  input: unknown,
  schema: JsonSchemaObject,
): IDataObject {
  let raw = input;

  if (isPlainObject(raw) && isToolCallEnvelope(raw)) {
    raw = raw.args;
  }

  if (isPlainObject(raw)) {
    return raw as IDataObject;
  }

  if (raw === undefined || raw === null) {
    return {};
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  return 'value' in properties ? { value: raw as IDataObject[string] } : {};
}

/**
 * Builds a structurally LangChain-compatible structured tool.
 *
 * See `McpDynamicTool` for why this is hand-rolled instead of using `DynamicStructuredTool`.
 * `lc_namespace` is set so `@langchain/core`'s `isStructuredTool()` also recognises the object,
 * not just the minimal `isStructuredToolParams()` check.
 */
export function createMcpDynamicTool(params: {
  name: string;
  description: string;
  schema: JsonSchemaObject;
  func: (args: IDataObject) => Promise<unknown>;
}): McpDynamicTool {
  const run = async (input: unknown): Promise<string> =>
    stringifyToolOutput(await params.func(normalizeToolInvocationInput(input, params.schema)));

  return {
    name: params.name,
    description: params.description,
    schema: params.schema,
    // n8n stamps `sourceNodeName` and `isFromToolkit` onto this object.
    metadata: { isFromToolkit: true },
    returnDirect: false,
    lc_namespace: ['langchain', 'tools'],
    getName: () => params.name,
    invoke: run,
    call: run,
  };
}

/** Builds the toolkit handed to n8n. See `McpToolkit` for the exact contract n8n checks. */
export function createMcpToolkit(tools: McpDynamicTool[]): McpToolkit {
  return {
    tools,
    getTools: () => tools,
  };
}
