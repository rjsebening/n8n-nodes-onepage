import {
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  NodeConnectionTypes,
} from 'n8n-workflow';

import { getSites } from './methods/loadOptions/getSites';
import { getFormLeadListsBySiteId } from './methods/loadOptions/getFormLeadListsBySiteId';

import { checkExists } from './methods/webhook/checkExists';
import { create } from './methods/webhook/create';
import { deleteWebhook } from './methods/webhook/delete';

export class OnepageTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OnePage Trigger',
    name: 'onepageTrigger',
    icon: { light: 'file:onepage.light.svg', dark: 'file:onepage.dark.svg' },
    group: ['trigger'],
    version: 1,
    subtitle: 'OnePage form lead trigger',
    description: 'Trigger workflows on new OnePage form leads (powered by joergsebening.de)',
    defaults: {
      name: 'OnePage Trigger',
    },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
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
  };

  methods = {
    loadOptions: {
      getSites,
      getFormLeadListsBySiteId,
    },
  };

  // The lifecycle logic lives in ./methods/webhook/*. It is delegated to from
  // inline methods because the community-node linter only recognises lifecycle
  // methods declared as function expressions, not shorthand imported references.
  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        return await checkExists.call(this);
      },
      async create(this: IHookFunctions): Promise<boolean> {
        return await create.call(this);
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        return await deleteWebhook.call(this);
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData();

    return {
      workflowData: [this.helpers.returnJsonArray([body])],
    };
  }
}
