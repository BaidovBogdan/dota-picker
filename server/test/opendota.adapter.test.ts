import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';

const config = {
  baseUrl: 'https://api.opendota.test/api',
  timeoutMs: 500,
  cacheTtlMs: 1_000,
  cacheStaleMs: 10_000,
} as const;

const positionRows = [1, 2, 3, 4, 5].map((position) => ({
  hero_id: position,
  position,
  games: 20,
  wins: 11,
}));

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenDotaAdapter', () => {
  it('loads current-patch matchup and synergy rows with split indexed branches and caches the snapshot', async () => {
    const requestedSql: string[] = [];
    const requestedUrls: string[] = [];
    const rawHeroes = Array.from({ length: 6 }, (_, index) => {
      const id = index + 1;
      return {
        id,
        name: `npc_dota_hero_${id}`,
        localized_name: `Hero ${id}`,
        primary_attr: 'agi',
        attack_type: 'Ranged',
        roles: ['Carry'],
        img: `/hero-${id}.png`,
        icon: `/hero-${id}-icon.png`,
        pub_pick: 1_000,
        pub_win: 500,
        '7_pick': 200,
        '7_win': 100,
      };
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      requestedUrls.push(url);
      if (url.endsWith('/heroStats')) {
        return json(rawHeroes);
      }
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
      }
      if (url.includes('/explorer?sql=')) {
        const sql = new URL(url).searchParams.get('sql') ?? '';
        requestedSql.push(sql);
        if (sql.includes('WITH pair_observations')) {
          return json({
            rows: [{
              relation: 'matchup',
              selected_id: '1',
              candidate_id: '4',
              patch_games: '120',
              patch_wins: '72',
              rank_games: '40',
              rank_wins: '25',
            }, {
              relation: 'synergy',
              selected_id: '3',
              candidate_id: '4',
              patch_games: '90',
              patch_wins: '54',
              rank_games: '30',
              rank_wins: '19',
            }],
          });
        }
        return json({ rows: positionRows });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    const first = await adapter.getSnapshot(7, [2, 1], [3]);
    const second = await adapter.getSnapshot(7, [1, 2], [3]);

    expect(first.matchupByEnemy.get(1)?.get(4)).toEqual({
      heroId: 4,
      patchGames: 120,
      patchWins: 72,
      rankGames: 40,
      rankWins: 25,
    });
    expect(first.synergyByAlly.get(3)?.get(4)?.rankWins).toBe(19);
    expect(first.pairScope).toMatchObject({
      patch: '7.41',
      rank: 7,
      rankFilter: 'average_match_rank',
      availability: 'ready',
    });
    expect(second.matchupByEnemy.get(1)?.get(4)?.patchGames).toBe(120);
    const pairQueries = requestedSql.filter((sql) => sql.includes('WITH pair_observations'));
    expect(pairQueries).toHaveLength(1);
    expect(pairQueries[0]).toContain('pub.radiant_team && ARRAY[1,2]::integer[]');
    expect(pairQueries[0]).toContain('pub.dire_team && ARRAY[1,2]::integer[]');
    expect(pairQueries[0]).toContain('pub.radiant_team && ARRAY[3]::integer[]');
    expect(pairQueries[0]).toContain('pub.dire_team && ARRAY[3]::integer[]');
    expect(pairQueries[0]).toContain("mp.patch = '7.41'");
    expect(pairQueries[0]).toContain(
      'COUNT(*) FILTER (WHERE average_rank = 7)::int AS rank_games',
    );
    expect(pairQueries[0]).toContain('average_rank = 7');
    expect(requestedUrls.some((url) => url.includes('/matchups'))).toBe(false);
  });

  it('bounds the draft-pair cache and refreshes recent entries in LRU order', async () => {
    let pairQueries = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
      }
      if (url.includes('/explorer?sql=')) {
        const sql = new URL(url).searchParams.get('sql') ?? '';
        if (sql.includes('WITH pair_observations')) {
          pairQueries += 1;
          return json({ rows: [] });
        }
        return json({ rows: positionRows });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    for (let enemyId = 1; enemyId <= 256; enemyId += 1) {
      await adapter.getSnapshot(undefined, [enemyId], [], []);
    }
    expect(pairQueries).toBe(256);

    await adapter.getSnapshot(undefined, [1], [], []);
    await adapter.getSnapshot(undefined, [257], [], []);
    await adapter.getSnapshot(undefined, [1], [], []);
    expect(pairQueries).toBe(257);

    await adapter.getSnapshot(undefined, [2], [], []);

    expect(pairQueries).toBe(258);
    const cache = (adapter as unknown as { pairCache: Map<string, unknown> }).pairCache;
    expect(cache.size).toBe(256);
  }, 10_000);

  it('labels the patch as unknown when patch discovery fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/constants/patch')) {
        throw new Error('Patch unavailable');
      }
      if (url.includes('/explorer?sql=')) {
        return json({ rows: positionRows });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    const snapshot = await adapter.getSnapshot(undefined, [1], [], []);

    expect(snapshot.patch).toBe('unknown patch');
    expect(snapshot.pairScope).toBeNull();
  });

  it('returns an explicit neutral pair snapshot when Explorer is unavailable', async () => {
    const rawHeroes = Array.from({ length: 4 }, (_, index) => {
      const id = index + 1;
      return {
        id,
        name: `npc_dota_hero_${id}`,
        localized_name: `Hero ${id}`,
        primary_attr: 'agi',
        attack_type: 'Ranged',
        roles: ['Carry'],
        img: `/hero-${id}.png`,
        icon: `/hero-${id}-icon.png`,
        pub_pick: 1_000,
        pub_win: 500,
      };
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/heroStats')) {
        return json(rawHeroes);
      }
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
      }
      if (url.includes('/explorer?sql=')) {
        const sql = new URL(url).searchParams.get('sql') ?? '';
        if (sql.includes('WITH pair_observations')) {
          throw new Error('Explorer unavailable');
        }
        return json({ rows: positionRows });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    const snapshot = await adapter.getSnapshot(undefined, [1], [2]);

    expect(snapshot.matchupByEnemy.size).toBe(0);
    expect(snapshot.synergyByAlly.size).toBe(0);
    expect(snapshot.pairScope).toMatchObject({
      patch: '7.41',
      availability: 'unavailable',
      isStale: false,
    });
  });

  it('samples balanced public matches for both all-rank and rank-filtered snapshots', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      requestedUrls.push(url);
      if (url.endsWith('/constants/patch')) {
        return json([{
          id: 60,
          name: '7.41',
          date: '2026-03-24T00:50:59.580Z',
        }, {
          id: 59,
          name: '7.40',
          date: '2025-12-16T00:50:40.281Z',
        }]);
      }
      if (url.includes('/explorer?sql=')) {
        return json({ rows: positionRows });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    const allRanks = await adapter.getMetaPositionSnapshot();
    const divine = await adapter.getMetaPositionSnapshot(7);

    expect(allRanks).toMatchObject({
      patch: '7.41',
      rank: null,
      rankFilter: 'all_ranks',
      availability: 'ready',
    });
    expect(divine).toMatchObject({
      patch: '7.41',
      rank: 7,
      rankFilter: 'average_match_rank',
      availability: 'ready',
    });

    const explorerSql = requestedUrls
      .filter((url) => url.includes('/explorer?sql='))
      .map((url) => new URL(url).searchParams.get('sql'));
    expect(explorerSql).toHaveLength(2);
    expect(explorerSql[0]).toContain('JOIN public_matches pub USING(match_id)');
    expect(explorerSql[0]).toContain('ORDER BY m.start_time DESC, m.match_id DESC');
    expect(explorerSql[0]).not.toContain('FLOOR(pub.avg_rank_tier / 10)');
    expect(explorerSql[1]).toContain('FLOOR(pub.avg_rank_tier / 10) = 7');
  });

  it('falls back to all-rank position data when the requested rank lacks full coverage', async () => {
    const requestedSql: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/constants/patch')) {
        return json([{
          id: 60,
          name: '7.41',
          date: '2026-03-24T00:50:59.580Z',
        }]);
      }
      if (url.includes('/explorer?sql=')) {
        const sql = new URL(url).searchParams.get('sql') ?? '';
        requestedSql.push(sql);
        return json({
          rows: sql.includes('FLOOR(pub.avg_rank_tier / 10) = 8')
            ? positionRows.slice(0, 2)
            : positionRows,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    const immortal = await adapter.getMetaPositionSnapshot(8);

    expect(immortal).toMatchObject({
      patch: '7.41',
      rank: 8,
      rankFilter: 'all_ranks',
      availability: 'ready',
      positionStats: positionRows.map((row) => ({
        heroId: row.hero_id,
        position: row.position,
      })),
    });
    expect(requestedSql).toHaveLength(2);
    expect(requestedSql[0]).toContain('FLOOR(pub.avg_rank_tier / 10) = 8');
    expect(requestedSql[1]).not.toContain('FLOOR(pub.avg_rank_tier / 10)');
  });

  it('samples current-patch builds from balanced public matches ordered by start time', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      requestedUrls.push(url);
      if (url.endsWith('/heroStats')) {
        return json([{
          id: 1,
          name: 'npc_dota_hero_antimage',
          localized_name: 'Anti-Mage',
          primary_attr: 'agi',
          attack_type: 'Melee',
          roles: ['Carry'],
          img: '/apps/dota2/images/dota_react/heroes/antimage.png',
          icon: '/apps/dota2/images/dota_react/heroes/icons/antimage.png',
          pub_pick: 100,
          pub_win: 51,
        }]);
      }
      if (url.endsWith('/constants/patch')) {
        return json([{
          id: 60,
          name: '7.41',
          date: '2026-03-24T00:50:59.580Z',
        }, {
          id: 59,
          name: '7.40',
          date: '2025-12-16T00:50:40.281Z',
        }]);
      }
      if (url.endsWith('/constants/items')) {
        return json({});
      }
      if (url.includes('/explorer?sql=')) {
        return json({ rows: [] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    const detail = await adapter.getHeroDetail(1);

    expect(detail).toMatchObject({
      hero: { id: 1 },
      patch: { name: '7.41' },
      availability: { builds: 'collecting' },
    });
    const explorerSql = requestedUrls
      .filter((url) => url.includes('/explorer?sql='))
      .map((url) => new URL(url).searchParams.get('sql'));
    expect(explorerSql).toHaveLength(1);
    expect(explorerSql[0]).toContain('JOIN public_matches pub USING(match_id)');
    expect(explorerSql[0]).toContain('ORDER BY m.start_time DESC, pm.match_id DESC');
  });

  it('returns core hero statistics while the build snapshot refreshes in the background', async () => {
    const diagnostics: Record<string, unknown>[] = [];
    let resolveExplorer: ((response: Response) => void) | undefined;
    const explorerResponse = new Promise<Response>((resolve) => {
      resolveExplorer = resolve;
    });
    let explorerRequests = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/heroStats')) {
        return json([{
          id: 1,
          name: 'npc_dota_hero_antimage',
          localized_name: 'Anti-Mage',
          primary_attr: 'agi',
          attack_type: 'Melee',
          roles: ['Carry'],
          img: '/apps/dota2/images/dota_react/heroes/antimage.png',
          icon: '/apps/dota2/images/dota_react/heroes/icons/antimage.png',
          pub_pick: 100,
          pub_win: 51,
        }]);
      }
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
      }
      if (url.endsWith('/constants/items')) {
        return json({});
      }
      if (url.includes('/explorer?sql=')) {
        explorerRequests += 1;
        return explorerResponse;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config, (diagnostic) => diagnostics.push(diagnostic));

    const first = await withTimeout(adapter.getHeroDetail(1), 500);
    const concurrent = await adapter.getHeroDetail(1);

    expect(first).toMatchObject({
      hero: { id: 1 },
      patch: { name: '7.41' },
      availability: { builds: 'collecting' },
    });
    expect(concurrent.availability.builds).toBe('collecting');
    expect(explorerRequests).toBe(1);

    resolveExplorer?.(json({ rows: [] }));
    await vi.waitFor(() => {
      const pending = (adapter as unknown as { detailPending: Map<string, unknown> }).detailPending;
      expect(pending.size).toBe(0);
    });
    expect(diagnostics).toMatchObject([{
      operation: 'hero-detail-refresh',
      heroId: 1,
      patch: '7.41',
      outcome: 'success',
      availability: 'collecting',
    }]);
    expect(typeof diagnostics[0]?.durationMs).toBe('number');
  });

  it('reports background build failures and serves an unavailable fail-soft state', async () => {
    const diagnostics: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/heroStats')) {
        return json([{
          id: 1,
          name: 'npc_dota_hero_antimage',
          localized_name: 'Anti-Mage',
          primary_attr: 'agi',
          attack_type: 'Melee',
          roles: ['Carry'],
          img: '/hero.png',
          icon: '/hero-icon.png',
          pub_pick: 100,
          pub_win: 51,
        }]);
      }
      if (url.endsWith('/constants/patch')) {
        return json([{ id: 60, name: '7.41', date: null }]);
      }
      if (url.endsWith('/constants/items')) {
        throw new Error('Items provider failed');
      }
      if (url.includes('/explorer?sql=')) {
        return json({ rows: [] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config, (diagnostic) => diagnostics.push(diagnostic));

    const first = await adapter.getHeroDetail(1);
    expect(first.availability.builds).toBe('collecting');
    await vi.waitFor(() => {
      const pending = (adapter as unknown as { detailPending: Map<string, unknown> }).detailPending;
      expect(pending.size).toBe(0);
    });

    const settled = await adapter.getHeroDetail(1);
    expect(settled.availability.builds).toBe('unavailable');
    expect(diagnostics).toMatchObject([{
      outcome: 'fallback',
      availability: 'unavailable',
    }]);
    expect(String(diagnostics[0]?.reason)).toContain('temporarily unavailable');
  });

  it('combines current-patch position meta with the selected-rank matchup baseline', async () => {
    const rawHeroes = Array.from({ length: 6 }, (_, index) => {
      const id = index + 1;
      return {
        id,
        name: `npc_dota_hero_${id}`,
        localized_name: `Hero ${id}`,
        primary_attr: 'agi',
        attack_type: 'Ranged',
        roles: ['Carry'],
        img: `/hero-${id}.png`,
        icon: `/hero-${id}-icon.png`,
        pub_pick: 1_000,
        pub_win: id === 2 ? 480 : 500,
        '7_pick': 100,
        '7_win': id === 2 ? 60 : 50,
      };
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (url.endsWith('/heroStats')) {
        return json(rawHeroes);
      }
      if (url.endsWith('/constants/patch')) {
        return json([{
          id: 60,
          name: '7.41',
          date: '2026-03-24T00:50:59.580Z',
        }]);
      }
      if (url.includes('/explorer?sql=')) {
        return json({ rows: positionRows });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OpenDotaAdapter(config);

    const snapshot = await adapter.getSnapshot(7, [1]);

    expect(snapshot.positionMeta).toMatchObject({
      patch: '7.41',
      rank: 7,
      rankFilter: 'average_match_rank',
      window: 'current_patch_30d',
    });
    expect(snapshot.matchupBaselineByHero?.get(2)).toBe(0.6);
    expect(snapshot.heroes.find((candidate) => candidate.id === 2)?.winRate).toBe(0.6);
  });
});
