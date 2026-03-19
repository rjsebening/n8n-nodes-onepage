import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { onepageLogin } from '../../transport/auth';

interface LeadList {
  _id: string;
  title: string;
}

interface LeadListResponse {
  result: LeadList[];
}

export async function getFormLeadListsBySiteId(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const siteId = this.getCurrentNodeParameter('siteId') as string;

  if (!siteId) {
    return [{ name: 'Choose a Project (Site) First', value: '' }];
  }

  const session = await onepageLogin(this);

  const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'onepageApi', {
    method: 'POST',
    url: 'https://api-eu.onepage.io/api/v1/crm-service/rpc?_lead-list.getBySite',
    headers: {
      Cookie: session.cookieHeader,
    },
    body: {
      jsonrpc: '2.0',
      id: 'lead-lists',
      method: 'lead-list.getBySite',
      params: { siteId },
    },
    json: true,
  })) as LeadListResponse;

  return response.result.map((list) => ({
    name: list.title,
    value: list._id,
  }));
}
