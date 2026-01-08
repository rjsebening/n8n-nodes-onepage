import type { IHookFunctions } from 'n8n-workflow';

export async function checkExists(this: IHookFunctions): Promise<boolean> {
  const staticData = this.getWorkflowStaticData('node');
  return !!staticData.webhookId;
}
