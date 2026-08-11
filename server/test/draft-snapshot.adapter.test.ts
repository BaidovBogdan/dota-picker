import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import { OpenDotaDraftSnapshotSource } from '../src/modules/heroes/draft-snapshot-source.js';
import {
  draftDataPopulations,
  type DraftSnapshotInfo,
  type DraftSnapshotLookup,
  type DraftSnapshotMaterialization,
  type DraftSnapshotRepository,
  type StoredDraftSnapshot,
} from '../src/modules/heroes/draft-snapshot.repository.js';
import type { HeroMeta } from '../src/modules/heroes/heroes.types.js';

const config = {
  baseUrl: 'https://api.opendota.test/api',
  timeoutMs: 500,
  cacheTtlMs: 1_000,
  cacheStaleMs: 10_000,
} as const;

const heroes: HeroMeta[] = [1, 2, 3, 4, 5, 6].map((id) => ({
  id,
  name: `hero_${id}`,
  localizedName: `Hero ${id}`,
  primaryAttribute: 'agi',
  attackType: 'Ranged',
  roles: ['Carry'],
  imageUrl: `https://cdn.example.test/${id}.png`,
  iconUrl: `https://cdn.example.test/${id}-icon.png`,
  picks: 1_000,
  wins: 500,
  winRate: 0.5,
}));

const rawHeroes = heroes.map((hero) => ({
  id: hero.id,
  name: `npc_dota_hero_${hero.name}`,
  localized_name: hero.localizedName,
  primary_attr: hero.primaryAttribute,
  attack_type: hero.attackType,
  roles: hero.roles,
  img: `/hero-${hero.id}.png`,
  icon: `/hero-${hero.id}-icon.png`,
  pub_pick: hero.picks,
  pub_win: hero.wins,
  '7_pick': 100,
  '7_win': hero.id === 1 ? 60 : 50,
}));

const persistedHeroes = heroes.map((hero) => ({
  ...hero,
  statisticsScope: 'all_ranks' as const,
  rankStats: { 7: { picks: 100, wins: hero.id === 1 ? 60 : 50 } },
}));

const snapshotInfo: DraftSnapshotInfo = {
  id: '00000000-0000-4000-8000-000000000111',
  patch: '7.41',
  source: 'opendota_public_matches_explorer_positions',
  population: draftDataPopulations.public_all_pick,
  snapshotVersion: 1,
  matchCount: 500,
  rankMatchCounts: { 7: 20 },
  generatedAt: '2026-08-10T00:00:00.000Z',
  expiresAt: '2099-08-10T01:00:00.000Z',
  completedAt: '2026-08-10T00:00:00.000Z',
  heroes: persistedHeroes,
};

