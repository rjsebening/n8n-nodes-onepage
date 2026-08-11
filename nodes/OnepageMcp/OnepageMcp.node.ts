import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
  NodeConnectionTypes,
} from 'n8n-workflow';

import { getTools } from './mcp/loadOptions';
import { buildMcpToolkit, executeMcpTool } from './mcp/runtime';
import { ONEPAGE_MCP_DEFAULT_TIMEOUT, type ResolvedMcpConfig } from './mcp/types';

function resolveConfigFromNodeParameters(
  ctx: ISupplyDataFunctions | IExecuteFunctions,
  itemIndex: number,
): ResolvedMcpConfig {
  const timeout = ctx.getNodeParameter(
    'options.timeout',
    itemIndex,
    ONEPAGE_MCP_DEFAULT_TIMEOUT,
  ) as number;

  return {
    timeout,
    toolFilter: {
      mode: ctx.getNodeParameter(
        'include',
        itemIndex,
        'all',
      ) as ResolvedMcpConfig['toolFilter']['mode'],
      includeTools: ctx.getNodeParameter('includeTools', itemIndex, []) as string[],
      excludeTools: ctx.getNodeParameter('excludeTools', itemIndex, []) as string[],
    },
  };
}

export class OnepageMcp implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Onepage MCP',
    name: 'onepageMcp',
    icon: { light: 'file:onepage.light.svg', dark: 'file:onepage.dark.svg' },
    group: ['output'],
    version: 1,
    description: 'Connect to the Onepage MCP Server',
    subtitle:
      '={{ $parameter["include"] === "selected" ? "Selected tools" : $parameter["include"] === "except" ? "All tools except" : "All tools" }}',
    defaults: {
      name: 'Onepage MCP',
    },
    codex: {
      categories: ['AI'],
      subcategories: {
        AI: ['Tools', 'Model Context Protocol'],
      },
      resources: {
        primaryDocumentation: [
          {
            url: 'https://github.com/rjsebening/n8n-nodes-onepage/blob/main/README.md',
          },
        ],
      },
    },
    // AI Tool sub-node: no main input, only the AiTool output port.
    inputs: [],
    outputs: [NodeConnectionTypes.AiTool],
    credentials: [
      {
        name: 'onepageMcpOAuth2Api',
        required: true,
      },
    ],
    properties: [
      {
        displayName:
          "This node must be connected to an AI Agent. <a data-action='openSelectiveNodeCreator' data-action-parameter-creatorview='AI'>Insert one</a>",
        name: 'notice',
        type: 'notice',
        default: '',
        typeOptions: {
          containerClass: 'ndv-connection-hint-notice',
        },
      },
      {
        displayName: 'Tools to Expose',
        name: 'include',
        type: 'options',
        description: 'How to select the tools you want to be exposed to the AI Agent',
        default: 'all',
        options: [
          {
            name: 'All',
            value: 'all',
            description: 'Expose all tools from the Onepage MCP server',
          },
          {
            name: 'Selected',
            value: 'selected',
            description: 'Only expose the tools listed in the parameter "Tools to Include"',
          },
          {
            name: 'All Except',
            value: 'except',
            description: 'Exclude the tools listed in the parameter "Tools to Exclude"',
          },
        ],
      },
      {
        displayName: 'Tools to Include',
        name: 'includeTools',
        type: 'multiOptions',
        default: [],
        description:
          'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
        typeOptions: {
          loadOptionsMethod: 'getTools',
        },
        displayOptions: {
          show: {
            include: ['selected'],
          },
        },
      },
      {
        displayName: 'Tools to Exclude',
        name: 'excludeTools',
        type: 'multiOptions',
        default: [],
        description:
          'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
        typeOptions: {
          loadOptionsMethod: 'getTools',
        },
        displayOptions: {
          show: {
            include: ['except'],
          },
        },
      },
      {
        displayName: 'Options',
        name: 'options',
        placeholder: 'Add Option',
        description: 'Additional options to add',
        type: 'collection',
        default: {},
        options: [
          {
            displayName: 'Timeout',
            name: 'timeout',
            type: 'number',
            typeOptions: {
              minValue: 1,
            },
            default: ONEPAGE_MCP_DEFAULT_TIMEOUT,
            description: 'Time in ms to wait for tool calls to finish',
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      getTools,
    },
  };

  /** Supplies one AI tool per MCP tool to the connected agent. */
  async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
    return await buildMcpToolkit(this, itemIndex, resolveConfigFromNodeParameters(this, itemIndex));
  }

  /**
   * Runs a single tool call dispatched by an AI Agent that executes tools through the engine.
   * One MCP session is reused for every tool call of the same workflow execution.
   */
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    return await executeMcpTool(
      this,
      (itemIndex) => resolveConfigFromNodeParameters(this, itemIndex),
      { enableSessionCache: true },
    );
  }
}
