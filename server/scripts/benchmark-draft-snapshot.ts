import { performance } from 'node:perf_hooks';
import { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import {
  draftDataPopulations,
  type DraftSnapshotRepository,
  type DraftSnapshotInfo,
  type StoredDraftSnapshot,
} from '../src/modules/heroes/draft-snapshot.repository.js';
import type { HeroMeta, MetaSnapshot } from '../src/modules/heroes/heroes.types.js';
import { rankRecommendations } from '../src/modules/recommendation/ranking.js';

const runs = 5;
const providerDelayMs = 1_600;
const config = {
  baseUrl: 'https://api.opendota.test/api',
  timeoutMs: 2_000,
  cacheTtlMs: 1_000,
  cacheStaleMs: 10_000,
} as const;

const heroes = Array.from({ length: 6 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    name: `npc_dota_hero_${id}`,
    localized_name: `Hero ${id}`,
    primary_attr: 'agi' as const,
    attack_type: 'Ranged' as const,
    roles: ['Carry'],
    img: `/hero-${id}.png`,
    icon: `/hero-${id}-icon.png`,
    pub_pick: 1_000,
    pub_win: id === 3 ? 570 : 500,
  };
});

const positionRows = [1, 2, 3, 4, 5].map((position) => ({
  hero_id: position,
  position,
  games: 100,
  wins: 55,
}));

const persistedHeroes = heroes.map((hero) => ({
  ...toHeroMeta(hero),
  statisticsScope: 'all_ranks' as const,
  rankStats: {},
}));

const persistedInfo: DraftSnapshotInfo = {
  id: '00000000-0000-4000-8000-000000000111',
  patch: '7.41',
  source: 'opendota_public_matches_explorer_positions',
  population: draftDataPopulations.public_all_pick,
  snapshotVersion: 1,
  matchCount: 1_000,
  rankMatchCounts: {},
  generatedAt: '2026-08-10T00:00:00.000Z',
  expiresAt: '2026-08-10T01:00:00.000Z',
  completedAt: '2026-08-10T00:00:00.000Z',
  heroes: persistedHeroes,
};

const persistedSnapshot: StoredDraftSnapshot = {
  ...persistedInfo,
  isStale: false,
  pairRows: [2, 3, 4, 5, 6].map((candidateHeroId) => ({
    relation: 'matchup' as const,
    selectedHeroId: 1,
    candidateHeroId,
    rankBucket: 0 as const,
    games: 1_000,
    wins: candidateHeroId === 2 ? 700 : candidateHeroId === 3 ? 450 : 500,
  })),
  positionRows: [1, 2, 3, 4, 5].map((position) => ({
    heroId: position,
    position: position as 1 | 2 | 3 | 4 | 5,
    rankBucket: 0 as const,
    games: 100,
    wins: 55,
  })),
};

class ReadySnapshotRepository implements DraftSnapshotRepository {
  public async findLatestInfo(): Promise<DraftSnapshotInfo | null> {
    return persistedInfo;
  }

