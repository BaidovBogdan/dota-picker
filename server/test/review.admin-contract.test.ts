import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import type { Database } from '../src/db/client.js';
import { reviewRoutes } from '../src/modules/reviews/review.routes.js';
import type { ReviewService } from '../src/modules/reviews/review.service.js';
import { adminApiCachePlugin } from '../src/plugins/admin-api-cache.js';
import { authPlugin } from '../src/plugins/auth.js';
import { errorPlugin } from '../src/plugins/errors.js';

const adminKey = 'test-admin-key-that-is-longer-than-32-characters';
const accountId = '11111111-1111-4111-8111-111111111111';
const analysisId = '22222222-2222-4222-8222-222222222222';
const reviewId = '33333333-3333-4333-8333-333333333333';
const openApps: FastifyInstance[] = [];

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
  JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
  REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
  ADMIN_API_KEY: adminKey,
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

async function createApp() {
  const now = new Date().toISOString();
  const listForAdmin = vi.fn(async () => ({
    summary: {
      count: 1,
      averageRating: 5,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
    },
    items: [{
      id: reviewId,
      analysisId,
      rating: 5,
      selectedHeroIds: [1],
      comment: 'Полезный результат',
      createdAt: now,
      updatedAt: now,
      analysis: {
        source: 'manual' as const,
        patch: '7.41',
        recommendations: [1, 2, 3].map((id) => ({
          id,
          localizedName: `Hero ${id}`,
          imageUrl: `https://cdn.cloudflare.steamstatic.com/${id}.png`,
          iconUrl: `https://cdn.cloudflare.steamstatic.com/${id}-icon.png`,
        })),
        rawResult: null,
        dataQuality: { result: 'valid' as const, issues: [] },
      },
      account: {
        id: accountId,
        kind: 'user' as const,
        email: 'reviewer@example.com',
        plan: 'pro' as const,
      },
    }],
    pagination: { limit: 25, offset: 0, total: 1 },
  }));
  const reviewService = {
    listForAdmin,
    deleteForAdmin: vi.fn(),
  } as unknown as ReviewService;
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  openApps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(adminApiCachePlugin);
  await app.register(authPlugin, { config, db: {} as Database });
  await app.register(errorPlugin);
  await app.register(reviewRoutes({ reviewService }), { prefix: '/v1' });
  await app.ready();
  return { app, listForAdmin };
}

describe('admin review contract', () => {
  it('uses an exact account scope and returns real plan and hero assets', async () => {
    const { app, listForAdmin } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/reviews?accountId=${accountId}&rating=5&hasComment=true`,
      headers: { 'x-admin-key': adminKey },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: {
        id: string;
        account: { id: string; plan: string };
        analysis: { recommendations: { id: number; imageUrl: string }[] };
      }[];
    }>();
    expect(body.items[0]).toMatchObject({
      id: reviewId,
      account: { id: accountId, plan: 'pro' },
    });
    expect(body.items[0]?.analysis.recommendations).toHaveLength(3);
    expect(body.items[0]?.analysis.recommendations[0]).toMatchObject({
      id: 1,
      imageUrl: 'https://cdn.cloudflare.steamstatic.com/1.png',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(listForAdmin).toHaveBeenCalledWith({
      q: '',
      accountId,
      rating: 5,
      hasComment: 'true',
      limit: 25,
      offset: 0,
    });
  });

  it('rejects an invalid account scope before the service call', async () => {
    const { app, listForAdmin } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/reviews?accountId=not-a-uuid',
      headers: { 'x-admin-key': adminKey },
    });

    expect(response.statusCode).toBe(400);
    expect(listForAdmin).not.toHaveBeenCalled();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
  });

  it('does not apply admin cache policy to the account reviews route', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/account/reviews',
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBeUndefined();
    expect(response.headers.pragma).toBeUndefined();
  });
});
