import type { IDataObject } from 'n8n-workflow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnepageAuthError } from '../../nodes/OnepageMcp/mcp/errors';
import {
  createAuthenticatedFetch,
  shouldRefreshOAuth2Token,
  type OAuth2TokenData,
} from '../../nodes/OnepageMcp/mcp/oauth';
import { createLoadOptionsContext } from './mcpTestServer';

const NOW = 1_700_000_000_000;
const HOUR_MS = 60 * 60 * 1000;

function token(overrides: Partial<OAuth2TokenData> = {}): OAuth2TokenData {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    n8n_expires_at: String(NOW + HOUR_MS),
    expires_in: '3600',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldRefreshOAuth2Token', () => {
  it('leaves a token alone while it is comfortably valid', () => {
    expect(shouldRefreshOAuth2Token(token(), NOW)).toBe(false);
  });

  it('renews inside the two-minute buffer', () => {
    expect(shouldRefreshOAuth2Token(token({ n8n_expires_at: String(NOW + 119_000) }), NOW)).toBe(
      true,
    );
    expect(shouldRefreshOAuth2Token(token({ n8n_expires_at: String(NOW + 121_000) }), NOW)).toBe(
      false,
    );
  });

  it('shrinks the buffer to 10% for short-lived tokens', () => {
    // expires_in 600s -> buffer 60s, not the 120s default.
    const shortLived = { expires_in: '600' };
    expect(
      shouldRefreshOAuth2Token(token({ ...shortLived, n8n_expires_at: String(NOW + 59_000) }), NOW),
    ).toBe(true);
    expect(
      shouldRefreshOAuth2Token(token({ ...shortLived, n8n_expires_at: String(NOW + 61_000) }), NOW),
    ).toBe(false);
  });

  it('falls back to the flat buffer when expires_in is unusable', () => {
    for (const expires_in of [undefined, '0', 'not-a-number']) {
      expect(
        shouldRefreshOAuth2Token(token({ expires_in, n8n_expires_at: String(NOW + 119_000) }), NOW),
      ).toBe(true);
    }
  });

  it('renews a token that already expired', () => {
    expect(shouldRefreshOAuth2Token(token({ n8n_expires_at: String(NOW - 1) }), NOW)).toBe(true);
  });

  it('never renews without a refresh token', () => {
    expect(
      shouldRefreshOAuth2Token(
        token({ refresh_token: undefined, n8n_expires_at: String(NOW - 1) }),
        NOW,
      ),
    ).toBe(false);
  });

  it('stays passive when n8n recorded no absolute expiry', () => {
    // Credentials connected with an older n8n, or servers that omit expires_in.
    expect(shouldRefreshOAuth2Token(token({ n8n_expires_at: undefined }), NOW)).toBe(false);
    expect(shouldRefreshOAuth2Token(token({ n8n_expires_at: 'whenever' }), NOW)).toBe(false);
  });
});

