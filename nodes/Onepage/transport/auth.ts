import type { IHookFunctions, ILoadOptionsFunctions, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

type OnepageContext = IHookFunctions | ILoadOptionsFunctions | IExecuteFunctions;

export interface OnepageSession {
  cookieHeader: string;
}

export async function onepageLogin(ctx: OnepageContext): Promise<OnepageSession> {
  const credentials = await ctx.getCredentials('onepageApi');
  const email = credentials.email as string;
  const password = credentials.password as string;

  const response = await ctx.helpers.httpRequest({
    method: 'POST',
    url: 'https://auth.onepage.io/login',
    body: { email, password },
    json: true,
    returnFullResponse: true,
  });

  const setCookie = response.headers['set-cookie'];

  if (!Array.isArray(setCookie)) {
    throw new NodeOperationError(ctx.getNode(), 'No session cookie received');
  }

  return { cookieHeader: setCookie.join('; ') };
}
