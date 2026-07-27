import { describe, expect, it } from 'vitest';
import type {
  HeroMeta,
  HeroPositionStat,
  MatchupStat,
  MetaSnapshot,
} from '../src/modules/heroes/heroes.types.js';
import {
  draftSchema,
  recommendationResultSchema,
} from '../src/modules/recommendation/recommendation.schemas.js';
import { rankRecommendations } from '../src/modules/recommendation/ranking.js';
import type { DraftInput } from '../src/modules/recommendation/recommendation.types.js';

function hero(
  id: number,
  roles: string[],
  winRate = 0.5,
  attackType: HeroMeta['attackType'] = 'Ranged',
  picks = 10_000,
): HeroMeta {
  return {
    id,
    name: `hero_${id}`,
    localizedName: `Hero ${id}`,
    primaryAttribute: 'agi',
    attackType,
    roles,
    imageUrl: `https://example.com/${id}.png`,
    iconUrl: `https://example.com/${id}-icon.png`,
    picks,
    wins: Math.round(picks * winRate),
    winRate,
  };
}

function matchup(heroId: number, gamesPlayed: number, enemyWins: number): MatchupStat {
  return { heroId, gamesPlayed, wins: enemyWins };
}

function createSnapshot(
  heroes: HeroMeta[],
  matchupEntries: [number, MatchupStat[]][],
  positionStats: HeroPositionStat[] = [],
): MetaSnapshot {
  return {
    heroes,
    patch: '7.41 · rolling matchups',
    fetchedAt: '2026-07-27T12:00:00.000Z',
    matchupByEnemy: new Map(matchupEntries.map(([enemyId, stats]) => [
      enemyId,
      new Map(stats.map((stat) => [stat.heroId, stat])),
    ])),
    ...(positionStats.length > 0
      ? {
          positionMeta: {
            patch: '7.41',
            rank: 7,
            rankFilter: 'average_match_rank',
            window: 'current_patch_30d',
            minimumGames: 10,
            fetchedAt: '2026-07-27T12:00:00.000Z',
            isStale: false,
            availability: 'ready',
            positionStats,
          } as const,
        }
      : {}),
  };
}

const defaultDraft: DraftInput = {
  source: 'manual',
  position: 1,
  allyHeroIds: [],
  enemyHeroIds: [1],
};

