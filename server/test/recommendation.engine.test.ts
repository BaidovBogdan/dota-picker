import { describe, expect, it, vi } from 'vitest';
import type { HeroMeta, MetaSnapshot } from '../src/modules/heroes/heroes.types.js';
import { RecommendationEngine } from '../src/modules/recommendation/recommendation.engine.js';
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
    patch: '7.41',
    fetchedAt: '2026-07-27T12:00:00.000Z',
    matchupByEnemy: new Map([
      [enemy.id, new Map(candidates.map((candidate, index) => [
        candidate.id,
        {
          heroId: candidate.id,
          patchGames: 1_000,
          patchWins: index === 0 ? 750 : 500,
          rankGames: 1_000,
          rankWins: index === 0 ? 750 : 500,
        },
      ]))],
    ]),
    synergyByAlly: new Map(),
    pairScope: {
      patch: '7.41',
      rank: null,
      rankFilter: 'all_ranks',
      window: 'current_patch',
      fetchedAt: '2026-07-27T12:00:00.000Z',
      isStale: false,
      availability: 'ready',
    },
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

describe('RecommendationEngine', () => {
  it('returns the deterministic ranking without awaiting an advisor', async () => {
    const rankRequest = request();
    const advise = vi.fn(async () => new Promise<never>(() => undefined));
    const engine = new RecommendationEngine();

    const result = await engine.recommend(rankRequest);

    expect(result).toEqual(rankRecommendations(rankRequest));
    expect(result.provenance).toEqual({
      engineVersion: 'deterministic-v3',
      scoringVersion: 'draft-pairs-v3',
      aiAssisted: false,
    });
    expect(advise).not.toHaveBeenCalled();
  });
});
