import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
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
import {
  desktopAnalysisResponseSchema,
  overwolfAnalysisResponseSchema,
} from '../src/modules/analysis/analysis.schemas.js';
import type { AnalysisService } from '../src/modules/analysis/analysis.service.js';
import type { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import type {
  IdempotencyClaim,
  IdempotencyService,
} from '../src/modules/idempotency/idempotency.service.js';
import type { PhotoRecognizer } from '../src/modules/photo/photo-recognizer.js';
import type { QuotaService } from '../src/modules/quota/quota.service.js';
import { draftSchema } from '../src/modules/recommendation/recommendation.schemas.js';
import { AppError, ConflictError } from '../src/lib/errors.js';
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
const parseOverwolfResponse = (response: { json(): unknown }) =>
  overwolfAnalysisResponseSchema.parse(response.json());
const parseDesktopResponse = (response: { json(): unknown }) =>
  desktopAnalysisResponseSchema.parse(response.json());
type RecognitionResult = Awaited<ReturnType<PhotoRecognizer['recognize']>>;
const trustedRecognition = {
  quality: 'clear' as const,
  detectedPosition: null,
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
const recognitionForEnemies = (heroIds: number[]): RecognitionResult => ({
  ...trustedRecognition,
  recognized: heroIds.map((heroId, slot) => ({
    side: 'enemy' as const,
    slot,
    heroId,
    heroName: `hero_${heroId}`,
    localizedName: `Hero ${heroId}`,
    confidence: 0.99,
    needsReview: false,
  })),
});
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
  failOverwolfCompletionOnce?: boolean;
  recognitionCount?: number;
  recognitionCounts?: number[];
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
  let failOverwolfCompletion = options.failOverwolfCompletionOnce ?? false;

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
    if (
      record?.endpoint === 'analyses.overwolf.revision'
      && failOverwolfCompletion
    ) {
      failOverwolfCompletion = false;
      throw new Error('Simulated Overwolf completion failure');
    }
    if (record) record.response = response;
  });
  const abort = vi.fn(async (id: string) => {
    const entry = [...records.entries()].find(([, record]) => record.id === id);
    if (entry) records.delete(entry[0]);
  });
  const recognitionCounts = [...(options.recognitionCounts ?? [])];
  const countActive = vi.fn(async () => (
    recognitionCounts.shift() ?? options.recognitionCount ?? 0
  ));
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
  detectedPosition?: 1 | 2 | 3 | 4 | 5 | null;
  recoveredAnalysisPosition?: 1 | 2 | 3 | 4 | 5;
  varyAccountPerRequest?: boolean;
};

