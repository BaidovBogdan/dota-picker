import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('application composition', () => {
  it('registers health and versioned API routes without opening a port', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
      JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
      REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
    });
    const app = buildApp(config);
    openApps.push(app);

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const protectedRoute = await app.inject({ method: 'GET', url: '/v1/quota' });
    const openApi = await app.inject({ method: 'GET', url: '/docs/json' });
    const document = z.object({ paths: z.record(z.string(), z.unknown()) }).parse(openApi.json());

    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });
    expect(protectedRoute.statusCode).toBe(401);
    expect(openApi.statusCode).toBe(200);
    expect(document.paths).toHaveProperty('/v1/auth/guest');
    expect(document.paths).not.toHaveProperty('/v1/v1/auth/guest');
  }, 20_000);
});
