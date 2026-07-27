import { describe, expect, it, vi } from 'vitest';
import type { HeroMeta, MetaSnapshot } from '../src/modules/heroes/heroes.types.js';
import {
  RecommendationAdvisorError,
  RecommendationEngine,
  type RecommendationAdvisor,
  type RecommendationAdvisorInput,
  type RecommendationAdvisorOutput,
} from '../src/modules/recommendation/recommendation.engine.js';
import { rankRecommendations } from '../src/modules/recommendation/ranking.js';
import type { RankRequest } from '../src/modules/recommendation/recommendation.types.js';

function hero(id: number, winRate = 0.5): HeroMeta {
  return {
    id,
    name: `hero_${id}`,
    localizedName: `Hero ${id}`,
    primaryAttribute: id % 2 === 0 ? 'agi' : 'str',
    attackType: id % 2 === 0 ? 'Ranged' : 'Melee',
    roles: id % 3 === 0 ? ['Carry', 'Escape'] : ['Carry'],
    imageUrl: `https://example.com/${id}.png`,
    iconUrl: `https://example.com/${id}-icon.png`,
    picks: 10_000,
    wins: Math.round(10_000 * winRate),
    winRate,
  };
}

function request(): RankRequest {
  const enemy = hero(1);
  const candidates = Array.from({ length: 10 }, (_, index) =>
    hero(index + 2, index === 0 ? 0.56 : 0.5));
  const snapshot: MetaSnapshot = {
    heroes: [enemy, ...candidates],
    patch: '7.41 · rolling matchups',
    fetchedAt: '2026-07-27T12:00:00.000Z',
    matchupByEnemy: new Map([
      [enemy.id, new Map(candidates.map((candidate, index) => [
        candidate.id,
        {
          heroId: candidate.id,
          gamesPlayed: 1_000,
          wins: index === 0 ? 250 : 500,
        },
      ]))],
    ]),
  };
  return {
    draft: {
      source: 'manual',
      position: 1,
      allyHeroIds: [],
      enemyHeroIds: [enemy.id],
    },
    snapshot,
  };
}

function advisor(
  implementation: (input: RecommendationAdvisorInput) => Promise<RecommendationAdvisorOutput>,
): RecommendationAdvisor {
  return {
    configured: true,
    model: 'gemini-test',
    advise: implementation,
  };
}

describe('RecommendationEngine', () => {
  it.each([
    {
      name: 'duplicate IDs',
      order: (ids: number[]) => ids.map(() => ids[0] ?? 0),
    },
    {
      name: 'out-of-set ID',
      order: (ids: number[]) => [999_999, ...ids.slice(1)],
    },
    {
      name: 'incomplete order',
      order: (ids: number[]) => ids.slice(0, -1),
    },
  ])('falls back without changing recommendations for $name', async ({ order }) => {
    const rankRequest = request();
    const deterministic = rankRecommendations(rankRequest);
    const advise = vi.fn(async (input: RecommendationAdvisorInput) => ({
      orderedHeroIds: order(input.candidates.map((candidate) => candidate.heroMeta.id)),
      model: 'gemini-test',
      promptVersion: 'test-v1',
    }));
    const engine = new RecommendationEngine(advisor(advise));

    const result = await engine.recommend(rankRequest);

    expect(result.recommendations).toEqual(deterministic.recommendations);
    expect(result.provenance).toMatchObject({
      aiAssisted: false,
      fallbackReason: 'invalid_response',
      model: 'gemini-test',
    });
    expect(advise).toHaveBeenCalledTimes(1);
  });

  it('falls back once on advisor timeout', async () => {
    const rankRequest = request();
    const deterministic = rankRecommendations(rankRequest);
    const advise = vi.fn(async () => {
      throw new RecommendationAdvisorError('timeout');
    });
    const engine = new RecommendationEngine(advisor(advise));

    const result = await engine.recommend(rankRequest);

    expect(result.recommendations).toEqual(deterministic.recommendations);
    expect(result.provenance?.fallbackReason).toBe('timeout');
    expect(advise).toHaveBeenCalledTimes(1);
  });

  it('keeps a statistically dominant candidate first despite a reversed AI order', async () => {
    const rankRequest = request();
    const advise = vi.fn(async (input: RecommendationAdvisorInput) => ({
      orderedHeroIds: input.candidates.map((candidate) => candidate.heroMeta.id).reverse(),
      model: 'gemini-test-version',
      promptVersion: 'test-v1',
    }));
    const engine = new RecommendationEngine(advisor(advise));

    const result = await engine.recommend(rankRequest);

    expect(result.recommendations[0]?.hero.id).toBe(2);
    expect(result.provenance).toMatchObject({
      aiAssisted: true,
      model: 'gemini-test-version',
      promptVersion: 'test-v1',
    });
    expect(advise).toHaveBeenCalledTimes(1);
  });

  it('does not call an unconfigured advisor', async () => {
    const rankRequest = request();
    const advise = vi.fn();
    const engine = new RecommendationEngine({
      configured: false,
      model: 'gemini-test',
      advise,
    });

    const result = await engine.recommend(rankRequest);

    expect(result.provenance?.fallbackReason).toBe('not_configured');
    expect(advise).not.toHaveBeenCalled();
  });
});