describe('recommendation ranking', () => {
  it('prioritizes a statistically strong counter for one enemy', () => {
    const heroes = [
      hero(1, ['Carry']),
      hero(2, ['Carry', 'Escape'], 0.51),
      hero(3, ['Carry'], 0.53),
      hero(4, ['Support', 'Disabler'], 0.55),
      hero(5, ['Carry'], 0.49),
      hero(6, ['Carry'], 0.5),
    ];
    const snapshot = createSnapshot(heroes, [[1, [
      matchup(2, 1_000, 300),
      matchup(3, 1_000, 600),
      matchup(5, 1_000, 520),
      matchup(6, 1_000, 510),
    ]]]);

    const result = rankRecommendations({ draft: defaultDraft, snapshot });

    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0]?.hero.id).toBe(2);
    expect(result.recommendations[0]?.reasons).toContain('strong_counter');
    expect(result.recommendations[0]?.confidence).toBe('high');
    expect(result.recommendations[0]?.scoreBreakdown?.total).toBeGreaterThan(0);
    expect(result.recommendations[0]?.evidence?.matchups.source).toBe('opendota_rolling_all_ranks');
  });

  it('rewards coverage across a complete five-enemy draft', () => {
    const enemies = [101, 102, 103, 104, 105].map((id) => hero(id, ['Carry']));
    const candidates = [
      hero(2, ['Carry']),
      hero(3, ['Carry']),
      hero(4, ['Carry']),
      hero(5, ['Carry']),
      hero(6, ['Carry']),
    ];
    const entries: [number, MatchupStat[]][] = [101, 102, 103, 104, 105].map((enemyId) => [
      enemyId,
      [
        matchup(2, 1_000, 420),
        ...(enemyId === 101 ? [matchup(3, 1_000, 350)] : []),
        matchup(4, 1_000, 500),
        matchup(5, 1_000, 510),
        matchup(6, 1_000, 520),
      ],
    ]);
    const snapshot = createSnapshot([...enemies, ...candidates], entries);

    const result = rankRecommendations({
      draft: { ...defaultDraft, enemyHeroIds: enemies.map((enemy) => enemy.id) },
      snapshot,
    });

    expect(result.recommendations[0]?.hero.id).toBe(2);
    expect(result.recommendations[0]?.metrics.coverage).toBe(1);
    const partial = result.recommendations.find((entry) => entry.hero.id === 3);
    if (partial) {
      expect(partial.metrics.coverage).toBe(0.2);
      expect(partial.confidence).toBe('low');
    }
  });

  it('uses allies only for evidence-backed team composition fit', () => {
    const heroes = [
      hero(1, ['Carry']),
      hero(10, ['Carry'], 0.5, 'Melee'),
      hero(11, ['Nuker'], 0.5, 'Melee'),
      hero(12, ['Support'], 0.5, 'Melee'),
      hero(20, ['Support']),
      hero(21, ['Support', 'Disabler', 'Initiator']),
      hero(22, ['Support', 'Nuker']),
      hero(23, ['Support']),
    ];
    const stats = [20, 21, 22, 23].map((id) => matchup(id, 500, 250));
    const snapshot = createSnapshot(heroes, [[1, stats]]);

    const result = rankRecommendations({
      draft: {
        source: 'manual',
        position: 5,
        allyHeroIds: [10, 11, 12],
        enemyHeroIds: [1],
      },
      snapshot,
    });

    expect(result.recommendations[0]?.hero.id).toBe(21);
    expect(result.recommendations[0]?.reasons).toContain('fills_team_need');
    expect(result.recommendations[0]?.metrics.synergy).toBeGreaterThan(
      result.recommendations.find((entry) => entry.hero.id === 20)?.metrics.synergy ?? 0,
    );
  });

  it.each([
    {
      name: 'missing matchup',
      stat: undefined,
      expectedGames: 0,
    },
    {
      name: 'zero-game matchup',
      stat: matchup(2, 0, 0),
      expectedGames: 0,
    },
    {
      name: 'very small matchup sample',
      stat: matchup(2, 5, 0),
      expectedGames: 5,
    },
  ])('treats $name as low-confidence evidence', ({ stat, expectedGames }) => {
    const heroes = [
      hero(1, ['Carry']),
      hero(2, ['Carry']),
      hero(3, ['Carry']),
      hero(4, ['Carry']),
      hero(5, ['Carry']),
    ];
    const snapshot = createSnapshot(
      heroes,
      [[1, stat ? [stat] : []]],
    );

    const result = rankRecommendations({ draft: defaultDraft, snapshot });
    const candidate = result.recommendations.find((entry) => entry.hero.id === 2);

    expect(candidate?.confidence).toBe('low');
    expect(candidate?.evidence?.matchups.games).toBe(expectedGames);
    expect(candidate?.reasons).toContain('limited_matchup_data');
    expect(candidate?.reasons).not.toContain('strong_counter');
    expect(Number.isFinite(candidate?.metrics.counter ?? Number.NaN)).toBe(true);
  });

  it('excludes picked and banned heroes before scoring', () => {
    const heroes = [
      hero(1, ['Carry']),
      hero(2, ['Carry']),
      hero(3, ['Carry']),
      hero(4, ['Carry']),
      hero(5, ['Carry']),
      hero(6, ['Carry']),
    ];
    const snapshot = createSnapshot(heroes, [[1, [2, 3, 4, 5, 6].map((id) =>
      matchup(id, 500, 250))]]);

    const result = rankRecommendations({
      draft: {
        ...defaultDraft,
        allyHeroIds: [2],
        bannedHeroIds: [3],
      },
      snapshot,
    });

    expect(result.recommendations.map((entry) => entry.hero.id)).not.toContain(1);
    expect(result.recommendations.map((entry) => entry.hero.id)).not.toContain(2);
    expect(result.recommendations.map((entry) => entry.hero.id)).not.toContain(3);
  });

  it('prefers current-patch position evidence over a conflicting coarse role tag', () => {
    const heroes = [
      hero(1, ['Carry']),
      hero(2, ['Carry']),
      hero(3, ['Carry']),
      hero(4, ['Carry']),
      hero(5, ['Carry']),
    ];
    const positionStats: HeroPositionStat[] = [
      {
        heroId: 2,
        position: 1,
        picks: 800,
        wins: 440,
        winRate: 0.55,
        isApproximate: true,
        method: 'lane_role_farm_priority',
      },
      {
        heroId: 3,
        position: 2,
        picks: 800,
        wins: 440,
        winRate: 0.55,
        isApproximate: false,
        method: 'lane_role',
      },
    ];
    const snapshot = createSnapshot(
      heroes,
      [[1, [2, 3, 4, 5].map((id) => matchup(id, 500, 250))]],
      positionStats,
    );

    const result = rankRecommendations({
      draft: { ...defaultDraft, rank: 7 },
      snapshot,
    });

    expect(result.recommendations[0]?.hero.id).toBe(2);
    expect(result.recommendations[0]?.evidence?.meta).toMatchObject({
      source: 'opendota_current_patch_30d_position',
      rankScoped: true,
      position: 1,
    });
    expect(result.recommendations.map((entry) => entry.hero.id)).not.toContain(3);
  });

  it('uses a deterministic hero id tie-breaker', () => {
    const equalHeroes = [
      hero(99, ['Carry']),
      hero(12, ['Carry']),
      hero(10, ['Carry']),
      hero(11, ['Carry']),
    ];
    const snapshot = createSnapshot(equalHeroes, []);
    const result = rankRecommendations({
      draft: { ...defaultDraft, enemyHeroIds: [99] },
      snapshot,
    });

    expect(result.recommendations.map((entry) => entry.hero.id)).toEqual([10, 11, 12]);
  });

  it('continues to parse stored v1 drafts and recommendation results', () => {
    const recommendation = {
      hero: {
        id: 2,
        name: 'hero_2',
        localizedName: 'Hero 2',
        imageUrl: 'https://example.com/2.png',
        iconUrl: 'https://example.com/2-icon.png',
        roles: ['Carry'],
      },
      score: 70,
      confidence: 'medium',
      metrics: {
        roleFit: 1,
        counter: 0.6,
        meta: 0.5,
        synergy: 0.5,
      },
      reasons: ['good_role_fit'],
    };
    const stored = recommendationResultSchema.parse({
      patch: '7.40',
      metaFetchedAt: '2026-07-22T12:00:00.000Z',
      recommendations: [2, 3, 4].map((id) => ({
        ...recommendation,
        hero: {
          ...recommendation.hero,
          id,
          name: `hero_${id}`,
          localizedName: `Hero ${id}`,
        },
      })),
    });
    const draft = draftSchema.parse({
      source: 'manual',
      position: 1,
      allyHeroIds: [],
      enemyHeroIds: [1],
    });

    expect(stored.provenance).toBeUndefined();
    expect(stored.recommendations[0]?.scoreBreakdown).toBeUndefined();
    expect(draft.bannedHeroIds).toEqual([]);
  });
});
