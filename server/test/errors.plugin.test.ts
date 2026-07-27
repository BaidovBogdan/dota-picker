import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { errorPlugin } from '../src/plugins/errors.js';

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('errorPlugin', () => {
  it('preserves rate-limit responses instead of converting them to 500', async () => {
    const app = Fastify({ logger: false });
    openApps.push(app);
    await app.register(errorPlugin);
    app.get('/limited', async () => {
      throw Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 });
    });

    const response = await app.inject({ method: 'GET', url: '/limited' });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests; retry shortly',
      },
    });
  });
});
