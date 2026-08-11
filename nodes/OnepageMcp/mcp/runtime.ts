import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INode,
  INodeExecutionData,
  INodePropertyOptions,
  ISupplyDataFunctions,
  SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { connectOnepageMcpClient, type OnepageMcpClient } from './client';
import {
  classifyConnectionError,
  describeError,
  mapToNodeOperationError,
  toError,
  type McpConnectionError,
} from './errors';
import { pickSchemaProperties } from './jsonSchema';
import {
  extractToolCallOutput,
  getErrorDescriptionFromToolCall,
  isStructuredContent,
} from './results';
import { buildSessionCacheKey, mcpClientRegistry, type ConnectedMcp } from './sessions';
import { createMcpDynamicTool, createMcpToolkit } from './tool';
import { buildToolNameIndex } from './toolNames';
import {
  ONEPAGE_MCP_DEFAULT_ENDPOINT,
  type McpCallToolResult,
  type McpClientContext,
  type McpTool,
  type ResolvedMcpConfig,
} from './types';
import { getSelectedTools } from './utils';

/** The key the agent uses to address a toolkit member; stripped before the arguments are read. */
const TOOL_DISPATCH_KEY = 'tool';
/** Correlation id the execution engine adds to the tool-call item; never an MCP argument. */
const TOOL_CALL_ID_KEY = 'toolCallId';

const CANCELLED_MESSAGE = 'Execution was cancelled';

/**
 * MCP payloads are plain JSON, but typed as `unknown` because they come from an external server.
 * `IDataObject` wants `GenericValue`, which is the same set of values with a different name, so a
 * single cast at this boundary is more honest than a deep clone that only re-labels values.
 */
function toJsonValue(value: unknown): IDataObject[string] {
  return value as IDataObject[string];
}

function cancelSignalOf(ctx: McpClientContext): AbortSignal | undefined {
  return 'getExecutionCancelSignal' in ctx ? ctx.getExecutionCancelSignal() : undefined;
}

/** Connects to the Onepage MCP server and loads its tool list, mapping every failure mode. */
async function connectOrThrow(
  ctx: McpClientContext,
  config: ResolvedMcpConfig,
  itemIndex?: number,
  signal?: AbortSignal,
): Promise<ConnectedMcp> {
  const node = ctx.getNode();

  const asNodeError = (
    error: unknown,
    fallbackType: McpConnectionError['type'],
  ): NodeOperationError => {
    if (error instanceof NodeOperationError) return error;
    const type = classifyConnectionError(error, signal);
    return mapToNodeOperationError(
      node,
      { type: type === 'connection' ? fallbackType : type, error: toError(error) },
      itemIndex,
    );
  };

  let client: OnepageMcpClient;
  try {
    client = await connectOnepageMcpClient(
      ctx,
      ONEPAGE_MCP_DEFAULT_ENDPOINT,
      config.timeout,
      signal,
    );
  } catch (error) {
    throw asNodeError(error, 'connection');
  }

  try {
    return { client, mcpTools: await client.listTools({ signal }) };
  } catch (error) {
    await client.close();
    throw asNodeError(error, 'tools_list');
  }
}

function selectToolsOrThrow(
  node: INode,
  mcpTools: McpTool[],
  config: ResolvedMcpConfig,
  itemIndex?: number,
): McpTool[] {
  const selected = getSelectedTools({
    tools: mcpTools,
    mode: config.toolFilter.mode,
    includeTools: config.toolFilter.includeTools,
    excludeTools: config.toolFilter.excludeTools,
  });

  if (selected.length > 0) return selected;

  const description =
    mcpTools.length === 0
      ? 'Connected successfully to the Onepage MCP server, but it returned an empty list of tools.'
      : 'Connected successfully to the Onepage MCP server, but the "Tools to Include" filter removed every tool. Adjust the filter or pick "All".';

  throw new NodeOperationError(node, 'Onepage MCP Server returned no tools', {
    ...(itemIndex === undefined ? {} : { itemIndex }),
    description,
  });
}

/**
 * Runs one MCP tool call for the `supplyData` path.
 *
 * Like n8n's `createCallTool`, a failure is reported to the UI but handed back to the LLM as text
 * instead of thrown, so the agent can correct itself and continue.
 */
