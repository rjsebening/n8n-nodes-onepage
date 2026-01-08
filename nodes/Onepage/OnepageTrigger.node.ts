import { INodeType, INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';

import { getSites } from './methods/loadOptions/getSites';
import { getFormLeadListsBySiteId } from './methods/loadOptions/getFormLeadListsBySiteId';

import { checkExists } from './methods/webhook/checkExists';
import { create } from './methods/webhook/create';
import { deleteWebhook } from './methods/webhook/delete';

export class OnepageTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OnePage Trigger',
    name: 'onepageTrigger',
    icon: 'file:onepage.svg',
    group: ['trigger'],
    version: 1,
    description: 'Trigger workflows on new OnePage form leads - (powered by agentur-systeme.de)',
    defaults: {
      name: 'OnePage Trigger',
      // @ts-expect-error -- required by n8n linter
      description: 'Interact with OnePage API (powered by agentur-systeme.de)',
    },
    inputs: [],
    outputs: ['main'],
    credentials: [
      {
        name: 'onepageApi',
        required: true,
      },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        isFullPath: false,
        path: 'onepage',
      },
    ],
    properties: [
      {
        displayName: 'Project (Site) Name or ID',
        name: 'siteId',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getSites',
        },
        default: '',
        required: true,
        description:
          'Select the OnePage project (site) that contains the form whose leads should trigger the workflow. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Form Lead List Name or ID',
        name: 'formLeadListId',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getFormLeadListsBySiteId',
          loadOptionsDependsOn: ['siteId'],
        },
        default: '',
        required: true,
        description:
          'Select the form lead list. The workflow triggers whenever a new lead is added. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
    ],
    // @ts-expect-error -- required by n8n linter
    usableAsTool: false,
  };

  methods = {
    loadOptions: {
      getSites,
      getFormLeadListsBySiteId,
    },
  };

  webhookMethods = {
    default: {
      checkExists,
      create,
      delete: deleteWebhook,
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData();

    return {
      workflowData: [this.helpers.returnJsonArray([body])],
    };
  }
}
