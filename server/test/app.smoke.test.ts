import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
  vi.unstubAllGlobals();
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
    expect(document.paths).toHaveProperty('/v1/auth/otp/request');
    expect(document.paths).toHaveProperty('/v1/auth/otp/request-authenticated');
    expect(document.paths).toHaveProperty('/v1/auth/password/reset');
    expect(document.paths).toHaveProperty('/v1/auth/password/change');
    expect(document.paths).toHaveProperty('/v1/quota/reset');
    expect(document.paths).toHaveProperty('/v1/heroes/meta-positions');
    expect(document.paths).toHaveProperty('/v1/heroes/{heroId}/detail');
    expect(document.paths).toHaveProperty('/v1/analyses/desktop');
    expect(document.paths).toHaveProperty('/v1/analyses/{id}/review');
    expect(document.paths).toHaveProperty('/v1/account/reviews');
    expect(document.paths).toHaveProperty('/v1/account/reviews/{id}');
    expect(document.paths).toHaveProperty('/v1/admin/reviews');
    expect(document.paths).toHaveProperty('/v1/admin/reviews/{id}');
    expect(document.paths).not.toHaveProperty('/v1/v1/auth/guest');
  }, 20_000);

  it('does not expose quota reset in production', async () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
      JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
      REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
    });
    const app = buildApp(config);
    openApps.push(app);

    const openApi = await app.inject({ method: 'GET', url: '/docs/json' });
    const document = z.object({ paths: z.record(z.string(), z.unknown()) }).parse(openApi.json());

    expect(openApi.statusCode).toBe(200);
    expect(document.paths).not.toHaveProperty('/v1/quota/reset');
  }, 20_000);

  it('serves public hero catalog and position meta before authentication completes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      const payload = url.endsWith('/heroStats')
        ? [{
            id: 1,
            name: 'npc_dota_hero_antimage',
            localized_name: 'Anti-Mage',
            primary_attr: 'agi',
            attack_type: 'Melee',
            roles: ['Carry'],
            img: '/apps/dota2/images/dota_react/heroes/antimage.png',
            icon: '/apps/dota2/images/dota_react/heroes/icons/antimage.png',
            pub_pick: 100,
            pub_win: 51,
          }]
        : url.endsWith('/constants/patch')
          ? [{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]
          : url.includes('/explorer?sql=')
            ? {
                rows: [1, 2, 3, 4, 5].map((position) => ({
                  hero_id: 1,
                  position,
                  games: 20,
                  wins: 11,
                })),
              }
            : null;
      return new Response(JSON.stringify(payload), {
        status: payload === null ? 404 : 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
      JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
      REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
    });
    const app = buildApp(config);
    openApps.push(app);

    const catalog = await app.inject({ method: 'GET', url: '/v1/heroes' });
    const meta = await app.inject({ method: 'GET', url: '/v1/heroes/meta-positions' });

    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toMatchObject({ heroes: [{ id: 1 }], patch: '7.41' });
    expect(meta.statusCode).toBe(200);
    expect(meta.json()).toMatchObject({
      heroes: [{ id: 1 }],
      availability: 'ready',
      positionStats: [
        { heroId: 1, position: 1 },
        { heroId: 1, position: 2 },
        { heroId: 1, position: 3 },
        { heroId: 1, position: 4 },
        { heroId: 1, position: 5 },
      ],
    });
  }, 20_000);
});