async function callToolForAgent(params: {
  ctx: ISupplyDataFunctions;
  itemIndex: number;
  client: OnepageMcpClient;
  mcpTool: McpTool;
  args: IDataObject;
  timeout: number;
}): Promise<unknown> {
  const { ctx, itemIndex, client, mcpTool, args, timeout } = params;

  const reportError = (message: string): string => {
    const error = new NodeOperationError(ctx.getNode(), message, { itemIndex });
    ctx.addOutputData(NodeConnectionTypes.AiTool, itemIndex, error);
    ctx.logger.error(`Onepage MCP: tool "${mcpTool.name}" failed to execute`, { error });
    return message;
  };

  if (ctx.getExecutionCancelSignal()?.aborted) return CANCELLED_MESSAGE;

  let result: McpCallToolResult;
  try {
    result = await client.callTool(mcpTool.name, pickSchemaProperties(args, mcpTool.inputSchema), {
      signal: ctx.getExecutionCancelSignal(),
      timeout,
    });
  } catch (error) {
    if (ctx.getExecutionCancelSignal()?.aborted) return CANCELLED_MESSAGE;
    return reportError(
      getErrorDescriptionFromToolCall(error) ??
        `Failed to execute the Onepage MCP tool "${mcpTool.name}": ${describeError(error)}`,
    );
  }

  if (result.isError === true) {
    return reportError(
      getErrorDescriptionFromToolCall(result) ??
        `The Onepage MCP tool "${mcpTool.name}" returned an error`,
    );
  }

  return extractToolCallOutput(result);
}

/**
 * Supplies one AI tool per MCP tool, each with the server's own name, description and input
 * schema — the same runtime model as n8n's `McpClientTool` / `McpRegistryClientTool`.
 */
export async function buildMcpToolkit(
  ctx: ISupplyDataFunctions,
  itemIndex: number,
  config: ResolvedMcpConfig,
): Promise<SupplyData> {
  const node = ctx.getNode();

  const fail = (error: NodeOperationError): never => {
    ctx.addOutputData(NodeConnectionTypes.AiTool, itemIndex, error);
    throw error;
  };

  const signal = ctx.getExecutionCancelSignal();
  if (signal?.aborted) {
    return fail(new NodeOperationError(node, CANCELLED_MESSAGE, { itemIndex }));
  }

  let connected: ConnectedMcp;
  try {
    connected = await connectOrThrow(ctx, config, itemIndex, signal);
  } catch (error) {
    ctx.logger.error('Onepage MCP: failed to connect to the MCP server', { error });
    return fail(
      error instanceof NodeOperationError
        ? error
        : new NodeOperationError(node, toError(error), { itemIndex }),
    );
  }

  const { client, mcpTools } = connected;

  try {
    const selected = selectToolsOrThrow(node, mcpTools, config, itemIndex);
    const toolsByVisibleName = buildToolNameIndex(node.name, selected);

    const tools = [...toolsByVisibleName].map(([visibleName, mcpTool]) =>
      createMcpDynamicTool({
        name: visibleName,
        description: mcpTool.description ?? '',
        schema: mcpTool.inputSchema,
        func: async (args) =>
          await callToolForAgent({
            ctx,
            itemIndex,
            client,
            mcpTool,
            args,
            timeout: config.timeout,
          }),
      }),
    );

    ctx.logger.debug(`Onepage MCP: connected, exposing ${tools.length} tools`);

    return {
      response: createMcpToolkit(tools),
      closeFunction: async () => {
        await client.close();
      },
    };
  } catch (error) {
    await client.close();
    return fail(
      error instanceof NodeOperationError
        ? error
        : new NodeOperationError(node, toError(error), { itemIndex }),
    );
  }
}

/** Executes a single toolkit dispatch, i.e. one `{ tool, ...args }` item from the agent. */
async function runToolCall(params: {
  ctx: IExecuteFunctions;
  item: INodeExecutionData;
  mcpTools: McpTool[];
  client: OnepageMcpClient;
  config: ResolvedMcpConfig;
  itemIndex: number;
  returnData: INodeExecutionData[];
}): Promise<void> {
  const { ctx, item, mcpTools, client, config, itemIndex, returnData } = params;
  const node = ctx.getNode();

  const visibleName = item.json[TOOL_DISPATCH_KEY];
  if (typeof visibleName !== 'string' || visibleName.length === 0) {
    throw new NodeOperationError(node, 'No tool name found in the incoming item', {
      itemIndex,
      description: `The AI Agent addresses a tool through the "${TOOL_DISPATCH_KEY}" property of the input item. Connect this node to an AI Agent's tool port.`,
    });
  }

  const selected = selectToolsOrThrow(node, mcpTools, config, itemIndex);
  const toolsByVisibleName = buildToolNameIndex(node.name, selected);
  const mcpTool = toolsByVisibleName.get(visibleName);

  // Also guards against a tool that the filter excludes: it never enters the index.
  if (!mcpTool) {
    throw new NodeOperationError(node, `Unknown Onepage MCP tool "${visibleName}"`, {
      itemIndex,
      description: `Available tools: ${[...toolsByVisibleName.keys()].join(', ')}`,
    });
  }

  const rawArguments: IDataObject = { ...item.json };
  delete rawArguments[TOOL_DISPATCH_KEY];
  delete rawArguments[TOOL_CALL_ID_KEY];

  const result = await client.callTool(
    mcpTool.name,
    pickSchemaProperties(rawArguments, mcpTool.inputSchema),
    { signal: ctx.getExecutionCancelSignal(), timeout: config.timeout },
  );

  if (result.isError === true) {
    throw new NodeOperationError(
      node,
      getErrorDescriptionFromToolCall(result) ??
        `The Onepage MCP tool "${mcpTool.name}" returned an error`,
      { itemIndex },
    );
  }

  const json: IDataObject = {
    response: toJsonValue(result.content ?? extractToolCallOutput(result)),
  };
  if (isStructuredContent(result.structuredContent)) {
    json.structuredContent = toJsonValue(result.structuredContent);
  }

  returnData.push({ json, pairedItem: { item: itemIndex } });
}

