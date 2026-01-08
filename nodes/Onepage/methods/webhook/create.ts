import type { IHookFunctions, IWebhookFunctions } from 'n8n-workflow';
import { onepageLogin } from '../../transport/auth';

export async function create(this: IHookFunctions): Promise<boolean> {
  const staticData = this.getWorkflowStaticData('node');
  const session = await onepageLogin(this);

  const webhookUrl = (this as unknown as IWebhookFunctions).getNodeWebhookUrl('default');

  const formLeadListId = this.getNodeParameter('formLeadListId') as string;

  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api-eu.onepage.io/api/v1/crm-service/form-lead-list-integrations/webhook',
    headers: {
      Cookie: session.cookieHeader,
    },
    body: {
      url: webhookUrl,
      formLeadListId,
    },
    json: true,
  });

  staticData.webhookId = response._id;
  return true;
}