async function createTestApp(options: TestAppOptions = {}) {
  const idempotency = createIdempotencyFake(options);
  const recognitionResult = {
    ...trustedRecognition,
    detectedPosition: options.detectedPosition ?? null,
  };
  const recognize = vi
    .fn<PhotoRecognizer['recognize']>();
  if (options.firstFrameWaiting ?? true) {
    recognize.mockResolvedValueOnce({
      ...recognitionResult,
      quality: 'partial',
      recognized: recognitionResult.recognized.map((entry) => ({
        ...entry,
        needsReview: true,
      })),
    });
  }
  recognize.mockResolvedValue(recognitionResult);
  let reserveCount = 0;
  let currentOverwolfRevision = 0;
  let currentDesktopRevision = 0;
  let currentDesktopDraft = draftSchema.parse({
    source: 'photo',
    position: 2,
    allyHeroIds: [],
    enemyHeroIds: [1, 5],
    bannedHeroIds: [],
  });
  const analysisId = '00000000-0000-4000-8000-000000000003';
  const analyze = vi.fn<AnalysisService['analyze']>(async (
    _accountId,
    draft,
    execution,
    buildResponse,
    additionalExecutions,
  ) => {
    if (draft.source === 'overwolf') currentOverwolfRevision = 0;
    if (draft.source === 'photo') {
      currentDesktopRevision = 0;
      currentDesktopDraft = draftSchema.parse(draft);
    }
    if (execution.resourceId === null) reserveCount += 1;
    idempotency.linkResource(execution.idempotencyRecordId, analysisId);
    const analysisDraft = execution.resourceId && options.recoveredAnalysisPosition
      ? { ...draft, position: options.recoveredAnalysisPosition }
      : draft;
    const base = {
      analysis: {
        id: analysisId,
        status: 'completed' as const,
        source: draft.source,
        input: draftSchema.parse(analysisDraft),
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
    const response = buildResponse ? buildResponse(base) : base;
    await idempotency.service.complete(
      execution.idempotencyRecordId,
      execution.leaseToken,
      response,
    );
    for (const additionalExecution of additionalExecutions ?? []) {
      idempotency.linkResource(additionalExecution.idempotencyRecordId, analysisId);
      await idempotency.service.complete(
        additionalExecution.idempotencyRecordId,
        additionalExecution.leaseToken,
        response,
      );
    }
    return response as never;
  });
  const reviseOverwolf = vi.fn<AnalysisService['reviseOverwolf']>(async (
    _accountId,
    requestedAnalysisId,
    expectedRevision,
    draft,
    execution,
    buildResponse,
  ) => {
    const recovering = expectedRevision + 1 === currentOverwolfRevision
      && execution.resourceId === requestedAnalysisId;
    if (expectedRevision !== currentOverwolfRevision && !recovering) {
      throw new ConflictError('REQUEST_IN_PROGRESS', 'Stale capability');
    }
    if (!recovering) currentOverwolfRevision += 1;
    idempotency.linkResource(execution.idempotencyRecordId, requestedAnalysisId);
    const base = {
      analysis: {
        id: requestedAnalysisId,
        status: 'completed' as const,
        source: 'overwolf' as const,
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
      revision: currentOverwolfRevision,
    };
    const response = buildResponse ? buildResponse(base) : base;
    await idempotency.service.complete(
      execution.idempotencyRecordId,
      execution.leaseToken,
      response,
    );
    return response as never;
  });
  const reviseDesktop = vi.fn<AnalysisService['reviseDesktop']>(async (
    _accountId,
    requestedAnalysisId,
    expectedRevision,
    nextDraft,
    execution,
    maximumRevisions,
    buildResponse,
  ) => {
    const recovering = expectedRevision + 1 === currentDesktopRevision
      && execution.resourceId === requestedAnalysisId;
    if (expectedRevision !== currentDesktopRevision && !recovering) {
      throw new ConflictError('REQUEST_IN_PROGRESS', 'Stale capability');
    }
    const normalizedDraft = nextDraft === null ? null : draftSchema.parse(nextDraft);
    const canonical = (value: typeof currentDesktopDraft) => JSON.stringify({
      ...value,
      allyHeroIds: [...value.allyHeroIds].sort((left, right) => left - right),
      enemyHeroIds: [...value.enemyHeroIds].sort((left, right) => left - right),
      bannedHeroIds: [...value.bannedHeroIds].sort((left, right) => left - right),
    });
    const changed = recovering || (
      normalizedDraft !== null
      && canonical(normalizedDraft) !== canonical(currentDesktopDraft)
    );
    if (changed && !recovering) {
      if (normalizedDraft === null) throw new Error('Changed desktop draft is unavailable');
      if (expectedRevision >= maximumRevisions) {
        throw new AppError(429, 'RATE_LIMITED', 'Desktop live revision limit reached');
      }
      currentDesktopRevision += 1;
      currentDesktopDraft = normalizedDraft;
      idempotency.linkResource(execution.idempotencyRecordId, requestedAnalysisId);
    }
    const base = {
      analysis: {
        id: requestedAnalysisId,
        status: 'completed' as const,
        source: 'photo' as const,
        input: currentDesktopDraft,
        result: {
          patch: '7.41',
          metaFetchedAt: '2026-07-29T00:00:00.000Z',
          recommendations: [recommendation(2), recommendation(3), recommendation(4)],
        },
        createdAt: '2026-07-29T00:00:00.000Z',
      },
      quota,
      revision: currentDesktopRevision,
      changed,
    };
    const response = buildResponse ? buildResponse(base) : base;
    await idempotency.service.complete(
      execution.idempotencyRecordId,
      execution.leaseToken,
      response,
    );
    return response as never;
  });
  const quotaGet = vi.fn(async () => quota);
  let accountSequence = 0;
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  openApps.push(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('authenticate', async (request) => {
    request.user = {
      sub: options.varyAccountPerRequest
        ? `account-${accountSequence += 1}`
        : accountId,
      kind: 'user',
      type: 'access',
      ver: 0,
    };
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: 'test-jwt-secret-that-is-longer-than-32-characters',
  });
  await app.register(multipart, {
    limits: { files: 1, fields: 0, fileSize: 1024 },
  });
  await app.register(errorPlugin);
  await app.register(analysisRoutes({
    config: { maxImageBytes: 1024 } as AppConfig,
    analysisService: {
      analyze,
      reviseOverwolf,
      reviseDesktop,
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
    reviseOverwolf,
    reviseDesktop,
    quotaGet,
    getReserveCount: () => reserveCount,
  };
}

describe('Mobile draft analysis route', () => {
  const request = (app: FastifyInstance, source: 'manual' | 'photo' | 'overwolf') => app.inject({
    method: 'POST',
    url: '/v1/analyses/manual',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `mobile-${source}-draft`,
    },
    payload: {
      source,
      position: 1,
      allyHeroIds: [14, 26],
      enemyHeroIds: [50, 88],
      bannedHeroIds: [],
    },
  });

  it('accepts a reviewed photo draft and preserves its source', async () => {
    const { app, analyze } = await createTestApp();

    const response = await request(app, 'photo');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analysis: {
        source: 'photo',
        input: {
          source: 'photo',
          position: 1,
          allyHeroIds: [14, 26],
          enemyHeroIds: [50, 88],
        },
      },
    });
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('keeps Overwolf drafts on the capability-protected route', async () => {
    const { app, analyze } = await createTestApp();

    const response = await request(app, 'overwolf');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe('Overwolf live analysis route', () => {
  const analysisId = '00000000-0000-4000-8000-000000000003';
  const revisionDraft = {
    source: 'overwolf' as const,
    position: 3 as const,
    allyHeroIds: [1],
    enemyHeroIds: [5, 14, 26],
    bannedHeroIds: [75],
  };
  const start = async (app: FastifyInstance, key: string) => app.inject({
    method: 'POST',
    url: '/v1/analyses/overwolf',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    payload: { ...revisionDraft, enemyHeroIds: [5, 14] },
  });

  it('chains scoped capabilities, replays one key and rejects stale-token recompute', async () => {
    const { app, idempotency, reviseOverwolf } = await createTestApp();
    const started = await start(app, 'overwolf-session-start');
    expect(started.statusCode).toBe(200);
    const initialSession = parseOverwolfResponse(started).liveSession;
    expect(initialSession.revision).toBe(0);
    const request = (key: string) => app.inject({
      method: 'PUT',
      url: `/v1/analyses/overwolf/${analysisId}`,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        'x-live-session-token': initialSession.token,
      },
      payload: revisionDraft,
    });

    const first = await request('overwolf-revision-1');
    const replayed = await request('overwolf-revision-1');

    expect(first.statusCode).toBe(200);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toEqual(first.json());
    expect(parseOverwolfResponse(first).liveSession).toMatchObject({ revision: 1 });
    expect(reviseOverwolf).toHaveBeenCalledTimes(1);
    expect(reviseOverwolf.mock.calls[0]?.slice(0, 5)).toEqual([
      accountId,
      analysisId,
      0,
      revisionDraft,
      {
        idempotencyRecordId: 'claim-2',
        leaseToken: 'lease-2',
        resourceId: null,
      },
    ]);
    expect(idempotency.claim).toHaveBeenNthCalledWith(
      2,
      accountId,
      'analyses.overwolf.revision',
      'overwolf-revision-1',
      { analysisId, revision: 0, draft: revisionDraft },
    );
    const stale = await request('overwolf-stale-new-key');
    expect(stale.statusCode).toBe(409);
    expect(reviseOverwolf).toHaveBeenCalledTimes(2);
  });

  it('rejects a capability scoped to another analysis before service execution', async () => {
    const { app, reviseOverwolf } = await createTestApp();
    const started = await start(app, 'overwolf-scope-start');
    const token = parseOverwolfResponse(started).liveSession.token;
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/analyses/overwolf/00000000-0000-4000-8000-000000000099',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'overwolf-wrong-scope',
        'x-live-session-token': token,
      },
      payload: revisionDraft,
    });

    expect(response.statusCode).toBe(401);
    expect(reviseOverwolf).not.toHaveBeenCalled();
  });

  it('rejects capabilities from another account kind or token version', async () => {
    const { app, reviseOverwolf } = await createTestApp();
    for (const [index, identity] of [
      { kind: 'guest' as const, ver: 0 },
      { kind: 'user' as const, ver: 1 },
    ].entries()) {
      const token = app.jwt.sign({
        type: 'overwolf-live-session',
        sub: accountId,
        analysisId,
        revision: 0,
        ...identity,
      });
      const response = await app.inject({
        method: 'PUT',
        url: `/v1/analyses/overwolf/${analysisId}`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `overwolf-identity-mismatch-${index}`,
          'x-live-session-token': token,
        },
        payload: revisionDraft,
      });
      expect(response.statusCode).toBe(401);
    }
    expect(reviseOverwolf).not.toHaveBeenCalled();
  });

  it('replays the terminal revision response from the same idempotency record', async () => {
    const { app, reviseOverwolf } = await createTestApp();
    const started = await start(app, 'overwolf-recovery-start');
    const session = parseOverwolfResponse(started).liveSession;
    const request = () => app.inject({
      method: 'PUT',
      url: `/v1/analyses/overwolf/${analysisId}`,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'overwolf-recovery-revision',
        'x-live-session-token': session.token,
      },
      payload: revisionDraft,
    });

    const completed = await request();
    const replayed = await request();

    expect(completed.statusCode).toBe(200);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toEqual(completed.json());
    expect(reviseOverwolf).toHaveBeenCalledTimes(1);
  });

  it('stops the capability chain after eight revisions', async () => {
    const { app, reviseOverwolf } = await createTestApp();
    const started = await start(app, 'overwolf-limit-start');
    let session = parseOverwolfResponse(started).liveSession;
    for (let revision = 0; revision < 8; revision += 1) {
      const response = await app.inject({
        method: 'PUT',
        url: `/v1/analyses/overwolf/${analysisId}`,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `overwolf-bounded-${revision}`,
          'x-live-session-token': session.token,
        },
        payload: revisionDraft,
      });
      expect(response.statusCode).toBe(200);
      session = parseOverwolfResponse(response).liveSession;
    }
    const blocked = await app.inject({
      method: 'PUT',
      url: `/v1/analyses/overwolf/${analysisId}`,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'overwolf-bounded-8',
        'x-live-session-token': session.token,
      },
      payload: revisionDraft,
    });
    expect(blocked.statusCode).toBe(429);
    expect(reviseOverwolf).toHaveBeenCalledTimes(8);
  });
});

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
    expect(analyze.mock.calls[0]?.slice(0, 3)).toEqual([
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
    ]);

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
        autoPosition: false,
        allyGroup: null,
        orientationSource: null,
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
        autoPosition: false,
        allyGroup: null,
        orientationSource: null,
        rank: null,
      },
    );
  });

  it.each([
    'gsi_layout_heuristic',
    'gsi_player_hero',
  ] as const)('accepts %s orientation and fingerprints auto mode', async (orientationSource) => {
    const { app, idempotency, recognize, analyze } = await createTestApp({
      firstFrameWaiting: false,
      detectedPosition: 4,
    });
    const image = multipartImage();
    const response = await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&autoPosition=true&allyGroup=right&orientationSource=${orientationSource}&revision=7`,
      headers: {
        'content-type': image.contentType,
        'idempotency-key': `auto-position-frame-${orientationSource}`,
      },
      payload: image.payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'completed',
      recognition: { detectedPosition: 4 },
      analysis: { input: { position: 4 } },
    });
    expect(analyze.mock.calls[0]?.slice(0, 3)).toEqual([
      accountId,
      expect.objectContaining({ position: 4 }),
      expect.any(Object),
    ]);
    expect(recognize).toHaveBeenCalledWith(
      pngImage,
      'image/png',
      [],
      {
        detectPosition: true,
        allyGroup: 'right',
        orientationSource,
      },
    );
    expect(idempotency.claim).toHaveBeenNthCalledWith(
      1,
      accountId,
      'analyses.desktop.frame',
      `auto-position-frame-${orientationSource}`,
      {
        sessionId,
        frameHash: pngHash,
        mimeType: 'image/png',
        position: 2,
        autoPosition: true,
        allyGroup: 'right',
        orientationSource,
        rank: null,
        revision: 7,
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
        autoPosition: true,
        allyGroup: 'right',
        orientationSource,
        rank: null,
      },
    );
  });

  it.each([
    ['omitted manual mode', 4, '', 2],
    ['explicit manual mode', 4, '&autoPosition=false', 2],
    ['auto-mode fallback', null, '&autoPosition=true', 2],
  ] as const)('uses the requested position for %s', async (_label, detectedPosition, query, expected) => {
    const { app, recognize, analyze } = await createTestApp({
      firstFrameWaiting: false,
      detectedPosition,
    });
    const image = multipartImage();
    const response = await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2${query}&revision=0`,
      headers: {
        'content-type': image.contentType,
        'idempotency-key': `position-fallback-${query || 'default'}`,
      },
      payload: image.payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'completed',
      analysis: { input: { position: expected } },
    });
    expect(analyze.mock.calls[0]?.slice(0, 3)).toEqual([
      accountId,
      expect.objectContaining({ position: expected }),
      expect.any(Object),
    ]);
    expect(recognize).toHaveBeenCalledWith(
      pngImage,
      'image/png',
      [],
      { detectPosition: query === '&autoPosition=true' },
    );
  });

  it.each(['1', 'TRUE'])('strictly rejects autoPosition=%s', async (autoPosition) => {
    const { app, idempotency } = await createTestApp({ firstFrameWaiting: false });
    const image = multipartImage();
    const response = await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&autoPosition=${autoPosition}&revision=0`,
      headers: {
        'content-type': image.contentType,
        'idempotency-key': `invalid-auto-position-${autoPosition}`,
      },
      payload: image.payload,
    });

    expect(response.statusCode).toBe(400);
    expect(idempotency.claim).not.toHaveBeenCalled();
  });

  it('allows twelve desktop frames per user each minute', async () => {
    const { app } = await createTestApp();
    const statuses: number[] = [];

    for (let revision = 0; revision < 13; revision += 1) {
      const image = multipartImage();
      const response = await app.inject({
        method: 'POST',
        url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=${revision}`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': `user-rate-frame-${revision}`,
        },
        payload: image.payload,
      });
      statuses.push(response.statusCode);
    }

    expect(statuses.slice(0, 12)).toEqual(Array.from({ length: 12 }, () => 200));
    expect(statuses[12]).toBe(429);
  });

  it('allows forty-eight desktop frames per IP each minute across users', async () => {
    const { app } = await createTestApp({
      firstFrameWaiting: false,
      varyAccountPerRequest: true,
    });
    const statuses: number[] = [];

    for (let index = 0; index < 49; index += 1) {
      const image = multipartImage();
      const uniqueSessionId = `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
      const response = await app.inject({
        method: 'POST',
        url: `/v1/analyses/desktop?sessionId=${uniqueSessionId}&position=2&revision=0`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': `ip-rate-frame-${index}`,
        },
        payload: image.payload,
      });
      statuses.push(response.statusCode);
    }

    expect(statuses.slice(0, 48)).toEqual(Array.from({ length: 48 }, () => 200));
    expect(statuses[48]).toBe(429);
  });

  it('replays the exact completed desktop session without another analysis', async () => {
    const {
      app,
      idempotency,
      analyze,
      getReserveCount,
    } = await createTestApp({ firstFrameWaiting: false });
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

    const completed = await request(0);
    expect(completed.statusCode).toBe(200);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(getReserveCount()).toBe(1);

    const replayed = await request(1);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toEqual(completed.json());
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(getReserveCount()).toBe(1);
    expect(idempotency.abort).not.toHaveBeenCalled();
  });

  it('replays the committed auto-position response without recalculating recognition', async () => {
    const { app, recognize } = await createTestApp({
      firstFrameWaiting: false,
    });
    recognize
      .mockResolvedValueOnce({ ...trustedRecognition, detectedPosition: 4 })
      .mockResolvedValue({ ...trustedRecognition, detectedPosition: 5 });
    const request = async (revision: number) => {
      const image = multipartImage();
      return app.inject({
        method: 'POST',
        url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&autoPosition=true&revision=${revision}`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': `position-recovery-frame-${revision}`,
        },
        payload: image.payload,
      });
    };

    const completed = await request(0);
    const replayed = await request(1);

    expect(completed.statusCode).toBe(200);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toMatchObject({
      status: 'completed',
      recognition: { detectedPosition: 4 },
      analysis: { input: { position: 4 } },
    });
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

  it('allows twenty-four scoped live frames and blocks the twenty-fifth before recognition', async () => {
    const {
      app,
      idempotency,
      recognize,
      reviseDesktop,
    } = await createTestApp({
      firstFrameWaiting: false,
      recognitionCounts: [0, 24, 25],
    });
    const initialImage = multipartImage();
    const initial = parseDesktopResponse(await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=1`,
      headers: {
        'content-type': initialImage.contentType,
        'idempotency-key': 'desktop-frame-budget-initial',
      },
      payload: initialImage.payload,
    }));
    if (initial.status !== 'completed' || !initial.liveSession) {
      throw new Error('Expected an initial desktop live session');
    }
    const initialToken = initial.liveSession.token;
    const request = async (key: string, revision: number) => {
      recognize.mockResolvedValueOnce(recognitionForEnemies([1, 5]));
      const image = multipartImage();
      return app.inject({
        method: 'PUT',
        url: `/v1/analyses/desktop/${initial.analysis.id}?sessionId=${sessionId}&position=2&revision=${revision}`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': key,
          'x-live-session-token': initialToken,
        },
        payload: image.payload,
      });
    };

    const twentyFourth = await request('desktop-frame-budget-24', 2);
    const twentyFifth = await request('desktop-frame-budget-25', 3);

    expect(twentyFourth.statusCode).toBe(200);
    expect(twentyFifth.statusCode).toBe(429);
    expect(twentyFifth.json()).toMatchObject({
      error: { code: 'RATE_LIMITED', details: { limit: 24 } },
    });
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(reviseDesktop).toHaveBeenCalledTimes(1);
    expect(idempotency.abort).toHaveBeenCalledWith('claim-4', 'lease-4');
  });

  it('updates one photo analysis from two to five picks without another quota reservation', async () => {
    const {
      app,
      recognize,
      analyze,
      reviseDesktop,
      getReserveCount,
    } = await createTestApp({ firstFrameWaiting: false });
    const initialImage = multipartImage();
    const initial = await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=1`,
      headers: {
        'content-type': initialImage.contentType,
        'idempotency-key': 'desktop-live-initial',
      },
      payload: initialImage.payload,
    });
    const initialResponse = parseDesktopResponse(initial);
    if (initialResponse.status !== 'completed' || !initialResponse.liveSession) {
      throw new Error('Expected an initial desktop live session');
    }
    let token = initialResponse.liveSession.token;
    const requestRevision = async (
      key: string,
      frameRevision: number,
      recognition: RecognitionResult,
    ) => {
      recognize.mockResolvedValueOnce(recognition);
      const image = multipartImage();
      return app.inject({
        method: 'PUT',
        url: `/v1/analyses/desktop/${initialResponse.analysis.id}?sessionId=${sessionId}&position=2&revision=${frameRevision}`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': key,
          'x-live-session-token': token,
        },
        payload: image.payload,
      });
    };

    const three = parseDesktopResponse(await requestRevision(
      'desktop-live-three',
      2,
      recognitionForEnemies([1, 5, 14]),
    ));
    expect(three.status).toBe('completed');
    if (three.status !== 'completed' || !three.liveSession) {
      throw new Error('Expected the three-pick revision capability');
    }
    token = three.liveSession.token;
    expect(three.liveSession.revision).toBe(1);

    const sameDraft = parseDesktopResponse(await requestRevision(
      'desktop-live-three-same-picks-new-frame',
      3,
      recognitionForEnemies([14, 1, 5]),
    ));
    expect(sameDraft).toMatchObject({
      status: 'completed',
      analysis: { id: initialResponse.analysis.id },
    });
    expect(sameDraft.liveSession).toBeUndefined();

    const unclearRecognition = {
      ...recognitionForEnemies([1, 5, 14]),
      quality: 'partial' as const,
      recognized: recognitionForEnemies([1, 5, 14]).recognized.map(entry => ({
        ...entry,
        needsReview: true,
      })),
    };
    const waiting = parseDesktopResponse(await requestRevision(
      'desktop-live-transition-frame',
      4,
      unclearRecognition,
    ));
    expect(waiting.status).toBe('waiting');
    expect(waiting.liveSession).toBeUndefined();

    const four = parseDesktopResponse(await requestRevision(
      'desktop-live-four',
      5,
      recognitionForEnemies([1, 5, 14, 26]),
    ));
    if (four.status !== 'completed' || !four.liveSession) {
      throw new Error('Expected the four-pick revision capability');
    }
    token = four.liveSession.token;
    expect(four.liveSession.revision).toBe(2);

    const five = parseDesktopResponse(await requestRevision(
      'desktop-live-five',
      6,
      recognitionForEnemies([1, 5, 14, 26, 75]),
    ));
    if (five.status !== 'completed' || !five.liveSession) {
      throw new Error('Expected the five-pick revision capability');
    }
    expect(five.liveSession.revision).toBe(3);
    expect(five.analysis).toMatchObject({
      id: initialResponse.analysis.id,
      source: 'photo',
      input: { enemyHeroIds: [1, 5, 14, 26, 75] },
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(reviseDesktop).toHaveBeenCalledTimes(5);
    expect(getReserveCount()).toBe(1);
  });

  it('replays one desktop revision key and rejects a stale capability with a new key', async () => {
    const { app, recognize, reviseDesktop } = await createTestApp({ firstFrameWaiting: false });
    const initialImage = multipartImage();
    const initial = parseDesktopResponse(await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=1`,
      headers: {
        'content-type': initialImage.contentType,
        'idempotency-key': 'desktop-replay-initial',
      },
      payload: initialImage.payload,
    }));
    if (initial.status !== 'completed' || !initial.liveSession) {
      throw new Error('Expected an initial desktop live session');
    }
    const initialToken = initial.liveSession.token;
    const request = async (key: string) => {
      recognize.mockResolvedValueOnce(recognitionForEnemies([1, 5, 14]));
      const image = multipartImage();
      return app.inject({
        method: 'PUT',
        url: `/v1/analyses/desktop/${initial.analysis.id}?sessionId=${sessionId}&position=2&revision=2`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': key,
          'x-live-session-token': initialToken,
        },
        payload: image.payload,
      });
    };

    const first = await request('desktop-replay-revision');
    const replay = await request('desktop-replay-revision');
    const stale = await request('desktop-stale-revision');

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(stale.statusCode).toBe(409);
    expect(reviseDesktop).toHaveBeenCalledTimes(2);
  });

  it('limits actual desktop draft revisions to eight without consuming the limit for same picks', async () => {
    const { app, recognize, reviseDesktop } = await createTestApp({ firstFrameWaiting: false });
    const initialImage = multipartImage();
    const initial = parseDesktopResponse(await app.inject({
      method: 'POST',
      url: `/v1/analyses/desktop?sessionId=${sessionId}&position=2&revision=1`,
      headers: {
        'content-type': initialImage.contentType,
        'idempotency-key': 'desktop-limit-initial',
      },
      payload: initialImage.payload,
    }));
    if (initial.status !== 'completed' || !initial.liveSession) {
      throw new Error('Expected an initial desktop live session');
    }
    let token = initial.liveSession.token;
    const positions = [3, 4, 5, 1, 2, 3, 4, 5, 1] as const;
    const statuses: number[] = [];
    for (const [index, position] of positions.entries()) {
      recognize.mockResolvedValueOnce(recognitionForEnemies([1, 5]));
      const image = multipartImage();
      const response = await app.inject({
        method: 'PUT',
        url: `/v1/analyses/desktop/${initial.analysis.id}?sessionId=${sessionId}&position=${position}&revision=${index + 2}`,
        headers: {
          'content-type': image.contentType,
          'idempotency-key': `desktop-limit-${index}`,
          'x-live-session-token': token,
        },
        payload: image.payload,
      });
      statuses.push(response.statusCode);
      if (response.statusCode === 200) {
        const parsed = parseDesktopResponse(response);
        if (parsed.status === 'completed' && parsed.liveSession) {
          token = parsed.liveSession.token;
        }
      }
    }

    expect(statuses.slice(0, 8)).toEqual(Array.from({ length: 8 }, () => 200));
    expect(statuses[8]).toBe(429);
    expect(reviseDesktop).toHaveBeenCalledTimes(9);
  });

  it('rejects an expired desktop capability before recognition', async () => {
    const { app, recognize, reviseDesktop } = await createTestApp({ firstFrameWaiting: false });
    const expiredToken = app.jwt.sign({
      type: 'desktop-live-session',
      sub: accountId,
      kind: 'user',
      ver: 0,
      analysisId: '00000000-0000-4000-8000-000000000003',
      revision: 0,
    }, { expiresIn: -1 });
    const image = multipartImage();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/analyses/desktop/00000000-0000-4000-8000-000000000003'
        + `?sessionId=${sessionId}&position=2&revision=2`,
      headers: {
        'content-type': image.contentType,
        'idempotency-key': 'desktop-expired-capability',
        'x-live-session-token': expiredToken,
      },
      payload: image.payload,
    });

    expect(response.statusCode).toBe(401);
    expect(recognize).not.toHaveBeenCalled();
    expect(reviseDesktop).not.toHaveBeenCalled();
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
