import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import { ReviewService } from '../src/modules/reviews/review.service.js';

function queryResult<T>(value: T) {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(async () => value),
    then: <TResult1 = T, TResult2 = never>(
      onFulfilled?: ((result: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(value).then(onFulfilled, onRejected),
  };
  return builder;
}

function review(id: string, analysisId: string, selectedHeroIds: number[]) {
  const now = new Date('2026-08-08T10:00:00.000Z');
  return {
    id,
    accountId: '11111111-1111-4111-8111-111111111111',
    analysisId,
    rating: 4,
    selectedHeroIds,
    comment: 'Исторический отзыв',
    createdAt: now,
    updatedAt: now,
  };
}

const validResult = {
  patch: '7.41',
  metaFetchedAt: '2026-08-08T10:00:00.000Z',
  recommendations: [1, 2, 3].map((id) => ({
    hero: {
      id,
      name: `hero_${id}`,
      localizedName: `Hero ${id}`,
      imageUrl: `https://cdn.cloudflare.steamstatic.com/${id}.png`,
      iconUrl: `https://cdn.cloudflare.steamstatic.com/${id}-icon.png`,
      roles: ['Carry'],
    },
    score: 80,
    confidence: 'high',
    metrics: { roleFit: 0.8, counter: 0.7, meta: 0.6, synergy: 0.5 },
    reasons: ['strong_counter'],
  })),
};

describe('ReviewService admin legacy results', () => {
  it('keeps valid, malformed, and absent review rows independently readable', async () => {
    const account = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'user' as const,
      email: 'legacy@example.com',
      plan: 'pro' as const,
    };
    const rows = [
      {
        review: review('21111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', [1]),
        account,
        analysis: { source: 'manual' as const, patch: null, result: validResult },
      },
      {
        review: review('41111111-1111-4111-8111-111111111111', '51111111-1111-4111-8111-111111111111', [77]),
        account,
        analysis: { source: 'photo' as const, patch: '7.38', result: [77, 'legacy'] },
      },
      {
        review: review('61111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', []),
        account,
        analysis: { source: 'overwolf' as const, patch: null, result: null },
      },
    ];
    const select = vi.fn()
      .mockImplementationOnce(() => queryResult([{ count: 3, averageRating: '4' }]))
      .mockImplementationOnce(() => queryResult([{ rating: 4, count: 3 }]))
      .mockImplementationOnce(() => queryResult(rows));
    const service = new ReviewService({ select } as unknown as Database);

    const result = await service.listForAdmin({
      q: '',
      limit: 25,
      offset: 0,
    });

    expect(select).toHaveBeenCalledTimes(3);
    expect(result.items[0]?.analysis).toMatchObject({
      patch: '7.41',
      dataQuality: { result: 'valid', issues: [] },
      rawResult: null,
    });
    expect(result.items[0]?.analysis.recommendations).toHaveLength(3);
    expect(result.items[1]?.analysis).toMatchObject({
      patch: '7.38',
      recommendations: [],
      rawResult: [77, 'legacy'],
      dataQuality: { result: 'legacy_invalid' },
    });
    expect(result.items[1]?.analysis.dataQuality.issues.length).toBeGreaterThan(0);
    expect(result.items[2]?.analysis).toMatchObject({
      patch: null,
      recommendations: [],
      rawResult: null,
      dataQuality: { result: 'absent', issues: [] },
    });
  });
});
