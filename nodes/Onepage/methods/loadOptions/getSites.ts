import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { onepageLogin } from '../../transport/auth';

interface Site {
  _id: string;
  project_title: string;
}

interface StorageFetchResponse {
  result: Site[];
}

export async function getSites(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const session = await onepageLogin(this);

  const response = (await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api-eu.onepage.io/api/v1/site-service/rpc?_storage.fetch',
    headers: {
      Cookie: session.cookieHeader,
    },
    body: {
      jsonrpc: '2.0',
      id: 'fetch-sites',
      method: 'storage.fetch',
      params: {
        filter: {
          status: 'active',
          pinnedFirst: true,
          sort: 'alphabet',
          folderId: null,
          type: 'project',
        },
      },
    },
    json: true,
  })) as StorageFetchResponse;

  return response.result.map((site) => ({
    name: site.project_title,
    value: site._id,
  }));
}