  public async findLatestReady(): Promise<StoredDraftSnapshot | null> {
    return persistedSnapshot;
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

class CollectingSnapshotRepository implements DraftSnapshotRepository {
  public async findLatestInfo(): Promise<DraftSnapshotInfo | null> {
    return null;
  }

  public async findLatestReady(): Promise<StoredDraftSnapshot | null> {
    return null;
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

function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function delay(value: Response, milliseconds: number) {
  return new Promise<Response>((resolve) => {
    setTimeout(() => resolve(value), milliseconds);
  });
}

function percentile(values: number[], fraction: number) {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return Math.round((sorted[index] ?? 0) * 10) / 10;
}

function toHeroMeta(raw: typeof heroes[number]): HeroMeta {
  return {
    id: raw.id,
    name: raw.name.replace('npc_dota_hero_', ''),
    localizedName: raw.localized_name,
    primaryAttribute: raw.primary_attr,
    attackType: raw.attack_type,
    roles: raw.roles,
    imageUrl: `https://cdn.example.test${raw.img}`,
    iconUrl: `https://cdn.example.test${raw.icon}`,
    picks: raw.pub_pick,
    wins: raw.pub_win,
    winRate: raw.pub_win / raw.pub_pick,
  };
}

function topThree(snapshot: MetaSnapshot) {
  return rankRecommendations({
    draft: {
      source: 'manual',
      position: 1,
      allyHeroIds: [],
      enemyHeroIds: [1],
    },
    snapshot,
  }).recommendations.map((entry) => entry.hero.id);
}

async function measureLegacy(): Promise<{ timings: number[]; coldTopThree: number[]; warmTopThree: number[] }> {
  const timings: number[] = [];
  let coldTopThree: number[] = [];
  let warmTopThree: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const adapter = new OpenDotaAdapter(config);
    const startedAt = performance.now();
    const cold = await adapter.getSnapshot(undefined, [1], [], heroes.map(toHeroMeta));
    timings.push(performance.now() - startedAt);
    coldTopThree = topThree(cold);
    await new Promise((resolve) => setTimeout(resolve, providerDelayMs - 1_500 + 100));
    const warm = await adapter.getSnapshot(undefined, [1], [], heroes.map(toHeroMeta));
    warmTopThree = topThree(warm);
  }
  return { timings, coldTopThree, warmTopThree };
}

async function measureReadySnapshot(): Promise<{
  timings: number[];
  topThree: number[];
  stable: boolean;
}> {
  const timings: number[] = [];
  const topThrees: number[][] = [];
  for (let index = 0; index < runs; index += 1) {
    const adapter = new OpenDotaAdapter(config, undefined, new ReadySnapshotRepository());
    await adapter.getPatchInfo();
    const startedAt = performance.now();
    const snapshot = await adapter.getSnapshot(undefined, [1], [], heroes.map(toHeroMeta));
    timings.push(performance.now() - startedAt);
    topThrees.push(topThree(snapshot));
  }
  const referenceTopThree = topThrees[0] ?? [];
  return {
    timings,
    topThree: referenceTopThree,
    stable: topThrees.every((value) => (
      JSON.stringify(value) === JSON.stringify(referenceTopThree)
    )),
  };
}

async function measureCollectingUserPath(): Promise<{
  timings: number[];
  availability: string[];
  explorerCallsBeforeResponse: number;
}> {
  const timings: number[] = [];
  const availability = new Set<string>();
  let explorerCallsBeforeResponse = 0;
  for (let index = 0; index < runs; index += 1) {
    const adapter = new OpenDotaAdapter(
      config,
      undefined,
      new CollectingSnapshotRepository(),
    );
    const before = explorerRequestCount;
    const startedAt = performance.now();
    const snapshot = await adapter.getSnapshot(undefined, [1], []);
    timings.push(performance.now() - startedAt);
    availability.add(snapshot.pairScope?.availability ?? 'unavailable');
    explorerCallsBeforeResponse += explorerRequestCount - before;
  }
  return {
    timings,
    availability: [...availability].toSorted(),
    explorerCallsBeforeResponse,
  };
}

const originalFetch = globalThis.fetch;
let explorerRequestCount = 0;
globalThis.fetch = async (input) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  if (url.endsWith('/constants/patch')) {
    return response([{ id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' }]);
  }
  if (url.includes('/explorer?sql=')) {
    explorerRequestCount += 1;
    const sql = new URL(url).searchParams.get('sql') ?? '';
    if (sql.includes('WITH pair_observations')) {
      return delay(response({
        rows: [2, 3, 4, 5, 6].map((candidateId) => ({
          relation: 'matchup',
          selected_id: 1,
          candidate_id: candidateId,
          patch_games: 1_000,
          patch_wins: candidateId === 2 ? 700 : candidateId === 3 ? 450 : 500,
          rank_games: 0,
          rank_wins: 0,
        })),
      }), providerDelayMs);
    }
    return response({ rows: positionRows });
  }
  throw new Error(`Unexpected mocked URL: ${url}`);
};

try {
  const collecting = await measureCollectingUserPath();
  const legacy = await measureLegacy();
  const ready = await measureReadySnapshot();
  const output = {
    conditions: {
      mode: 'local mocked benchmark',
      network: 'disabled',
      database: 'No PostgreSQL latency is measured; persisted paths use in-memory repository doubles.',
      runs,
      providerDelayMs,
      note: 'This measures request-path behavior only and is not a production latency or throughput claim.',
    },
    coldUserPathWithoutSnapshot: {
      medianMs: percentile(collecting.timings, 0.5),
      p95Ms: percentile(collecting.timings, 0.95),
      availability: collecting.availability,
      explorerCallsBeforeResponse: collecting.explorerCallsBeforeResponse,
      outcome: 'collecting contract; the response does not await Explorer and no recommendation is ranked or persisted',
    },
    legacyRequestTimeExplorer: {
      medianMs: percentile(legacy.timings, 0.5),
      p95Ms: percentile(legacy.timings, 0.95),
      coldTopThree: legacy.coldTopThree,
      warmTopThree: legacy.warmTopThree,
      stable: JSON.stringify(legacy.coldTopThree) === JSON.stringify(legacy.warmTopThree),
    },
    readyPersistedSnapshot: {
      medianMs: percentile(ready.timings, 0.5),
      p95Ms: percentile(ready.timings, 0.95),
      topThree: ready.topThree,
      stable: ready.stable,
      population: persistedSnapshot.population.id,
      matchCount: persistedSnapshot.matchCount,
      repository: 'in-memory durable-repository contract double',
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  globalThis.fetch = originalFetch;
}
