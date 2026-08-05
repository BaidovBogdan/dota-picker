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

async function createApp() {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  openApps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(rateLimit);
  await app.register(authPlugin, { config, db: {} as Database });
  await app.register(errorPlugin);
  const overview = vi.fn(async () => createOverview());
  const adminService = {
    overview,
    listUsers: vi.fn(),
    listAnalyses: vi.fn(),
    system: vi.fn(),
    grantProToAllFreeAccounts: vi.fn(),
  } as unknown as AdminService;
  await app.register(adminRoutes({ config, adminService }), { prefix: '/v1/admin' });
  await app.ready();
  return { app, overview };
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
  });
});
