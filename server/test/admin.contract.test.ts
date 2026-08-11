import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import type { Database } from '../src/db/client.js';
import { adminRoutes } from '../src/modules/admin/admin.routes.js';
import type { AdminService } from '../src/modules/admin/admin.service.js';
import { authPlugin } from '../src/plugins/auth.js';
import { adminApiCachePlugin } from '../src/plugins/admin-api-cache.js';
import { errorPlugin } from '../src/plugins/errors.js';

const adminKey = 'test-admin-key-that-is-longer-than-32-characters';
const openApps: FastifyInstance[] = [];

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
  JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
  REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
  ADMIN_API_KEY: adminKey,
});

function createOverview() {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    range: { days: 30 as const, from: now, to: now },
    totals: {
      users: 0,
      registered: 0,
      guests: 0,
      pro: 0,
      analyses: 0,
      completed: 0,
      failed: 0,
      processing: 0,
      reviews: 0,
    },
    daily: [],
    recentActivity: [],
  };
}

function createMeta() {
  return {
    heroes: [],
    patch: '7.39e',
    rank: null,
    rankFilter: 'all_ranks' as const,
    window: 'current_patch_30d' as const,
    minimumGames: 25,
    fetchedAt: new Date().toISOString(),
    isStale: false,
    availability: 'collecting' as const,
    positionStats: [],
  };
}

