import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import type { Analysis } from '../src/db/schema.js';
import {
  AnalysisService,
  type AnalysisExecution,
} from '../src/modules/analysis/analysis.service.js';
import type { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import type { QuotaService } from '../src/modules/quota/quota.service.js';
import type { RecommendationEngine } from '../src/modules/recommendation/recommendation.engine.js';
import type { DraftInput } from '../src/modules/recommendation/recommendation.types.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const analysisId = '00000000-0000-4000-8000-000000000002';
const execution: AnalysisExecution = {
  idempotencyRecordId: '00000000-0000-4000-8000-000000000003',
  leaseToken: 'revision-lease',
  resourceId: null,
};
const draft: DraftInput = {
  source: 'overwolf',
  position: 3,
  allyHeroIds: [1],
  enemyHeroIds: [5, 14],
  bannedHeroIds: [75],
};
const photoDraft: DraftInput = {
  source: 'photo',
  position: 3,
  allyHeroIds: [1],
  enemyHeroIds: [5, 14],
  bannedHeroIds: [],
};
const quota = {
  plan: 'free' as const,
  remaining: 2,
  limit: 3,
  nextRefillAt: null,
  planExpiresAt: null,
};
const result = {
  patch: '7.41',
  metaFetchedAt: '2026-08-08T00:00:00.000Z',
  recommendations: [2, 3, 4].map(id => ({
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
  })),
};

function analysisRow(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: analysisId,
    accountId,
    status: 'completed',
    source: 'overwolf',
    input: draft,
    result,
    patch: result.patch,
    errorCode: null,
    revision: 0,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  };
}

function createHarness(
  row: Analysis | undefined,
  updateSucceeds = true,
  hasReview = false,
) {
  const reserve = vi.fn(async () => quota);
  const getQuota = vi.fn(async () => quota);
  const updateValues: unknown[] = [];
  const transactionUpdate = vi.fn(() => ({
    set: (values: unknown) => {
      updateValues.push(values);
      if (row && updateSucceeds && typeof values === 'object' && values) {
        Object.assign(row, values);
      }
      return {
        where: () => ({
          returning: async () => updateSucceeds ? [{ id: analysisId }] : [],
        }),
      };
    },
  }));
  const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => [{ id: execution.idempotencyRecordId }],
          limit: async () => hasReview ? [{ id: 'review-id' }] : [],
        }),
      }),
    }),
    update: transactionUpdate,
  }));
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => row ? [row] : [],
        }),
      }),
    }),
    transaction,
  } as unknown as Database;
  const heroIds = [1, 5, 14, 26, 75];
  const meta = {
    getHeroes: vi.fn(async () => heroIds.map(id => ({ id }))),
    getSnapshot: vi.fn(async () => ({})),
  } as unknown as OpenDotaAdapter;
  const recommendations = {
    recommend: vi.fn(async () => result),
  } as unknown as RecommendationEngine;
  const service = new AnalysisService(
    db,
    meta,
    { reserve, get: getQuota } as unknown as QuotaService,
    recommendations,
  );
  return { service, reserve, getQuota, updateValues, transactionUpdate };
}

describe('AnalysisService Overwolf revisions', () => {
  it('updates the same Overwolf row without reserving quota again', async () => {
    const harness = createHarness(analysisRow());
    const first = await harness.service.reviseOverwolf(
      accountId,
      analysisId,
      0,
      draft,
      execution,
    );
    const secondDraft: DraftInput = {
      ...draft,
      enemyHeroIds: [5, 14, 26],
    };
    const second = await harness.service.reviseOverwolf(
      accountId,
      analysisId,
      1,
      secondDraft,
      execution,
    );

    expect(first.analysis.id).toBe(analysisId);
    expect(second.analysis.id).toBe(analysisId);
    expect(second.analysis.input.enemyHeroIds).toEqual([5, 14, 26]);
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.getQuota).toHaveBeenCalledTimes(2);
    expect(harness.updateValues.filter((value) => (
      typeof value === 'object' && value !== null && 'input' in value
    )).at(-1)).toMatchObject({
      input: secondDraft,
      result,
      patch: result.patch,
    });
  });

  it('recovers a committed revision linked to an unfinished idempotency record', async () => {
    const committedDraft: DraftInput = {
      ...draft,
      enemyHeroIds: [5, 14, 26],
    };
    const harness = createHarness(analysisRow({
      revision: 1,
      input: committedDraft,
    }));

    const recovered = await harness.service.reviseOverwolf(
      accountId,
      analysisId,
      0,
      draft,
      { ...execution, resourceId: analysisId },
    );

    expect(recovered.revision).toBe(1);
    expect(recovered.analysis.input.enemyHeroIds).toEqual([5, 14, 26]);
    expect(harness.getQuota).toHaveBeenCalledWith(accountId);
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.transactionUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['foreign', undefined],
    ['non-overwolf', analysisRow({ source: 'manual' })],
    ['unfinished', analysisRow({ status: 'processing', result: null })],
  ])('does not reveal or mutate a %s analysis', async (_label, row) => {
    const harness = createHarness(row);

    await expect(
      harness.service.reviseOverwolf(accountId, analysisId, 0, draft, execution),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.transactionUpdate).not.toHaveBeenCalled();
  });

  it('rejects a stale concurrent revision without overwriting newer input', async () => {
    const harness = createHarness(analysisRow(), false);

    await expect(
      harness.service.reviseOverwolf(accountId, analysisId, 0, draft, execution),
    ).rejects.toMatchObject({ statusCode: 409, code: 'REQUEST_IN_PROGRESS' });
  });

  it('keeps a reviewed analysis immutable', async () => {
    const harness = createHarness(analysisRow(), true, true);

    await expect(
      harness.service.reviseOverwolf(accountId, analysisId, 0, draft, execution),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ANALYSIS_REVIEWED' });
    expect(harness.updateValues).not.toContainEqual(expect.objectContaining({ input: draft }));
  });
});

