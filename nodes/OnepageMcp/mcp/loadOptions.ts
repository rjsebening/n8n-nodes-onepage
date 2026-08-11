import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { loadMcpToolOptions } from './runtime';
import { ONEPAGE_MCP_DEFAULT_TIMEOUT } from './types';

/** Loads the Onepage MCP tools for the "Tools to Include"/"Tools to Exclude" dropdowns. */
export async function getTools(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const timeout = this.getNodeParameter('options.timeout', ONEPAGE_MCP_DEFAULT_TIMEOUT) as number;
  return await loadMcpToolOptions(this, timeout);
}
