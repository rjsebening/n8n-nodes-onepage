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
  const session = await onepageLogin(this);

  const response = (await this.helpers.httpRequest({
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
