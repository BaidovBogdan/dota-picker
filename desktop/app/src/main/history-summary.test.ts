import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiClient } from './api-client.js';
import type { TokenVault } from './token-vault.js';

const authPayload = {
  accessToken: 'access-token',
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
};

describe('ApiClient history summaries', () => {
  it('requests the compact representation and normalizes nullable hero media', async () => {
    const tokenVault = {
      read: async () => 'r'.repeat(64),
      write: async () => undefined,
      clear: async () => undefined,
    } as unknown as TokenVault;
    const api = new ApiClient('https://api.example.test/v1', tokenVault);
    const originalFetch = globalThis.fetch;
    const historyUrls: URL[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      if (url.pathname.endsWith('/auth/refresh')) return Response.json(authPayload);
      if (url.pathname.endsWith('/analyses/history')) {
        historyUrls.push(url);
        return Response.json({
          view: 'summary',
          items: [{
            id: '00000000-0000-4000-8000-000000000010',
            source: 'manual',
            input: null,
            result: {
              patch: '7.41',
              recommendations: [{
                hero: {
                  id: 1,
                  name: 'npc_dota_hero_antimage',
                  localizedName: 'Anti-Mage',
                  imageUrl: null,
                  iconUrl: null,
                  roles: ['Carry'],
                },
                score: 72.5,
                confidence: 'high',
              }],
            },
            createdAt: '2026-08-10T12:00:00.000Z',
          }, {
            id: '00000000-0000-4000-8000-000000000011',
            source: 'photo',
            input: {
              position: null,
              rank: null,
              enemyHeroIds: [],
            },
            result: null,
            createdAt: '2026-08-10T11:00:00.000Z',
          }],
          nextCursor: null,
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    try {
      await api.bootstrap();
      const page = await api.history({ cursor: 'next-page', limit: 6 });

      assert.equal(historyUrls[0]?.searchParams.get('view'), 'summary');
      assert.equal(historyUrls[0]?.searchParams.get('cursor'), 'next-page');
      assert.equal(historyUrls[0]?.searchParams.get('limit'), '6');
      assert.equal(page.view, 'summary');
      assert.equal(page.items[0]?.input, null);
      assert.equal(page.items[1]?.result, null);
      assert.equal(page.items[0]?.result?.recommendations[0]?.hero.imageUrl, undefined);
      assert.equal(page.items[0]?.result?.recommendations[0]?.hero.iconUrl, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
