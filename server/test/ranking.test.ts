import { describe, expect, it } from 'vitest';
import type { HeroMeta, MetaSnapshot } from '../src/modules/heroes/heroes.types.js';
import { rankRecommendations } from '../src/modules/recommendation/ranking.js';

function hero(id: number, roles: string[], winRate = 0.5, attackType: HeroMeta['attackType'] = 'Ranged'): HeroMeta {
  return {
    id,
    name: `hero_${id}`,
    localizedName: `Hero ${id}`,
    primaryAttribute: 'agi',
    attackType,
    roles,
    imageUrl: `https://example.com/${id}.png`,
    iconUrl: `https://example.com/${id}-icon.png`,
    picks: 10_000,
    wins: Math.round(10_000 * winRate),
    winRate,
  };
}

const heroes = [
  hero(1, ['Carry']),
  hero(2, ['Carry', 'Escape'], 0.51),
  hero(3, ['Carry'], 0.53),
  hero(4, ['Support', 'Disabler'], 0.55),
  hero(5, ['Carry'], 0.49),
  hero(6, ['Carry'], 0.5),
];

function snapshot(enemyWinsAgainstTwo: number): MetaSnapshot {
  return {
    heroes,
    patch: '7.40',
    fetchedAt: '2026-07-22T12:00:00.000Z',
    matchupByEnemy: new Map([
      [1, new Map([
        [2, { heroId: 2, gamesPlayed: 1_000, wins: enemyWinsAgainstTwo }],
        [3, { heroId: 3, gamesPlayed: 1_000, wins: 600 }],
        [5, { heroId: 5, gamesPlayed: 1_000, wins: 520 }],
        [6, { heroId: 6, gamesPlayed: 1_000, wins: 510 }],
      ])],
    ]),
  };
}

describe('recommendation ranking', () => {
  it('prioritizes a statistically strong counter for the requested role', () => {
    const result = rankRecommendations({
      draft: { source: 'manual', position: 1, allyHeroIds: [], enemyHeroIds: [1] },
      snapshot: snapshot(300),
    });

    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0]?.hero.id).toBe(2);
    expect(result.recommendations[0]?.reasons).toContain('strong_counter');
    expect(result.recommendations[0]?.confidence).toBe('high');
  });

  it('excludes already selected heroes and off-role candidates', () => {
    const result = rankRecommendations({
      draft: { source: 'manual', position: 1, allyHeroIds: [2], enemyHeroIds: [1] },
      snapshot: snapshot(300),
    });

    expect(result.recommendations.map((entry) => entry.hero.id)).not.toContain(2);
    expect(result.recommendations.map((entry) => entry.hero.id)).not.toContain(4);
  });

  it('uses a deterministic hero id tie-breaker', () => {
    const equalHeroes = [hero(12, ['Carry']), hero(10, ['Carry']), hero(11, ['Carry'])];
    const equalSnapshot: MetaSnapshot = {
      heroes: equalHeroes,
      patch: '7.40',
      fetchedAt: '2026-07-22T12:00:00.000Z',
      matchupByEnemy: new Map(),
    };
    const result = rankRecommendations({
      draft: { source: 'manual', position: 1, allyHeroIds: [], enemyHeroIds: [99] },
      snapshot: equalSnapshot,
    });

    expect(result.recommendations.map((entry) => entry.hero.id)).toEqual([10, 11, 12]);
  });
});
