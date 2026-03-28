import type { IHookFunctions, IWebhookFunctions } from 'n8n-workflow';
import { onepageLogin } from '../../transport/auth';

export async function deleteWebhook(this: IHookFunctions): Promise<boolean> {
  const session = await onepageLogin(this);

  const webhookUrl = (this as unknown as IWebhookFunctions).getNodeWebhookUrl('default');

  const formLeadListId = this.getNodeParameter('formLeadListId') as string;

  const webhooks = await this.helpers.httpRequestWithAuthentication.call(this, 'onepageApi', {
    method: 'GET',
    url: 'https://api-eu.onepage.io/api/v1/crm-service/form-lead-list-integrations',
    headers: { Cookie: session.cookieHeader },
    qs: { formLeadListId },
    json: true,
  });

  const match = Array.isArray(webhooks)
    ? webhooks.find((w: { _id?: string; meta?: { url?: string } }) => w?.meta?.url === webhookUrl)
    : undefined;

  if (!match?._id) {
    this.logger.warn('[Onepage][DELETE] no matching webhook found');
    return true;
  }

  await this.helpers.httpRequestWithAuthentication.call(this, 'onepageApi', {
    method: 'DELETE',
    url: `https://api-eu.onepage.io/api/v1/crm-service/form-lead-list-integrations/${match._id}`,
    headers: { Cookie: session.cookieHeader },
    json: true,
  });

  const staticData = this.getWorkflowStaticData('node');
  staticData.webhookId = undefined;

  return true;
}
