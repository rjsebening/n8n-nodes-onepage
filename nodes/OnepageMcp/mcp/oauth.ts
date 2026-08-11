import { NodeOperationError } from 'n8n-workflow';

import { OnepageAuthError, describeError, oauthMissingMessage } from './errors';
import { isPlainObject } from './jsonSchema';
import {
  ONEPAGE_MCP_CREDENTIAL_NAME,
  type FetchLike,
  type McpClientContext,
} from './types';

/** Same buffer n8n uses in `shouldRefreshOAuth2Token` (nodes/mcp/shared/utils.ts). */
const OAUTH2_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const OAUTH2_REFRESH_BUFFER_RATIO = 0.1;

/**
 * The fields of `credentials.oauthTokenData` this node reads.
 *
 * `n8n_expires_at` is n8n's own absolute expiry (epoch **milliseconds**, stored as a string). n8n
 * writes it in the OAuth2 callback and after every refresh; a provider-supplied `expires_at` is
 * deliberately ignored, because n8n never populates it. `expires_in` (seconds) only sizes the
 * refresh buffer, it never determines the deadline.
 */
export interface OAuth2TokenData {
  access_token: string;
  refresh_token?: string;
  n8n_expires_at?: string;
  expires_in?: string;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Absolute expiry in epoch ms, or `undefined` when n8n did not record one. */
function expiryOf(tokenData: OAuth2TokenData): number | undefined {
  if (tokenData.n8n_expires_at === undefined) return undefined;
  const expiresAt = Number(tokenData.n8n_expires_at);
  return Number.isFinite(expiresAt) ? expiresAt : undefined;
}

function refreshBufferOf(tokenData: OAuth2TokenData): number {
  const expiresInMs = Number(tokenData.expires_in) * 1000;
  return Number.isFinite(expiresInMs) && expiresInMs > 0
    ? Math.min(OAUTH2_REFRESH_BUFFER_MS, expiresInMs * OAUTH2_REFRESH_BUFFER_RATIO)
    : OAUTH2_REFRESH_BUFFER_MS;
}

/**
 * Whether the access token should be renewed before it is used, mirroring n8n's
 * `shouldRefreshOAuth2Token`.
 *
 * Returns `false` whenever the expiry is unknown — credentials connected with an older n8n, or
 * authorization servers that omit `expires_in`, simply have no `n8n_expires_at`. Those fall back to
 * the reactive refresh on 401/403, which is what this node did before.
 */
export function shouldRefreshOAuth2Token(
  tokenData: OAuth2TokenData,
  now: number = Date.now(),
): boolean {
  if (!tokenData.refresh_token) return false;

  const expiresAt = expiryOf(tokenData);
  if (expiresAt === undefined) return false;

  return now + refreshBufferOf(tokenData) >= expiresAt;
}

/** Reads the OAuth2 token n8n stores for the Onepage MCP credential. */
export async function readOAuthTokenData(ctx: McpClientContext): Promise<OAuth2TokenData> {
  const credentials = await ctx.getCredentials(ONEPAGE_MCP_CREDENTIAL_NAME);
  const raw = credentials?.oauthTokenData;
  const tokenData = isPlainObject(raw) ? raw : {};

  const accessToken = tokenData.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new NodeOperationError(ctx.getNode(), oauthMissingMessage());
  }

  return {
    access_token: accessToken,
    refresh_token: readOptionalString(tokenData.refresh_token),
    n8n_expires_at: readOptionalString(tokenData.n8n_expires_at),
    expires_in: readOptionalString(tokenData.expires_in),
  };
}

/**
 * Builds a fetch that carries the OAuth2 bearer token n8n stores for the Onepage MCP credential.
 *
 * The token flow itself (authorization URL, token URL, scopes, PKCE, dynamic client registration,
 * refresh token storage and rotation) is entirely n8n's — this only reads the stored token and asks
 * n8n to renew it. Two renewal paths, the same combination n8n's own MCP nodes use:
 *
 * - **proactive**: before a request, when the token expires within the refresh buffer. Keeps a
 *   long-lived MCP session from ever hitting an expired token.
 * - **reactive**: one retry after a 401/403, for the cases the proactive check cannot see (unknown
 *   expiry, revoked token, clock skew).
 *
 * Deviation from n8n: n8n evaluates the proactive condition once per client, when the connection is
 * built. Here it is evaluated per request against the token data cached in this closure — no extra
 * credential read, but a session reused across several minutes still renews on time.
 *
 * The native `Response` is returned unchanged so SSE streaming keeps working. The token value is
 * never logged and never leaves the Authorization header.
 */
export function createAuthenticatedFetch(ctx: McpClientContext): FetchLike {
  let tokenData: OAuth2TokenData | undefined;
  let pendingRefresh: Promise<void> | undefined;

  const withAuth = (accessToken: string, init: RequestInit): RequestInit => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return { ...init, headers };
  };

  // Concurrent tool calls share one refresh instead of each triggering their own.
  const refreshToken = async (): Promise<void> => {
    pendingRefresh ??= (async () => {
      await ctx.helpers.refreshOAuth2Token.call(ctx, ONEPAGE_MCP_CREDENTIAL_NAME);
      tokenData = await readOAuthTokenData(ctx);
    })().finally(() => {
      pendingRefresh = undefined;
    });

    await pendingRefresh;
  };

  const refreshBeforeExpiry = async (current: OAuth2TokenData): Promise<void> => {
    if (!shouldRefreshOAuth2Token(current)) return;

    try {
      await refreshToken();
    } catch (error) {
      // Keep going with the current token: it may still be accepted, and the 401 path gets one more
      // attempt. Dropping the recorded expiry stops this from retrying on every single request.
      tokenData = { ...current, n8n_expires_at: undefined };
      ctx.logger.warn(
        'Onepage MCP: proactive OAuth2 token refresh failed, continuing with the current token',
        { error: describeError(error) },
      );
    }
  };

  return async (url, init) => {
    tokenData ??= await readOAuthTokenData(ctx);
    await refreshBeforeExpiry(tokenData);

    let response = await fetch(url, withAuth(tokenData.access_token, init));
    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    let refreshError: unknown;
    try {
      await refreshToken();
    } catch (error) {
      refreshError = error;
    }

    if (refreshError !== undefined) {
      // Never swallowed: the technical detail goes to the n8n log (it can quote the OAuth server's
      // raw response), the user gets the actionable "reconnect the credential" message.
      ctx.logger.error('Onepage MCP: OAuth2 token refresh failed', {
        error: describeError(refreshError),
      });
      throw new OnepageAuthError(response.status);
    }

    response = await fetch(url, withAuth(tokenData.access_token, init));
    if (response.status === 401 || response.status === 403) {
      throw new OnepageAuthError(response.status);
    }
    return response;
  };
}
