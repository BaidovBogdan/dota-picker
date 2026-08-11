import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import { healthRoutes } from '../src/routes/health.routes.js';

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

async function createApp(isApplicationReady: () => Promise<boolean>) {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  openApps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const db = { execute: vi.fn(async () => []) } as unknown as Database;
  await app.register(healthRoutes(db, isApplicationReady));
  return { app, db };
}

describe('health readiness', () => {
  it('keeps a new deployment unavailable until draft data is ready', async () => {
    const isApplicationReady = vi.fn(async () => false);
    const { app, db } = await createApp(isApplicationReady);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready' });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(isApplicationReady).toHaveBeenCalledOnce();
  });

  it('reports ready after both database and draft data checks pass', async () => {
    const { app } = await createApp(async () => true);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });
});