const storedSnapshot: StoredDraftSnapshot = {
  ...snapshotInfo,
  isStale: false,
  pairRows: [2, 3, 4, 5, 6].flatMap((candidateHeroId) => [
    {
      relation: 'matchup' as const,
      selectedHeroId: 1,
      candidateHeroId,
      rankBucket: 0 as const,
      games: 100,
      wins: candidateHeroId === 2 ? 65 : 50,
    },
    {
      relation: 'matchup' as const,
      selectedHeroId: 1,
      candidateHeroId,
      rankBucket: 7 as const,
      games: 8,
      wins: candidateHeroId === 2 ? 7 : 4,
    },
  ]),
  positionRows: [1, 2, 3, 4, 5].flatMap((position) => [
    {
      heroId: position,
      position: position as 1 | 2 | 3 | 4 | 5,
      rankBucket: 0 as const,
      games: 100,
      wins: 55,
    },
    {
      heroId: position,
      position: position as 1 | 2 | 3 | 4 | 5,
      rankBucket: 7 as const,
      games: 8,
      wins: 5,
    },
  ]),
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class SnapshotRepository implements DraftSnapshotRepository {
  public readonly completed: DraftSnapshotMaterialization[] = [];

  public constructor(
    private readonly snapshot: StoredDraftSnapshot | null,
    private readonly beginId: string | null = null,
  ) {}

  public async findLatestInfo(
    patch: string | undefined,
    population: 'ranked_all_pick' | 'public_all_pick',
  ): Promise<DraftSnapshotInfo | null> {
    void patch;
    return this.snapshot?.population.id === population ? snapshotInfo : null;
  }

  public async findLatestReady(
    lookup: DraftSnapshotLookup,
  ): Promise<StoredDraftSnapshot | null> {
    return this.snapshot?.population.id === lookup.population ? this.snapshot : null;
  }

  public async tryBegin(): Promise<string | null> {
    return this.beginId;
  }

  public abandonBuildingStartedBefore(): Promise<void> {
    return Promise.resolve();
  }

  public async complete(id: string, materialization: DraftSnapshotMaterialization): Promise<void> {
    void id;
    this.completed.push(materialization);
  }

  public fail(): Promise<void> {
    return Promise.resolve();
  }

  public prune(): Promise<void> {
    return Promise.resolve();
  }
}

class UnavailableSnapshotRepository implements DraftSnapshotRepository {
  public async findLatestInfo(): Promise<DraftSnapshotInfo | null> {
    return null;
  }

  public async findLatestReady(): Promise<StoredDraftSnapshot | null> {
    throw new Error('database unavailable');
  }

  public async tryBegin(): Promise<string | null> {
    return null;
  }

  public abandonBuildingStartedBefore(): Promise<void> {
    return Promise.resolve();
  }

  public complete(): Promise<void> {
    return Promise.resolve();
  }

  public fail(): Promise<void> {
    return Promise.resolve();
  }

  public prune(): Promise<void> {
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('durable draft snapshots', () => {
  it('serves a ready fallback snapshot without an Explorer request in the analysis path', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      throw new Error(`Ready snapshot must not use OpenDota: ${requestUrl(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config, undefined, new SnapshotRepository(storedSnapshot));

    const persistedHeroes = await adapter.getHeroes(7);
    const persistedPatch = await adapter.getPatch();
    const persistedPositions = await adapter.getMetaPositionSnapshot(7);
    const snapshot = await adapter.getSnapshot(7, [1]);
    const sparseSnapshot = await adapter.getSnapshot(7, [6]);

    expect(persistedHeroes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 1,
        picks: 100,
        wins: 60,
        winRate: 0.6,
        statisticsScope: 'rank',
      }),
    ]));
    expect(persistedPatch).toBe('7.41');
    expect(persistedPositions).toMatchObject({
      availability: 'ready',
      patch: '7.41',
      window: 'current_patch_parsed_lane_roles',
    });
    expect(snapshot.matchupByEnemy.get(1)?.get(2)).toEqual({
      heroId: 2,
      patchGames: 100,
      patchWins: 65,
      rankGames: 8,
      rankWins: 7,
    });
    expect(snapshot.pairScope).toMatchObject({
      availability: 'ready',
      rankFilter: 'all_ranks',
      dataHealth: {
        population: { id: 'public_all_pick' },
        fallbackFrom: 'ranked_all_pick',
        matchCount: 500,
      },
    });
    expect(snapshot.positionMeta).toMatchObject({
      availability: 'ready',
      rankFilter: 'all_ranks',
      window: 'current_patch_parsed_lane_roles',
    });
    expect(sparseSnapshot.pairScope?.availability).toBe('ready');
    expect(sparseSnapshot.matchupByEnemy.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers the newest patch fallback over a still-fresh primary from the previous patch', async () => {
    const oldPrimary: StoredDraftSnapshot = {
      ...storedSnapshot,
      id: '00000000-0000-4000-8000-000000000211',
      patch: '7.40',
      population: draftDataPopulations.ranked_all_pick,
      generatedAt: '2026-08-09T00:00:00.000Z',
      completedAt: '2026-08-09T00:00:00.000Z',
    };
    const currentFallback: StoredDraftSnapshot = {
      ...storedSnapshot,
      id: '00000000-0000-4000-8000-000000000212',
      generatedAt: '2026-08-10T00:00:00.000Z',
      completedAt: '2026-08-10T00:00:00.000Z',
    };
    const byPopulation = {
      ranked_all_pick: oldPrimary,
      public_all_pick: currentFallback,
    };
    const repository = {
      findLatestInfo: async (_patch: string | undefined, population: keyof typeof byPopulation) => (
        byPopulation[population]
      ),
      findLatestReady: async (lookup: DraftSnapshotLookup) => byPopulation[lookup.population],
      tryBegin: async () => null,
      abandonBuildingStartedBefore: async () => undefined,
      complete: async () => undefined,
      fail: async () => undefined,
      prune: async () => undefined,
    } as DraftSnapshotRepository;
    const fetchMock = vi.fn(async () => {
      throw new Error('Persisted patch selection must not use OpenDota');
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config, undefined, repository);

    expect(await adapter.getPatch()).toBe('7.41');
    const snapshot = await adapter.getSnapshot(7, [1]);
    expect(snapshot.patch).toBe('7.41');
    expect(snapshot.dataHealth).toMatchObject({
      population: { id: 'public_all_pick' },
      fallbackFrom: 'ranked_all_pick',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a collecting contract immediately while another process owns the first prewarm', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
      }
      throw new Error(`Explorer must not be awaited by getSnapshot: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config, undefined, new SnapshotRepository(null));

    const snapshot = await adapter.getSnapshot(undefined, [1], [], heroes);

    expect(snapshot.pairScope).toMatchObject({
      availability: 'collecting',
      dataHealth: {
        availability: 'collecting',
        snapshotId: null,
        population: { id: 'ranked_all_pick' },
      },
    });
    expect(snapshot.positionMeta?.availability).toBe('collecting');
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('/explorer?sql=')))
      .toBe(false);
  });

  it('does not wait for the initial patch bootstrap on a user snapshot request', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/constants/patch')) {
        return new Promise<Response>(() => undefined);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config, undefined, new SnapshotRepository(null));

    const snapshot = await within(adapter.getSnapshot(undefined, [1], []), 100);

    expect(snapshot.pairScope?.availability).toBe('collecting');
    expect(snapshot.positionMeta?.availability).toBe('collecting');
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('/explorer?sql=')))
      .toBe(false);
  });

  it('reports a repository outage as unavailable without falling back to Explorer', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config, undefined, new UnavailableSnapshotRepository());
    await adapter.getPatchInfo();

    const snapshot = await adapter.getSnapshot(undefined, [1], []);

    expect(snapshot.pairScope).toMatchObject({
      availability: 'unavailable',
      dataHealth: {
        availability: 'unavailable',
        snapshotId: null,
      },
    });
    expect(snapshot.positionMeta?.availability).toBe('collecting');
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('/explorer?sql=')))
      .toBe(false);
  });

  it('prewarms filtered immutable snapshots outside the request path', async () => {
    const requestedSql: string[] = [];
    let publicPage = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
      }
      if (url.endsWith('/heroStats')) {
        return json(rawHeroes);
      }
      if (url.includes('/publicMatches')) {
        const pageSize = publicPage < 2 ? 100 : 50;
        const offset = publicPage * 100;
        publicPage += 1;
        return json(Array.from({ length: pageSize }, (_, index) => ({
          match_id: 10_000 - offset - index,
          radiant_win: index % 2 === 0,
          start_time: 1_786_000_000 - offset - index,
          duration: 2_000,
          lobby_type: 7,
          game_mode: 22,
          avg_rank_tier: 75,
          radiant_team: [1, 2, 3, 4, 5],
          dire_team: [6, 7, 8, 9, 10],
        })));
      }
      const sql = new URL(url).searchParams.get('sql') ?? '';
      requestedSql.push(sql);
      if (sql.includes('WITH patch_matches')) {
        return json({
          rows: [1, 2, 3, 4, 5].flatMap((position) => (
            Array.from({ length: 20 }, (_, index) => ({
              hero_id: index + 1,
              position,
              games: 20,
              wins: 11,
            }))
          )),
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const repository = new SnapshotRepository(null, '00000000-0000-4000-8000-000000000222');
    const adapter = new OpenDotaAdapter(config, undefined, repository);

    await Promise.all([
      adapter.prewarmDraftSnapshots(),
      adapter.prewarmDraftSnapshots(),
    ]);

    expect(repository.completed).toHaveLength(2);
    expect(repository.completed.every((value) => value.matchCount === 250)).toBe(true);
    expect(repository.completed.every((value) => (
      value.source === 'opendota_public_matches_explorer_positions'
      && value.heroes.length === heroes.length
      && value.heroes[0]?.rankStats[7]?.picks === 100
      && value.pairRows.some((row) => row.relation === 'matchup' && row.rankBucket === 0)
      && value.pairRows.some((row) => row.relation === 'synergy' && row.rankBucket === 7)
      && new Set(value.positionRows.map((row) => row.position)).size === 5
    ))).toBe(true);
    expect(publicPage).toBe(3);
    expect(requestedSql).toHaveLength(1);
    expect(requestedSql[0]).toContain('WITH patch_matches');
    expect(requestedSql[0]).not.toContain("INTERVAL '30 days'");
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('/scenarios/laneRoles')))
      .toBe(false);
    expect(draftDataPopulations.ranked_all_pick).toMatchObject({
      audience: 'opendota_recent_public_sample',
      lobbyTypes: [7],
      gameModes: [22],
    });
  });

  it('marks lane-role scenarios as an approximate fallback when parsed positions are incomplete', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.includes('/publicMatches')) {
        return json(Array.from({ length: 60 }, (_, index) => ({
          match_id: 20_000 - index,
          radiant_win: index % 2 === 0,
          start_time: 1_786_000_000 - index,
          duration: 2_000,
          lobby_type: 0,
          game_mode: 1,
          avg_rank_tier: 55,
          radiant_team: [1, 2, 3, 4, 5],
          dire_team: [6, 7, 8, 9, 10],
        })));
      }
      if (url.includes('/explorer')) return json({ rows: [] });
      if (url.includes('/scenarios/laneRoles')) {
        return json([
          { hero_id: 1, lane_role: 1, time: 900, games: 20, wins: 11 },
          { hero_id: 2, lane_role: 2, time: 900, games: 20, wins: 10 },
          { hero_id: 3, lane_role: 3, time: 900, games: 20, wins: 9 },
        ]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const source = new OpenDotaDraftSnapshotSource(config);

    const materialization = await source.materialize(
      { id: 60, name: '7.41', releasedAt: '2026-03-24T00:50:59.580Z' },
      draftDataPopulations.public_all_pick,
      90 * 60 * 1_000,
      persistedHeroes,
    );

    expect(materialization.source).toBe('opendota_public_matches_lane_roles');
    expect(materialization.matchCount).toBe(60);
    expect(new Set(materialization.positionRows.map((row) => row.position))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    );
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('/scenarios/laneRoles')))
      .toBe(true);
  });
});
