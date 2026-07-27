import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { otpCodeSchema } from '../src/modules/auth/auth.schemas.js';

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('OTP API contract', () => {
  it('accepts exactly four decimal digits', () => {
    expect(otpCodeSchema.safeParse('1234').success).toBe(true);

    for (const invalidCode of ['123', '12345', '12345678', '12a4']) {
      expect(otpCodeSchema.safeParse(invalidCode).success).toBe(false);
    }
  });

  it('publishes the four-digit code constraint for every verification endpoint', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
      JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
      REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
    });
    const app = buildApp(config);
    openApps.push(app);

    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    const document = z.object({
      paths: z.record(z.string(), z.unknown()),
    }).parse(response.json());
    const operationSchema = z.object({
      post: z.object({
        requestBody: z.object({
          content: z.object({
            'application/json': z.object({
              schema: z.object({
                properties: z.object({
                  code: z.object({
                    pattern: z.string(),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    expect(response.statusCode).toBe(200);

    for (const path of [
      '/v1/auth/register',
      '/v1/auth/login',
      '/v1/auth/upgrade-guest',
      '/v1/auth/password/reset',
      '/v1/auth/password/change',
    ]) {
      const operation = operationSchema.parse(document.paths[path]);
      expect(operation.post.requestBody.content['application/json'].schema.properties.code.pattern)
        .toBe('^\\d{4}$');
    }
  }, 20_000);
});