/**
 * The dispatch path for AI Agents that run tools through the execution engine (Agent v3+).
 *
 * Such an agent does not invoke the supplied tool object; it re-runs this node with
 * `item.json = { ...agentInput, ...toolArguments, tool: '<visible tool name>', toolCallId }`.
 * That is why an AI tool sub-node needs `execute()` in addition to `supplyData()` — the two are
 * one protocol with two entry points, not two competing ones.
 */
export async function executeMcpTool(
  ctx: IExecuteFunctions,
  resolveConfig: (itemIndex: number) => ResolvedMcpConfig,
  options: { enableSessionCache?: boolean } = {},
): Promise<INodeExecutionData[][]> {
  const node = ctx.getNode();
  const items = ctx.getInputData();
  const returnData: INodeExecutionData[] = [];

  if (items.length === 0) return [returnData];

  const assertNotCancelled = (itemIndex: number): void => {
    if (ctx.getExecutionCancelSignal()?.aborted) {
      throw new NodeOperationError(node, CANCELLED_MESSAGE, { itemIndex });
    }
  };

  // Without a real execution id the cache key could collide across concurrent executions, so the
  // session cache is skipped entirely rather than risking a shared session.
  const executionId = ctx.getExecutionId();

  if (options.enableSessionCache && executionId) {
    assertNotCancelled(0);

    const cacheKey = buildSessionCacheKey(executionId, node.id || node.name);
    // Agent tool dispatch always sends a single item, so the connection settings of the first item
    // apply; only the per-item timeout is re-read below.
    const firstConfig = resolveConfig(0);

    const { client, mcpTools } = await mcpClientRegistry.getOrConnect(
      cacheKey,
      async () => await connectOrThrow(ctx, firstConfig, 0, ctx.getExecutionCancelSignal()),
      {
        logger: ctx.logger,
        onExecutionCancellation: ctx.onExecutionCancellation.bind(ctx),
      },
    );

    let callError: unknown;
    try {
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        assertNotCancelled(itemIndex);
        await runToolCall({
          ctx,
          item: items[itemIndex],
          mcpTools,
          client,
          config: resolveConfig(itemIndex),
          itemIndex,
          returnData,
        });
      }
    } catch (error) {
      callError = error;
    }

    if (callError !== undefined) {
      // A broken session must not be handed to the next tool call of this execution.
      mcpClientRegistry.remove(cacheKey, ctx.logger);
      throw callError;
    }

    // Bump the idle timer last, so the session survives the gap until the agent's next tool call.
    mcpClientRegistry.refresh(cacheKey);
    return [returnData];
  }

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    assertNotCancelled(itemIndex);
    const config = resolveConfig(itemIndex);
    const { client, mcpTools } = await connectOrThrow(
      ctx,
      config,
      itemIndex,
      ctx.getExecutionCancelSignal(),
    );

    try {
      await runToolCall({ ctx, item: items[itemIndex], mcpTools, client, config, itemIndex, returnData });
    } finally {
      await client.close();
    }
  }

  return [returnData];
}

/** Lists tools for the "Tools to Include"/"Tools to Exclude" dropdowns (loadOptions). */
export async function loadMcpToolOptions(
  ctx: ILoadOptionsFunctions,
  timeout: number,
): Promise<INodePropertyOptions[]> {
  const config: ResolvedMcpConfig = {
    timeout,
    toolFilter: { mode: 'all', includeTools: [], excludeTools: [] },
  };

  const { client, mcpTools } = await connectOrThrow(ctx, config, undefined, cancelSignalOf(ctx));
  try {
    // The dropdown stores raw MCP names, which is what `getSelectedTools` filters on at runtime.
    return mcpTools.map((tool) => ({
      name: tool.name,
      value: tool.name,
      description: tool.description,
    }));
  } finally {
    await client.close();
  }
}
