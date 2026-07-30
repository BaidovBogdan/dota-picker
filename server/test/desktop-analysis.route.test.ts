import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config/env.js';
import { analysisRoutes } from '../src/modules/analysis/analysis.routes.js';
import type { AnalysisService } from '../src/modules/analysis/analysis.service.js';
import type { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import type {
  IdempotencyClaim,
  IdempotencyService,
} from '../src/modules/idempotency/idempotency.service.js';
import type { PhotoRecognizer } from '../src/modules/photo/photo-recognizer.js';
import type { QuotaService } from '../src/modules/quota/quota.service.js';
import { draftSchema } from '../src/modules/recommendation/recommendation.schemas.js';
import { errorPlugin } from '../src/plugins/errors.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const pngImage = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const pngHash = createHash('sha256').update(pngImage).digest('hex');
const quota = {
  plan: 'free' as const,
  remaining: 2,
  limit: 3,
  nextRefillAt: null,
  planExpiresAt: null,
};
const trustedRecognition = {
  quality: 'clear' as const,
  model: 'test-model',
  recognized: [
    {
      side: 'enemy' as const,
      slot: 0,
      heroId: 1,
      heroName: 'Anti-Mage',
      localizedName: 'Anti-Mage',
      confidence: 0.99,
      needsReview: false,
    },
    {
      side: 'enemy' as const,
      slot: 1,
      heroId: 5,
      heroName: 'Crystal Maiden',
      localizedName: 'Crystal Maiden',
      confidence: 0.99,
      needsReview: false,
    },
  ],
};
const recommendation = (id: number) => ({
  hero: {
    id,
    name: `hero_${id}`,
    localizedName: `Hero ${id}`,
    imageUrl: `https://cdn.example.com/${id}.png`,
    iconUrl: `https://cdn.example.com/${id}-icon.png`,
    roles: ['Carry'],
  },
  score: 75,
  confidence: 'high' as const,
  metrics: {
    roleFit: 0.8,
    counter: 0.7,
    meta: 0.6,
    synergy: 0.5,
  },
  reasons: ['strong_counter' as const],
});

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

function multipartImage() {
  const boundary = 'counterpick-test-boundary';
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n`
        + 'Content-Disposition: form-data; name="image"; filename="draft.png"\r\n'
        + 'Content-Type: image/png\r\n\r\n',
      ),
      pngImage,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

type IdempotencyFakeOptions = {
  failSessionCompletionOnce?: boolean;
  recognitionCount?: number;
};

function createIdempotencyFake(options: IdempotencyFakeOptions = {}) {
  type Record = {
    id: string;
    endpoint: string;
    key: string;
    leaseToken: string;
    resourceId: string | null;
    response?: globalThis.Record<string, unknown>;
  };
  const records = new Map<string, Record>();
  let sequence = 0;
  let failSessionCompletion = options.failSessionCompletionOnce ?? false;

  const claim = vi.fn(async (
    _accountId: string,
    endpoint: string,
    key: string,
    requestIdentity: unknown,
  ): Promise<IdempotencyClaim> => {
    void requestIdentity;
    const storageKey = `${endpoint}:${key}`;
    const existing = records.get(storageKey);
    if (existing?.response) {
      return { kind: 'completed', response: existing.response };
    }
    if (existing) {
      return {
        kind: 'acquired',
        id: existing.id,
        leaseToken: existing.leaseToken,
        resourceId: existing.resourceId,
      };
    }
    const record = {
      id: `claim-${sequence += 1}`,
      endpoint,
      key,
      leaseToken: `lease-${sequence}`,
      resourceId: null,
    };
    records.set(storageKey, record);
    return {
      kind: 'acquired',
      id: record.id,
      leaseToken: record.leaseToken,
      resourceId: record.resourceId,
    };
  });
  const complete = vi.fn(async (
    id: string,
    _leaseToken: string,
    response: globalThis.Record<string, unknown>,
  ) => {
    const record = [...records.values()].find((candidate) => candidate.id === id);
    if (
      record?.endpoint === 'analyses.desktop.session'
      && failSessionCompletion
    ) {
      failSessionCompletion = false;
      throw new Error('Simulated session completion failure');
    }
    if (record) record.response = response;
  });
  const abort = vi.fn(async (id: string) => {
    const entry = [...records.entries()].find(([, record]) => record.id === id);
    if (entry) records.delete(entry[0]);
  });
  const countActive = vi.fn(async () => options.recognitionCount ?? 0);
  const linkResource = (id: string, resourceId: string) => {
    const record = [...records.values()].find((candidate) => candidate.id === id);
    if (record) record.resourceId = resourceId;
  };

  return {
    service: {
      claim,
      complete,
      abort,
      countActive,
    } as unknown as IdempotencyService,
    claim,
    complete,
    abort,
    countActive,
    linkResource,
  };
}

type TestAppOptions = IdempotencyFakeOptions & {
  firstFrameWaiting?: boolean;
};

async function createTestApp(options: TestAppOptions = {}) {
  const idempotency = createIdempotencyFake(options);
  const recognize = vi
    .fn<PhotoRecognizer['recognize']>();
  if (options.firstFrameWaiting ?? true) {
    recognize.mockResolvedValueOnce({
      ...trustedRecognition,
      quality: 'partial',
      recognized: trustedRecognition.recognized.map((entry) => ({
        ...entry,
        needsReview: true,
      })),
    });
  }
  recognize.mockResolvedValue(trustedRecognition);
  let reserveCount = 0;
  const analysisId = '00000000-0000-4000-8000-000000000003';
  const analyze = vi.fn<AnalysisService['analyze']>(async (
    _accountId,
    draft,
    execution,
  ) => {
    if (execution.resourceId === null) reserveCount += 1;
    idempotency.linkResource(execution.idempotencyRecordId, analysisId);
    return {
      analysis: {
        id: analysisId,
        status: 'completed',
        source: 'photo',
        input: draftSchema.parse(draft),
        result: {
          patch: '7.41',
          metaFetchedAt: '2026-07-29T00:00:00.000Z',
          recommendations: [
            recommendation(2),
            recommendation(3),
            recommendation(4),
          ],
        },
        createdAt: '2026-07-29T00:00:00.000Z',
      },
      quota,
    };
  });
  const quotaGet = vi.fn(async () => quota);
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  openApps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('authenticate', async (request) => {
    request.user = {
      sub: accountId,
      kind: 'user',
      type: 'access',
      ver: 0,
    };
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, {
    limits: { files: 1, fields: 0, fileSize: 1024 },
  });
  await app.register(errorPlugin);
  await app.register(analysisRoutes({
    config: { maxImageBytes: 1024 } as AppConfig,
    analysisService: {
      analyze,
      history: vi.fn(),
      get: vi.fn(),
    } as unknown as AnalysisService,
    idempotencyService: idempotency.service,
    photoAdapter: { recognize },
    metaAdapter: {
      getHeroes: vi.fn(async () => []),
    } as unknown as OpenDotaAdapter,
    quotaService: {
      get: quotaGet,
    } as unknown as QuotaService,
  }), { prefix: '/v1/analyses' });
  await app.ready();
  return {
    app,
    idempotency,
    recognize,
    analyze,
    quotaGet,
    getReserveCount: () => reserveCount,
  };
}

describe('desktop analysis route', () => {
  it('waits without analysis, completes once, and replays the session result', async () => {
    const { app, idempotency, recognize, analyze, quotaGet } = await createTestApp();

    const request = async (revision: number) => {
      const image = multipartImage();
      return app.inject({
        method: 'POST',
        url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=${revision}`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': `desktop-frame-${revision}`,
        },
        payload: image.payload,
      });
    };

    const waiting = await request(0);
    expect(waiting.statusCode).toBe(200);
    expect(waiting.json()).toMatchObject({
      status: 'waiting',
      reason: 'image_unclear',
      revision: 0,
      quota,
    });
    expect(analyze).not.toHaveBeenCalled();

    const completed = await request(1);
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({
      status: 'completed',
      revision: 1,
      analysis: {
        source: 'photo',
        input: {
          source: 'photo',
          position: 2,
          allyHeroIds: [],
          enemyHeroIds: [1, 5],
          bannedHeroIds: [],
        },
      },
      quota,
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        source: 'photo',
        position: 2,
        enemyHeroIds: [1, 5],
        bannedHeroIds: [],
      }),
      {
        idempotencyRecordId: 'claim-4',
        leaseToken: 'lease-4',
        resourceId: null,
      },
    );

    const replayed = await request(2);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toEqual(completed.json());
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(quotaGet).toHaveBeenCalledTimes(2);
    expect(idempotency.abort).toHaveBeenCalledTimes(1);
    expect(idempotency.claim).toHaveBeenNthCalledWith(
      1,
      accountId,
      'analyses.desktop.frame',
      'desktop-frame-0',
      {
        sessionId,
        frameHash: pngHash,
        mimeType: 'image/png',
        position: 2,
        rank: null,
        revision: 0,
      },
    );
    expect(idempotency.claim).toHaveBeenNthCalledWith(
      2,
      accountId,
      'analyses.desktop.session',
      sessionId,
      {
        sessionId,
        position: 2,
        rank: null,
      },
    );
  });

  it('keeps a committed session recoverable when idempotency completion fails', async () => {
    const {
      app,
      idempotency,
      analyze,
      getReserveCount,
    } = await createTestApp({
      firstFrameWaiting: false,
      failSessionCompletionOnce: true,
    });
    const request = async (revision: number) => {
      const image = multipartImage();
      return app.inject({
        method: 'POST',
        url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=${revision}`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': `recovery-frame-${revision}`,
        },
        payload: image.payload,
      });
    };

    const failed = await request(0);
    expect(failed.statusCode).toBe(500);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(getReserveCount()).toBe(1);
    expect(idempotency.abort.mock.calls.map(([id]) => id)).toEqual(['claim-1']);

    const recovered = await request(1);
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toMatchObject({
      status: 'completed',
      analysis: { id: '00000000-0000-4000-8000-000000000003' },
    });
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(getReserveCount()).toBe(1);
    expect(analyze.mock.calls.at(1)?.[2].resourceId)
      .toBe('00000000-0000-4000-8000-000000000003');
    expect(idempotency.abort.mock.calls.map(([id]) => id)).toEqual(['claim-1']);
  });

  it('bounds waiting-frame recognition by the account quota limit', async () => {
    const {
      app,
      idempotency,
      recognize,
      analyze,
    } = await createTestApp({
      firstFrameWaiting: false,
      recognitionCount: 13,
    });
    const image = multipartImage();
    const response = await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=0`,
      headers: {
        'content-type': image.contentType,
        'idempotency-key': 'budget-frame-0',
      },
      payload: image.payload,
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: {
        code: 'RATE_LIMITED',
        details: { limit: 12 },
      },
    });
    expect(idempotency.countActive).toHaveBeenCalledWith(
      accountId,
      'analyses.desktop.frame',
    );
    expect(recognize).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
    expect(idempotency.abort.mock.calls.map(([id]) => id))
      .toEqual(['claim-2', 'claim-1']);
  });

  it('rejects a missing multipart content type without a server error', async () => {
    const { app, idempotency } = await createTestApp({
      firstFrameWaiting: false,
    });
    const response = await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=0`,
      headers: {
        'idempotency-key': 'missing-content-type',
      },
      payload: pngImage,
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
    expect(idempotency.claim).not.toHaveBeenCalled();
  });
});