async function createApp() {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  openApps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(rateLimit);
  await app.register(authPlugin, { config, db: {} as Database });
  await app.register(errorPlugin);
  const overview = vi.fn(async () => createOverview());
  const meta = vi.fn(async () => createMeta());
  const listAnalyses = vi.fn<AdminService['listAnalyses']>(async () => ({
    items: [],
    pagination: { limit: 50, offset: 0, total: 0, nextCursor: null },
  }));
  const getAnalysis = vi.fn<AdminService['getAnalysis']>();
  const listUsers = vi.fn<AdminService['listUsers']>(async () => ({
    items: [],
    pagination: { limit: 50, offset: 0, total: 0, nextCursor: null },
  }));
  const adminService = {
    overview,
    meta,
    listUsers,
    listAnalyses,
    getAnalysis,
    system: vi.fn(),
    grantProToAllFreeAccounts: vi.fn(),
  } as unknown as AdminService;
  await app.register(adminApiCachePlugin);
  await app.register(adminRoutes({ config, adminService }), { prefix: '/v1/admin' });
  await app.ready();
  return { app, getAnalysis, listAnalyses, listUsers, meta, overview };
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('admin API authentication', () => {
  it('exchanges the configured key for a short-lived admin session', async () => {
    const { app } = await createApp();
    const before = Date.now();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/session',
      payload: { key: adminKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ token: string; expiresAt: string }>();
    expect(body.token.split('.')).toHaveLength(3);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 14 * 60 * 1_000);
    expect(body).not.toHaveProperty('key');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });

  it('prevents browser caches from retaining admin user and analysis data', async () => {
    const { app } = await createApp();
    const headers = { 'x-admin-key': adminKey };
    const [users, analyses] = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/admin/users', headers }),
      app.inject({ method: 'GET', url: '/v1/admin/analyses', headers }),
    ]);

    expect(users.statusCode).toBe(200);
    expect(analyses.statusCode).toBe(200);
    for (const response of [users, analyses]) {
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.pragma).toBe('no-cache');
    }
  });

  it('accepts an admin session and the legacy header, but rejects user access tokens', async () => {
    const { app, overview } = await createApp();
    const session = await app.inject({
      method: 'POST',
      url: '/v1/admin/session',
      payload: { key: adminKey },
    });
    const token = session.json<{ token: string }>().token;

    const bearer = await app.inject({
      method: 'GET',
      url: '/v1/admin/overview',
      headers: { authorization: `Bearer ${token}` },
    });
    const legacy = await app.inject({
      method: 'GET',
      url: '/v1/admin/overview',
      headers: { 'x-admin-key': adminKey },
    });
    const userToken = app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      kind: 'user',
      type: 'access',
      ver: 0,
    });
    const user = await app.inject({
      method: 'GET',
      url: '/v1/admin/overview',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(bearer.statusCode).toBe(200);
    expect(legacy.statusCode).toBe(200);
    expect(user.statusCode).toBe(401);
    expect(user.headers['cache-control']).toBe('no-store');
    expect(user.headers.pragma).toBe('no-cache');
    expect(overview).toHaveBeenCalledTimes(2);
  });

  it('does not issue a session for an invalid key', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/session',
      payload: { key: 'wrong-admin-key' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'ADMIN_AUTH_REQUIRED' } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });

  it('serves the authenticated meta contract and validates rank filters', async () => {
    const { app, meta } = await createApp();
    const session = await app.inject({
      method: 'POST',
      url: '/v1/admin/session',
      payload: { key: adminKey },
    });
    const token = session.json<{ token: string }>().token;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/meta?rank=7',
      headers: { authorization: `Bearer ${token}` },
    });
    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/admin/meta?rank=9',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ patch: '7.39e', rankFilter: 'all_ranks' });
    expect(meta).toHaveBeenCalledWith({ rank: 7 });
    expect(invalid.statusCode).toBe(400);
  });

  it('parses exact analysis-history filters and serves compact table rows', async () => {
    const { app, listAnalyses } = await createApp();
    const analysisId = '11111111-1111-4111-8111-111111111111';
    const accountId = '22222222-2222-4222-8222-222222222222';
    const now = new Date().toISOString();
    listAnalyses.mockResolvedValueOnce({
      items: [{
        id: analysisId,
        accountId,
        account: { id: accountId, kind: 'user', email: 'admin-test@example.com' },
        status: 'completed',
        source: 'photo',
        recommendationHeroIds: [3, 4, 5],
        hasResult: true,
        patch: '7.41',
        errorCode: null,
        revision: 2,
        durationMs: 140,
        durationKind: 'session_to_latest_revision' as const,
        quotaEvents: [{
          id: '33333333-3333-4333-8333-333333333333',
          delta: -1,
          reason: 'analysis',
          createdAt: now,
        }],
        sourceImage: {
          stored: false as const,
          status: 'not_stored' as const,
          detail: 'Исходное изображение не сохраняется.',
        },
        createdAt: now,
        updatedAt: now,
      }],
      pagination: { limit: 50, offset: 0, total: 1, nextCursor: null },
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/analyses?id=${analysisId}&accountId=${accountId}`,
      headers: { 'x-admin-key': adminKey },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{
        id: analysisId,
        revision: 2,
        recommendationHeroIds: [3, 4, 5],
        hasResult: true,
      }],
    });
    expect(response.json<{ items: unknown[] }>().items[0]).not.toHaveProperty('quotaEvents');
    expect(listAnalyses).toHaveBeenCalledWith(expect.objectContaining({
      id: analysisId,
      accountId,
      limit: 50,
      offset: 0,
    }));
  });

  it('serializes legacy JSON payloads only on the detail endpoint', async () => {
    const { app, getAnalysis } = await createApp();
    const now = new Date().toISOString();
    const accountId = '22222222-2222-4222-8222-222222222222';
    const legacyItem = (
      id: string,
      rawInput: null | boolean | number | string | (number | string)[],
      rawResult: null | boolean | number | string | (number | string)[],
    ) => ({
      id,
      accountId,
      account: { id: accountId, kind: 'user' as const, email: 'legacy@example.com' },
      status: 'completed' as const,
      source: 'manual' as const,
      input: null,
      result: null,
      rawInput,
      rawResult,
      dataQuality: {
        input: 'legacy_invalid' as const,
        result: 'legacy_invalid' as const,
        issues: ['Stored payload does not match the current schema'],
      },
      patch: null,
      errorCode: null,
      revision: 0,
      durationMs: 25,
      durationKind: 'initial_terminal_state' as const,
      quotaEvents: [],
      sourceImage: {
        stored: false as const,
        status: 'not_applicable' as const,
        detail: 'Ручной ввод не содержит исходного изображения.',
      },
      createdAt: now,
      updatedAt: now,
    });
    getAnalysis.mockResolvedValueOnce(
      legacyItem('11111111-1111-4111-8111-111111111111', [1, 'legacy'], false),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/analyses/11111111-1111-4111-8111-111111111111',
      headers: { 'x-admin-key': adminKey },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analysis: { rawInput: [1, 'legacy'], rawResult: false },
    });
    expect(getAnalysis).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });
});
