import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnosticsRoutes } from '../src/modules/diagnostics/diagnostics.routes.js';
import { diagnosticsConsentVersion } from '../src/modules/diagnostics/diagnostics.schemas.js';
import type { DiagnosticsService } from '../src/modules/diagnostics/diagnostics.service.js';
import { errorPlugin } from '../src/plugins/errors.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

function payload() {
  return {
    session: {
      id: sessionId,
      platform: 'win32',
      appVersion: '0.1.12',
      appBuild: '0.1.12+test',
      mode: 'vision',
      startedAt: '2026-08-09T10:00:00.000Z',
      consentVersion: diagnosticsConsentVersion,
    },
    events: [{
      id: eventId,
      sequence: 1,
      type: 'app_started',
      status: 'info',
      stage: 'app',
      createdAt: '2026-08-09T10:00:00.000Z',
      durationMs: null,
      details: { consentVersion: diagnosticsConsentVersion },
    }],
  };
}

async function createApp() {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  openApps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(rateLimit);
  app.decorate('authenticate', async (request) => {
    if (request.headers.authorization !== 'Bearer user-token') throw new Error('unauthorized');
    request.user = { sub: accountId, kind: 'user', type: 'access', ver: 0 };
  });
  app.decorate('authenticateAdmin', async (request) => {
    if (request.headers['x-admin-key'] !== 'admin-token') throw new Error('unauthorized');
  });
  await app.register(errorPlugin);
  const ingest = vi.fn(async () => ({
    accepted: 1,
    duplicate: 0,
    retainedUntil: '2026-09-08T10:00:00.000Z',
  }));
  const list = vi.fn(async () => ({
    items: [],
    pagination: { limit: 50, offset: 0, total: 0 },
    summary: { sessions: 0, events: 0, errors: 0 },
  }));
  const detail = vi.fn(async () => ({
    session: {
      id: sessionId,
      accountId,
      app: { platform: 'win32' as const, version: '0.1.12', build: 'test' },
      mode: 'vision' as const,
      status: 'active' as const,
      startedAt: '2026-08-09T10:00:00.000Z',
      endedAt: null,
      durationMs: null,
      eventCount: 1,
      errorCount: 0,
      lastEventAt: '2026-08-09T10:00:00.000Z',
    },
    events: [],
    pagination: { limit: 500, total: 1, nextBeforeSequence: null },
  }));
  await app.register(diagnosticsRoutes({
    diagnosticsService: { ingest, list, detail } as unknown as DiagnosticsService,
  }), { prefix: '/v1' });
  await app.ready();
  return { app, ingest, list, detail };
}

describe('diagnostics routes', () => {
  it('binds ingestion to the authenticated account', async () => {
    const { app, ingest } = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/diagnostics/events',
      headers: { authorization: 'Bearer user-token' },
      payload: payload(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accepted: 1, duplicate: 0 });
    expect(ingest).toHaveBeenCalledWith(accountId, payload());
  });

  it('rejects extra privacy-sensitive fields before the service', async () => {
    const { app, ingest } = await createApp();
    const input = payload();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/diagnostics/events',
      headers: { authorization: 'Bearer user-token' },
      payload: {
        ...input,
        events: [{ ...input.events[0], screenshot: 'image-bytes' }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('enforces the endpoint body and authenticated-account rate limits', async () => {
    const { app, ingest } = await createApp();
    const oversized = await app.inject({
      method: 'POST',
      url: '/v1/diagnostics/events',
      headers: { authorization: 'Bearer user-token' },
      payload: { ...payload(), padding: 'x'.repeat(129 * 1024) },
    });
    expect(oversized.statusCode).toBe(413);

    const responses = await Promise.all(Array.from({ length: 21 }, () => app.inject({
      method: 'POST',
      url: '/v1/diagnostics/events',
      headers: { authorization: 'Bearer user-token' },
      payload: payload(),
    })));
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(20);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(1);
    expect(ingest).toHaveBeenCalledTimes(20);
  });

  it('serves admin list and detail only through admin authentication', async () => {
    const { app, list, detail } = await createApp();
    const headers = { 'x-admin-key': 'admin-token' };
    const listResponse = await app.inject({
      method: 'GET',
      url: '/v1/admin/diagnostics/sessions?limit=25&mode=vision&hasErrors=false',
      headers,
    });
    const detailResponse = await app.inject({
      method: 'GET',
      url: `/v1/admin/diagnostics/sessions/${sessionId}`,
      headers,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(detailResponse.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      limit: 25,
      offset: 0,
      mode: 'vision',
      hasErrors: false,
    }));
    expect(detail).toHaveBeenCalledWith(sessionId, { limit: 100 });
  });

  it('parses a stable keyset cursor for older diagnostic events', async () => {
    const { app, detail } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/diagnostics/sessions/${sessionId}?limit=250&beforeSequence=42`,
      headers: { 'x-admin-key': 'admin-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(detail).toHaveBeenCalledWith(sessionId, { limit: 250, beforeSequence: 42 });
  });
});
