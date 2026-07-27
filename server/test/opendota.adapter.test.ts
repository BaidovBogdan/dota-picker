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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenDotaAdapter position meta', () => {
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

  it('combines current-patch position meta with all-rank matchup baselines', async () => {
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
      if (url.endsWith('/heroes/1/matchups')) {
        return json([{
          hero_id: 2,
          games_played: 500,
          wins: 250,
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
    expect(snapshot.matchupBaselineByHero?.get(2)).toBe(0.48);
    expect(snapshot.heroes.find((candidate) => candidate.id === 2)?.winRate).toBe(0.6);
  });
});
