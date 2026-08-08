import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiClient } from './api-client.js';
import { DesktopError } from './errors.js';
import type { TokenVault } from './token-vault.js';

const authPayload = (accessToken: string) => ({
  accessToken,
  refreshToken: 'r'.repeat(64),
  account: {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'user' as const,
    email: 'player@example.com',
    revenueCatAppUserId: 'counterpick-player',
    quota: {
      plan: 'free' as const,
      remaining: 3,
      limit: 3,
      nextRefillAt: null,
      planExpiresAt: null,
    },
  },
});

describe('ApiClient secondary authorization', () => {
  it('refreshes access once but preserves the global session after a repeated live-capability 401', async () => {
    let clears = 0;
    let refreshes = 0;
    let revisions = 0;
    const tokenVault = {
      read: async () => 'r'.repeat(64),
      write: async () => undefined,
      clear: async () => {
        clears += 1;
      },
    } as unknown as TokenVault;
    const api = new ApiClient('https://api.example.test/v1', tokenVault);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      if (url.pathname.endsWith('/auth/refresh')) {
        refreshes += 1;
        return Response.json(authPayload(`access-${refreshes}`));
      }
      if (url.pathname.includes('/analyses/overwolf/')) {
        revisions += 1;
        return Response.json({
          error: {
            code: 'TOKEN_INVALID',
            message: 'The Overwolf live session is invalid or expired',
          },
        }, { status: 401 });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    try {
      const session = await api.bootstrap();
      assert.equal(session.authenticated, true);
      await assert.rejects(
        () => api.reviseOverwolf(
          '00000000-0000-4000-8000-000000000010',
          {
            position: 3,
            allyHeroIds: [1],
            enemyHeroIds: [14, 26],
            bannedHeroIds: [],
            rank: null,
          },
          'revision-idempotency-key',
          'l'.repeat(64),
        ),
        (error: unknown) => (
          error instanceof DesktopError
          && error.code === 'OVERWOLF_LIVE_SESSION_INVALID'
          && error.status === 401
        ),
      );

      assert.equal(refreshes, 2);
      assert.equal(revisions, 2);
      assert.equal(clears, 0);
      assert.equal(api.isAuthenticated(), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps the account session when a Draft Vision capability expires', async () => {
    let clears = 0;
    let refreshes = 0;
    let revisions = 0;
    const tokenVault = {
      read: async () => 'r'.repeat(64),
      write: async () => undefined,
      clear: async () => {
        clears += 1;
      },
    } as unknown as TokenVault;
    const api = new ApiClient('https://api.example.test/v1', tokenVault);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      if (url.pathname.endsWith('/auth/refresh')) {
        refreshes += 1;
        return Response.json(authPayload(`access-${refreshes}`));
      }
      if (url.pathname.includes('/analyses/desktop/')) {
        revisions += 1;
        return Response.json({
          error: {
            code: 'TOKEN_INVALID',
            message: 'The live analysis session is invalid or expired',
          },
        }, { status: 401 });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    try {
      const session = await api.bootstrap();
      assert.equal(session.authenticated, true);
      await assert.rejects(
        () => api.reviseDesktop(
          '00000000-0000-4000-8000-000000000010',
          Buffer.from('frame'),
          3,
          null,
          '00000000-0000-4000-8000-000000000011',
          2,
          'desktop-revision-key',
          false,
          null,
          null,
          'l'.repeat(64),
        ),
        (error: unknown) => (
          error instanceof DesktopError
          && error.code === 'DESKTOP_LIVE_SESSION_INVALID'
          && error.status === 401
        ),
      );

      assert.equal(refreshes, 2);
      assert.equal(revisions, 2);
      assert.equal(clears, 0);
      assert.equal(api.isAuthenticated(), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