describe('createAuthenticatedFetch', () => {
  function setup(oauthTokenData: IDataObject, refreshedTokenData?: IDataObject) {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const ctx = createLoadOptionsContext();
    ctx.getCredentials.mockResolvedValue({ oauthTokenData: refreshedTokenData ?? oauthTokenData });
    if (refreshedTokenData) {
      ctx.getCredentials.mockResolvedValueOnce({ oauthTokenData });
    }

    return { ctx, fetchMock, authFetch: createAuthenticatedFetch(ctx) };
  }

  const sentToken = (fetchMock: { mock: { calls: unknown[][] } }, call: number) =>
    new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers).get('authorization');

  it('renews proactively before a request when the token is about to expire', async () => {
    const { ctx, fetchMock, authFetch } = setup(
      { ...token({ n8n_expires_at: String(Date.now() + 30_000) }) },
      { ...token({ access_token: 'renewed-token', n8n_expires_at: String(Date.now() + HOUR_MS) }) },
    );

    await authFetch('https://mcp.onepage.io/', { method: 'POST' });

    expect(ctx.helpers.refreshOAuth2Token).toHaveBeenCalledTimes(1);
    // Only one request went out — no 401 round trip was needed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentToken(fetchMock, 0)).toBe('Bearer renewed-token');
  });

  it('does not renew a token that is still valid', async () => {
    const { ctx, fetchMock, authFetch } = setup({
      ...token({ n8n_expires_at: String(Date.now() + HOUR_MS) }),
    });

    await authFetch('https://mcp.onepage.io/', { method: 'POST' });

    expect(ctx.helpers.refreshOAuth2Token).not.toHaveBeenCalled();
    expect(sentToken(fetchMock, 0)).toBe('Bearer access-token');
  });

  it('renews once for several requests on the same client', async () => {
    const { ctx, authFetch } = setup(
      { ...token({ n8n_expires_at: String(Date.now() + 30_000) }) },
      { ...token({ access_token: 'renewed-token', n8n_expires_at: String(Date.now() + HOUR_MS) }) },
    );

    await authFetch('https://mcp.onepage.io/', { method: 'POST' });
    await authFetch('https://mcp.onepage.io/', { method: 'POST' });

    expect(ctx.helpers.refreshOAuth2Token).toHaveBeenCalledTimes(1);
  });

  it('shares one renewal between concurrent requests', async () => {
    const { ctx, authFetch } = setup(
      { ...token({ n8n_expires_at: String(Date.now() + 30_000) }) },
      { ...token({ access_token: 'renewed-token', n8n_expires_at: String(Date.now() + HOUR_MS) }) },
    );

    await Promise.all([
      authFetch('https://mcp.onepage.io/', { method: 'POST' }),
      authFetch('https://mcp.onepage.io/', { method: 'POST' }),
    ]);

    expect(ctx.helpers.refreshOAuth2Token).toHaveBeenCalledTimes(1);
  });

  it('carries on with the current token when the proactive renewal fails', async () => {
    const { ctx, fetchMock, authFetch } = setup({
      ...token({ n8n_expires_at: String(Date.now() + 30_000) }),
    });
    ctx.helpers.refreshOAuth2Token.mockRejectedValue(new Error('token endpoint unreachable'));

    await authFetch('https://mcp.onepage.io/', { method: 'POST' });

    expect(sentToken(fetchMock, 0)).toBe('Bearer access-token');
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('does not retry the proactive renewal on every following request', async () => {
    const { ctx, authFetch } = setup({
      ...token({ n8n_expires_at: String(Date.now() + 30_000) }),
    });
    ctx.helpers.refreshOAuth2Token.mockRejectedValue(new Error('token endpoint unreachable'));

    await authFetch('https://mcp.onepage.io/', { method: 'POST' });
    await authFetch('https://mcp.onepage.io/', { method: 'POST' });
    await authFetch('https://mcp.onepage.io/', { method: 'POST' });

    expect(ctx.helpers.refreshOAuth2Token).toHaveBeenCalledTimes(1);
  });

  it('still falls back to the reactive renewal on 401', async () => {
    // No absolute expiry -> the proactive path stays out of the way entirely.
    const { ctx, fetchMock, authFetch } = setup(
      { ...token({ n8n_expires_at: undefined }) },
      { ...token({ access_token: 'renewed-token', n8n_expires_at: undefined }) },
    );
    fetchMock.mockImplementationOnce(async () => new Response('denied', { status: 401 }));

    await authFetch('https://mcp.onepage.io/', { method: 'POST' });

    expect(ctx.helpers.refreshOAuth2Token).toHaveBeenCalledTimes(1);
    expect(sentToken(fetchMock, 0)).toBe('Bearer access-token');
    expect(sentToken(fetchMock, 1)).toBe('Bearer renewed-token');
  });

  it('reports an auth error when both renewals fail', async () => {
    const { ctx, fetchMock, authFetch } = setup({
      ...token({ n8n_expires_at: String(Date.now() + 30_000) }),
    });
    ctx.helpers.refreshOAuth2Token.mockRejectedValue(new Error('refresh token revoked'));
    fetchMock.mockImplementation(async () => new Response('denied', { status: 401 }));

    await expect(authFetch('https://mcp.onepage.io/', { method: 'POST' })).rejects.toBeInstanceOf(
      OnepageAuthError,
    );
    expect(ctx.logger.error).toHaveBeenCalled();
  });
});