describe('AnalysisService Draft Vision revisions', () => {
  it('updates the same photo row without another quota reservation', async () => {
    const harness = createHarness(analysisRow({
      source: 'photo',
      input: photoDraft,
    }));
    const nextDraft: DraftInput = {
      ...photoDraft,
      enemyHeroIds: [5, 14, 26],
    };

    const revised = await harness.service.reviseDesktop(
      accountId,
      analysisId,
      0,
      nextDraft,
      execution,
      8,
    );

    expect(revised).toMatchObject({
      changed: true,
      revision: 1,
      analysis: {
        id: analysisId,
        source: 'photo',
        input: nextDraft,
      },
    });
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.getQuota).toHaveBeenCalledWith(accountId);
  });

  it('treats reordered hero sets and waiting frames as the current draft', async () => {
    const original: DraftInput = {
      ...photoDraft,
      allyHeroIds: [1, 26],
      enemyHeroIds: [5, 14, 75],
    };
    const harness = createHarness(analysisRow({
      source: 'photo',
      input: original,
    }));
    const reordered: DraftInput = {
      ...original,
      allyHeroIds: [26, 1],
      enemyHeroIds: [75, 5, 14],
    };

    const same = await harness.service.reviseDesktop(
      accountId,
      analysisId,
      0,
      reordered,
      execution,
      8,
    );
    const waiting = await harness.service.reviseDesktop(
      accountId,
      analysisId,
      0,
      null,
      execution,
      8,
    );

    expect(same).toMatchObject({ changed: false, revision: 0 });
    expect(waiting).toMatchObject({ changed: false, revision: 0 });
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.transactionUpdate).not.toHaveBeenCalled();
  });

  it('recovers a committed photo revision from its linked request', async () => {
    const committedDraft: DraftInput = {
      ...photoDraft,
      enemyHeroIds: [5, 14, 26],
    };
    const harness = createHarness(analysisRow({
      source: 'photo',
      input: committedDraft,
      revision: 1,
    }));

    const recovered = await harness.service.reviseDesktop(
      accountId,
      analysisId,
      0,
      committedDraft,
      { ...execution, resourceId: analysisId },
      8,
    );

    expect(recovered).toMatchObject({ changed: true, revision: 1 });
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.transactionUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['foreign', undefined],
    ['non-photo', analysisRow()],
    ['unfinished', analysisRow({ source: 'photo', input: photoDraft, status: 'processing', result: null })],
  ])('does not reveal or mutate a %s analysis', async (_label, row) => {
    const harness = createHarness(row);

    await expect(harness.service.reviseDesktop(
      accountId,
      analysisId,
      0,
      photoDraft,
      execution,
      8,
    )).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(harness.reserve).not.toHaveBeenCalled();
    expect(harness.transactionUpdate).not.toHaveBeenCalled();
  });

  it('rejects source spoofing, reviewed changes and changes after the bounded revision limit', async () => {
    const sourceHarness = createHarness(analysisRow({ source: 'photo', input: photoDraft }));
    await expect(sourceHarness.service.reviseDesktop(
      accountId,
      analysisId,
      0,
      draft,
      execution,
      8,
    )).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_DRAFT' });

    const changedDraft: DraftInput = { ...photoDraft, enemyHeroIds: [5, 14, 26] };
    const reviewedHarness = createHarness(
      analysisRow({ source: 'photo', input: photoDraft }),
      true,
      true,
    );
    await expect(reviewedHarness.service.reviseDesktop(
      accountId,
      analysisId,
      0,
      changedDraft,
      execution,
      8,
    )).rejects.toMatchObject({ statusCode: 409, code: 'ANALYSIS_REVIEWED' });

    const boundedHarness = createHarness(analysisRow({
      source: 'photo',
      input: photoDraft,
      revision: 8,
    }));
    await expect(boundedHarness.service.reviseDesktop(
      accountId,
      analysisId,
      8,
      changedDraft,
      execution,
      8,
    )).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(boundedHarness.reserve).not.toHaveBeenCalled();
    expect(boundedHarness.transactionUpdate).not.toHaveBeenCalled();
  });
});
