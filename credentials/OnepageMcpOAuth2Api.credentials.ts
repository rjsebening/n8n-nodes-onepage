import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

/**
 * Kept in sync with `ONEPAGE_MCP_DEFAULT_ENDPOINT` in `nodes/OnepageMcp/mcp/types.ts` by a unit
 * test, deliberately *not* by an import: n8n loads credential classes in isolation
 * (`n8n-core/dist/nodes-loader/load-class-in-isolation.js`), and a custom-extension install can
 * place `credentials/` without the sibling `nodes/` tree, which makes a cross-directory require
 * fail at startup.
 */
const ONEPAGE_MCP_ENDPOINT = 'https://mcp.onepage.io/';

/**
 * OAuth 2.1 credential for the Onepage MCP server.
 *
 * This mirrors the per-server credentials n8n generates for its MCP registry nodes
 * (`packages/cli/src/modules/mcp-registry/node-description-transform.ts`): it extends the generic
 * `oAuth2Api` credential, enables Dynamic Client Registration and pins the server URL. n8n core
 * then performs the full MCP OAuth flow automatically — OAuth metadata discovery (RFC 9728 /
 * RFC 8414), Dynamic Client Registration (RFC 7591) and PKCE. No Client ID / Client Secret is
 * entered manually. Access/refresh tokens are managed by n8n and never exposed to the AI agent.
 *
 * **Every property is `hidden` on purpose.** n8n's editor replaces the credential dropdown with a
 * direct "Connect" button exactly when a credential type extends `oAuth2Api` and, after merging the
 * whole `extends` chain, no manually configurable property is left
 * (`canOAuthCredentialQuickConnect` in the editor's `useCredentialOAuth` composable). With
 * `useDynamicClientRegistration` defaulting to `true`, every inherited `oAuth2Api` field is already
 * hidden by its own `displayOptions` — `serverUrl` is the only one that would still show, so it is
 * re-declared as `hidden` here. Making any of these visible again would bring the dropdown back.
 *
 * `allowedHttpRequestDomains` is deliberately *not* declared: n8n then stores `'none'` when it
 * creates the credential, which keeps the HTTP Request node from borrowing these tokens.
 */
export class OnepageMcpOAuth2Api implements ICredentialType {
  name = 'onepageMcpOAuth2Api';

  extends = ['oAuth2Api'];

  displayName = 'Onepage MCP OAuth2 API';

  icon: Icon = { light: 'file:onepage.light.svg', dark: 'file:onepage.dark.svg' };

  documentationUrl =
    'https://github.com/rjsebening/n8n-nodes-onepage/blob/main/CREDENTIALS.md';

  properties: INodeProperties[] = [
    {
      displayName: 'Use Dynamic Client Registration',
      name: 'useDynamicClientRegistration',
      type: 'hidden',
      default: true,
    },
    {
      // Anchor for OAuth metadata discovery + Dynamic Client Registration. Pinned to the Onepage
      // MCP server, which is also the only endpoint the node talks to.
      displayName: 'Server URL',
      name: 'serverUrl',
      type: 'hidden',
      default: ONEPAGE_MCP_ENDPOINT,
    },
    {
      // Empty means "use the protected resource URL the server advertises", which is what Onepage
      // does. Kept as a declared field so the value is part of the credential shape.
      displayName: 'Resource URL',
      name: 'resourceUrl',
      type: 'hidden',
      default: '',
    },
  ];
}
