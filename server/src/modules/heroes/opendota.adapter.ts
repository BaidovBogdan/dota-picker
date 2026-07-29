import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { ExternalServiceError, NotFoundError } from '../../lib/errors.js';
import { TtlCache } from './cache.js';
import type {
  DraftPairScope,
  DraftPairStat,
  HeroBuildItem,
  HeroBuildVariant,
  HeroDetail,
  HeroMeta,
  HeroPosition,
  HeroPositionStat,
  MetaPositionSnapshot,
  MetaSnapshot,
  PatchMeta,
  RankBracket,
  RankWinRate,
} from './heroes.types.js';

const DETAIL_CACHE_FRESH_MS = 4 * 60 * 60 * 1_000;
const DETAIL_CACHE_COLLECTING_MS = 60 * 60 * 1_000;
const DETAIL_CACHE_RETRY_MS = 5 * 60 * 1_000;
const DETAIL_CACHE_STALE_MS = 24 * 60 * 60 * 1_000;
const ITEMS_CACHE_FRESH_MS = 24 * 60 * 60 * 1_000;
const ITEMS_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1_000;
const POSITION_CACHE_FRESH_MS = 4 * 60 * 60 * 1_000;
const POSITION_CACHE_COLLECTING_MS = 60 * 60 * 1_000;
const POSITION_CACHE_RETRY_MS = 5 * 60 * 1_000;
const POSITION_CACHE_STALE_MS = 24 * 60 * 60 * 1_000;
const POSITION_WINDOW_DAYS = 30;
const POSITION_MATCH_LIMIT = 20_000;
const POSITION_MIN_GAMES = 10;
const PAIR_CACHE_FRESH_MS = 15 * 60 * 1_000;
const PAIR_CACHE_RETRY_MS = 60 * 1_000;
const PAIR_CACHE_STALE_MS = 24 * 60 * 60 * 1_000;
const PAIR_CACHE_MAX_ENTRIES = 256;
const PAIR_QUERY_TIMEOUT_MS = 5_000;
const BUILD_SAMPLE_LIMIT = 400;
const BUILD_TUPLE_SIZE = 3;
const BUILD_ITEM_LIMIT = 6;
const BUILD_MIN_GAMES = 3;
const BUILD_MAX_VARIANTS = 3;
const MAJOR_ITEM_MIN_COST = 1_400;
const RANK_BRACKETS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly RankBracket[];

const heroStatsSchema = z.array(z.object({
  id: z.number().int().positive(),
  name: z.string(),
  localized_name: z.string(),
  primary_attr: z.enum(['str', 'agi', 'int', 'all']),
  attack_type: z.enum(['Melee', 'Ranged']),
  roles: z.array(z.string()),
  img: z.string(),
  icon: z.string(),
  pub_pick: z.number().nonnegative().optional().default(0),
  pub_win: z.number().nonnegative().optional().default(0),
}).loose());

const patchesSchema = z.array(z.object({
  name: z.string(),
  date: z.string().nullable().optional(),
  id: z.number().int(),
}));

const itemSchema = z.object({
  id: z.number().int().nonnegative(),
  dname: z.string().nullable().optional(),
  img: z.string().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  components: z.array(z.string()).nullable().optional(),
  created: z.boolean().optional(),
}).loose();

const itemsSchema = z.record(z.string(), itemSchema);

const explorerBuildRowSchema = z.object({
  match_id: z.coerce.number().int().positive(),
  item_0: z.coerce.number().int().nonnegative().nullable().optional().default(null),
  item_1: z.coerce.number().int().nonnegative().nullable().optional().default(null),
  item_2: z.coerce.number().int().nonnegative().nullable().optional().default(null),
  item_3: z.coerce.number().int().nonnegative().nullable().optional().default(null),
  item_4: z.coerce.number().int().nonnegative().nullable().optional().default(null),
  item_5: z.coerce.number().int().nonnegative().nullable().optional().default(null),
  purchase_log: z.array(z.unknown()).nullable().optional().default(null),
  won: z.boolean(),
}).loose();

const explorerResponseSchema = z.object({
  rows: z.array(explorerBuildRowSchema).optional().default([]),
  err: z.string().nullable().optional(),
}).loose();

const heroPositionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const explorerPositionRowSchema = z.object({
  hero_id: z.coerce.number().int().positive(),
  position: z.coerce.number().pipe(heroPositionSchema),
  games: z.coerce.number().int().positive(),
  wins: z.coerce.number().int().nonnegative(),
}).loose();

const explorerPositionResponseSchema = z.object({
  rows: z.array(explorerPositionRowSchema).optional().default([]),
  err: z.string().nullable().optional(),
}).loose();

const explorerPairRowSchema = z.object({
  relation: z.enum(['matchup', 'synergy']),
  selected_id: z.coerce.number().int().positive(),
  candidate_id: z.coerce.number().int().positive(),
  patch_games: z.coerce.number().int().nonnegative(),
  patch_wins: z.coerce.number().int().nonnegative(),
  rank_games: z.coerce.number().int().nonnegative(),
  rank_wins: z.coerce.number().int().nonnegative(),
}).loose();

const explorerPairResponseSchema = z.object({
  rows: z.array(explorerPairRowSchema).optional().default([]),
  err: z.string().nullable().optional(),
}).loose();

const purchaseEntrySchema = z.object({
  key: z.string().min(1),
  time: z.coerce.number(),
}).loose();

type RawHero = z.infer<typeof heroStatsSchema>[number];
type RawItem = z.infer<typeof itemSchema>;
type RawItems = z.infer<typeof itemsSchema>;
type ExplorerBuildRow = z.infer<typeof explorerBuildRowSchema>;

type MajorPurchase = {
  item: RawItem;
  slug: string;
  purchaseSec: number;
};

type BuildSample = {
  won: boolean;
  purchases: MajorPurchase[];
};

type BuildGroup = {
  key: string;
  samples: BuildSample[];
};

type BuildSection = Pick<HeroDetail, 'builds' | 'buildSampleSize' | 'availability'>;

type HeroDetailCacheEntry = {
  value: HeroDetail;
  freshUntil: number;
  staleUntil: number;
};

type MetaPositionCacheEntry = {
  value: MetaPositionSnapshot;
  freshUntil: number;
  staleUntil: number;
};

type DraftPairSnapshot = {
  matchupByEnemy: Map<number, Map<number, DraftPairStat>>;
  synergyByAlly: Map<number, Map<number, DraftPairStat>>;
  scope: DraftPairScope;
};

type DraftPairCacheEntry = {
  value: DraftPairSnapshot;
  freshUntil: number;
  staleUntil: number;
};

export class OpenDotaAdapter {
  private readonly heroesCache: TtlCache<RawHero[]>;
  private readonly patchCache: TtlCache<PatchMeta>;
  private readonly itemsCache: TtlCache<RawItems>;
  private readonly detailCache = new Map<string, HeroDetailCacheEntry>();
  private readonly detailPending = new Map<string, Promise<HeroDetail>>();
  private readonly positionCache = new Map<string, MetaPositionCacheEntry>();
  private readonly positionPending = new Map<string, Promise<MetaPositionSnapshot>>();
  private readonly pairCache = new Map<string, DraftPairCacheEntry>();
  private readonly pairPending = new Map<string, Promise<DraftPairSnapshot>>();

  public constructor(private readonly config: AppConfig['openDota']) {
    this.heroesCache = new TtlCache(config.cacheTtlMs, config.cacheStaleMs);
    this.patchCache = new TtlCache(config.cacheTtlMs, config.cacheStaleMs);
    this.itemsCache = new TtlCache(
      Math.max(config.cacheTtlMs, ITEMS_CACHE_FRESH_MS),
      Math.max(config.cacheStaleMs, ITEMS_CACHE_STALE_MS),
    );
  }

  public async getHeroes(rank?: RankBracket): Promise<HeroMeta[]> {
    const raw = await this.getRawHeroes();
    return raw.map((hero) => this.toHeroMeta(hero, rank));
  }

  public async getPatch(): Promise<string> {
    return (await this.getPatchInfo()).name;
  }

  public async getPatchInfo(): Promise<PatchMeta> {
    return this.patchCache.get('patch', async () => {
      const patches = patchesSchema.parse(await this.request('/constants/patch'));
      const latest = patches.toSorted((left, right) => right.id - left.id).at(0);
      if (!latest) {
        throw new ExternalServiceError('Current Dota patch is unavailable', {
          provider: 'OpenDota',
        });
      }
      return {
        id: latest.id,
        name: latest.name,
        releasedAt: latest.date ?? null,
      };
    });
  }

  public async getHeroDetail(heroId: number): Promise<HeroDetail> {
    const [heroes, patch] = await Promise.all([
      this.getRawHeroes(),
      this.getPatchInfo(),
    ]);
    const hero = heroes.find((candidate) => candidate.id === heroId);
    if (!hero) {
      throw new NotFoundError('Hero not found');
    }

    const key = `${patch.name}:${heroId}`;
    const now = Date.now();
    const cached = this.detailCache.get(key);
    if (cached && cached.freshUntil > now) {
      return cached.value;
    }

    const pending = this.detailPending.get(key);
    if (pending) {
      return pending;
    }

    const request = this.loadHeroDetail(hero, patch)
      .then((value) => {
        const loadedAt = Date.now();
        if (
          value.availability.builds === 'unavailable'
          && cached
          && cached.value.builds.length > 0
          && cached.staleUntil > loadedAt
        ) {
          const staleValue = { ...cached.value, isStale: true };
          this.detailCache.set(key, {
            value: staleValue,
            freshUntil: loadedAt + DETAIL_CACHE_RETRY_MS,
            staleUntil: cached.staleUntil,
          });
          return staleValue;
        }
        const freshMs = value.availability.builds === 'ready'
          ? DETAIL_CACHE_FRESH_MS
          : value.availability.builds === 'collecting'
            ? DETAIL_CACHE_COLLECTING_MS
            : DETAIL_CACHE_RETRY_MS;
        this.detailCache.set(key, {
          value,
          freshUntil: loadedAt + freshMs,
          staleUntil: loadedAt + DETAIL_CACHE_STALE_MS,
        });
        return value;
      })
      .catch((error: unknown) => {
        const failedAt = Date.now();
        if (cached && cached.staleUntil > failedAt) {
          const staleValue = { ...cached.value, isStale: true };
          this.detailCache.set(key, {
            value: staleValue,
            freshUntil: failedAt + DETAIL_CACHE_RETRY_MS,
            staleUntil: cached.staleUntil,
          });
          return staleValue;
        }
        throw error;
      })
      .finally(() => {
        this.detailPending.delete(key);
      });

    this.detailPending.set(key, request);
    return request;
  }

  public async getMetaPositionSnapshot(rank?: RankBracket): Promise<MetaPositionSnapshot> {
    const patch = await this.getPatchInfo();
    const key = `${patch.name}:${rank ?? 'all'}`;
    const now = Date.now();
    const cached = this.positionCache.get(key);
    if (cached && cached.freshUntil > now) {
      return cached.value;
    }

    const pending = this.positionPending.get(key);
    if (pending) {
      return pending;
    }

    const request = this.loadMetaPositionSnapshot(patch.name, rank)
      .then((value) => {
        const loadedAt = Date.now();
        if (
          value.availability === 'collecting'
          && cached?.value.availability === 'ready'
          && cached.staleUntil > loadedAt
        ) {
          const staleValue = { ...cached.value, isStale: true };
          this.positionCache.set(key, {
            value: staleValue,
            freshUntil: loadedAt + POSITION_CACHE_RETRY_MS,
            staleUntil: cached.staleUntil,
          });
          return staleValue;
        }
        const freshMs = value.availability === 'ready'
          ? POSITION_CACHE_FRESH_MS
          : POSITION_CACHE_COLLECTING_MS;
        this.positionCache.set(key, {
          value,
          freshUntil: loadedAt + freshMs,
          staleUntil: loadedAt + POSITION_CACHE_STALE_MS,
        });
        return value;
      })
      .catch((error: unknown) => {
        const failedAt = Date.now();
        if (cached && cached.staleUntil > failedAt) {
          const staleValue = { ...cached.value, isStale: true };
          this.positionCache.set(key, {
            value: staleValue,
            freshUntil: failedAt + POSITION_CACHE_RETRY_MS,
            staleUntil: cached.staleUntil,
          });
          return staleValue;
        }
        throw error;
      })
      .finally(() => {
        this.positionPending.delete(key);
      });

    this.positionPending.set(key, request);
    return request;
  }

  public async getSnapshot(
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[] = [],
    prefetchedHeroes?: HeroMeta[],
  ): Promise<MetaSnapshot> {
    const fetchedAt = new Date().toISOString();
    const patchRequest = this.getPatchInfo().catch(() => undefined);
    const pairRequest = patchRequest.then((patch) =>
      patch
        ? this.getDraftPairSnapshot(patch.name, rank, enemyIds, allyIds)
        : undefined);
    const [heroes, patch, pairSnapshot, positionMeta] = await Promise.all([
      prefetchedHeroes ?? this.getHeroes(rank),
      patchRequest,
      pairRequest,
      this.getRecommendationPositionMeta(rank),
    ]);

    return {
      heroes,
      patch: patch?.name ?? 'unknown patch',
      fetchedAt,
      matchupByEnemy: pairSnapshot?.matchupByEnemy
        ?? new Map<number, Map<number, DraftPairStat>>(),
      synergyByAlly: pairSnapshot?.synergyByAlly
        ?? new Map<number, Map<number, DraftPairStat>>(),
      pairScope: pairSnapshot?.scope ?? null,
      matchupBaselineByHero: new Map(heroes.map((hero) => [
        hero.id,
        hero.winRate,
      ])),
      ...(positionMeta ? { positionMeta } : {}),
    };
  }

  private async getRecommendationPositionMeta(rank?: RankBracket) {
    let timeout: NodeJS.Timeout | undefined;
    const request = this.getMetaPositionSnapshot(rank).catch(() => undefined);
    try {
      return await Promise.race([
        request,
        new Promise<undefined>((resolve) => {
          timeout = setTimeout(
            () => resolve(undefined),
            Math.min(1_200, Math.max(600, this.config.timeoutMs)),
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async getDraftPairSnapshot(
    patch: string,
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[],
  ): Promise<DraftPairSnapshot> {
    const normalizedEnemies = [...new Set(enemyIds)].toSorted((left, right) => left - right);
    const normalizedAllies = [...new Set(allyIds)].toSorted((left, right) => left - right);
    const key = `${patch}:${rank ?? 'all'}:${normalizedEnemies.join(',')}:${normalizedAllies.join(',')}`;
    const now = Date.now();
    const cached = this.getCachedDraftPair(key);
    if (cached && cached.freshUntil > now) {
      return cached.value;
    }

    const pending = this.pairPending.get(key);
    if (pending) {
      return pending;
    }

    const request = this.loadDraftPairSnapshot(patch, rank, normalizedEnemies, normalizedAllies)
      .then((value) => {
        const loadedAt = Date.now();
        this.cacheDraftPair(key, {
          value,
          freshUntil: loadedAt + Math.max(this.config.cacheTtlMs, PAIR_CACHE_FRESH_MS),
          staleUntil: loadedAt + Math.max(this.config.cacheStaleMs, PAIR_CACHE_STALE_MS),
        });
        return value;
      })
      .catch(() => {
        const failedAt = Date.now();
        if (cached && cached.staleUntil > failedAt) {
          const staleValue = {
            ...cached.value,
            scope: {
              ...cached.value.scope,
              isStale: true,
            },
          };
          this.cacheDraftPair(key, {
            value: staleValue,
            freshUntil: Math.min(failedAt + PAIR_CACHE_RETRY_MS, cached.staleUntil),
            staleUntil: cached.staleUntil,
          });
          return staleValue;
        }
        const unavailable = this.emptyDraftPairSnapshot(patch, rank, 'unavailable');
        this.cacheDraftPair(key, {
          value: unavailable,
          freshUntil: failedAt + PAIR_CACHE_RETRY_MS,
          staleUntil: failedAt + PAIR_CACHE_RETRY_MS,
        });
        return unavailable;
      })
      .finally(() => {
        this.pairPending.delete(key);
      });

    this.pairPending.set(key, request);
    return request;
  }

  private getCachedDraftPair(key: string) {
    const cached = this.pairCache.get(key);
    if (!cached) {
      return undefined;
    }
    this.pairCache.delete(key);
    this.pairCache.set(key, cached);
    return cached;
  }

  private cacheDraftPair(key: string, entry: DraftPairCacheEntry) {
    this.pairCache.delete(key);
    this.pairCache.set(key, entry);
    while (this.pairCache.size > PAIR_CACHE_MAX_ENTRIES) {
      const oldestKey = this.pairCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.pairCache.delete(oldestKey);
    }
  }

  private async loadDraftPairSnapshot(
    patch: string,
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[],
  ): Promise<DraftPairSnapshot> {
    const patchLiteral = patch.replaceAll("'", "''");
    const enemyArray = `ARRAY[${enemyIds.join(',')}]::integer[]`;
    const allyArray = `ARRAY[${allyIds.join(',')}]::integer[]`;
    const rankPredicate = rank ? `average_rank = ${rank}` : 'TRUE';
    const branches = [
      [
        "SELECT 'matchup'::text AS relation, selected_id, candidate_id,",
        'NOT pub.radiant_win AS candidate_won, FLOOR(pub.avg_rank_tier / 10)::int AS average_rank',
        'FROM public_matches pub',
        'JOIN match_patch mp USING(match_id)',
        'CROSS JOIN LATERAL unnest(pub.radiant_team) selected_id',
        'CROSS JOIN LATERAL unnest(pub.dire_team) candidate_id',
        `WHERE mp.patch = '${patchLiteral}'`,
        `AND pub.radiant_team && ${enemyArray}`,
        `AND selected_id = ANY(${enemyArray})`,
      ].join(' '),
      [
        "SELECT 'matchup'::text AS relation, selected_id, candidate_id,",
        'pub.radiant_win AS candidate_won, FLOOR(pub.avg_rank_tier / 10)::int AS average_rank',
        'FROM public_matches pub',
        'JOIN match_patch mp USING(match_id)',
        'CROSS JOIN LATERAL unnest(pub.dire_team) selected_id',
        'CROSS JOIN LATERAL unnest(pub.radiant_team) candidate_id',
        `WHERE mp.patch = '${patchLiteral}'`,
        `AND pub.dire_team && ${enemyArray}`,
        `AND selected_id = ANY(${enemyArray})`,
      ].join(' '),
      ...(allyIds.length > 0
        ? [
            [
              "SELECT 'synergy'::text AS relation, selected_id, candidate_id,",
              'pub.radiant_win AS candidate_won, FLOOR(pub.avg_rank_tier / 10)::int AS average_rank',
              'FROM public_matches pub',
              'JOIN match_patch mp USING(match_id)',
              'CROSS JOIN LATERAL unnest(pub.radiant_team) selected_id',
              'CROSS JOIN LATERAL unnest(pub.radiant_team) candidate_id',
              `WHERE mp.patch = '${patchLiteral}'`,
              `AND pub.radiant_team && ${allyArray}`,
              `AND selected_id = ANY(${allyArray})`,
              'AND candidate_id <> selected_id',
            ].join(' '),
            [
              "SELECT 'synergy'::text AS relation, selected_id, candidate_id,",
              'NOT pub.radiant_win AS candidate_won, FLOOR(pub.avg_rank_tier / 10)::int AS average_rank',
              'FROM public_matches pub',
              'JOIN match_patch mp USING(match_id)',
              'CROSS JOIN LATERAL unnest(pub.dire_team) selected_id',
              'CROSS JOIN LATERAL unnest(pub.dire_team) candidate_id',
              `WHERE mp.patch = '${patchLiteral}'`,
              `AND pub.dire_team && ${allyArray}`,
              `AND selected_id = ANY(${allyArray})`,
              'AND candidate_id <> selected_id',
            ].join(' '),
          ]
        : []),
    ];
    const sql = [
      `WITH pair_observations AS (${branches.join(' UNION ALL ')})`,
      'SELECT relation, selected_id, candidate_id,',
      'COUNT(*)::int AS patch_games,',
      'SUM(CASE WHEN candidate_won THEN 1 ELSE 0 END)::int AS patch_wins,',
      `COUNT(*) FILTER (WHERE ${rankPredicate})::int AS rank_games,`,
      `SUM(CASE WHEN candidate_won AND ${rankPredicate} THEN 1 ELSE 0 END)::int AS rank_wins`,
      'FROM pair_observations',
      'GROUP BY relation, selected_id, candidate_id',
      'ORDER BY relation, selected_id, patch_games DESC',
    ].join(' ');
    const response = explorerPairResponseSchema.parse(await this.request(
      `/explorer?sql=${encodeURIComponent(sql)}`,
      Math.min(PAIR_QUERY_TIMEOUT_MS, Math.max(750, this.config.timeoutMs)),
    ));
    if (response.err) {
      throw new ExternalServiceError('Dota draft pair data is temporarily unavailable', {
        provider: 'OpenDota',
        cause: response.err,
      });
    }

    const snapshot = this.emptyDraftPairSnapshot(patch, rank, 'ready');
    for (const row of response.rows) {
      const target = row.relation === 'matchup'
        ? snapshot.matchupByEnemy
        : snapshot.synergyByAlly;
      const entries = target.get(row.selected_id) ?? new Map<number, DraftPairStat>();
      entries.set(row.candidate_id, {
        heroId: row.candidate_id,
        patchGames: row.patch_games,
        patchWins: row.patch_wins,
        rankGames: row.rank_games,
        rankWins: row.rank_wins,
      });
      target.set(row.selected_id, entries);
    }
    return snapshot;
  }

  private emptyDraftPairSnapshot(
    patch: string,
    rank: RankBracket | undefined,
    availability: DraftPairScope['availability'],
  ): DraftPairSnapshot {
    return {
      matchupByEnemy: new Map(),
      synergyByAlly: new Map(),
      scope: {
        patch,
        rank: rank ?? null,
        rankFilter: rank ? 'average_match_rank' : 'all_ranks',
        window: 'current_patch',
        fetchedAt: new Date().toISOString(),
        isStale: false,
        availability,
      },
    };
  }

  private async loadHeroDetail(hero: RawHero, patch: PatchMeta): Promise<HeroDetail> {
    const buildSection = await this.loadBuildSection(hero.id, patch.name);
    return {
      hero: this.toHeroMeta(hero),
      patch,
      generatedAt: new Date().toISOString(),
      isStale: false,
      rankWinRates: this.toRankWinRates(hero),
      ...buildSection,
    };
  }

  private async loadBuildSection(heroId: number, patch: string): Promise<BuildSection> {
    const [itemsResult, rowsResult] = await Promise.allSettled([
      this.getItems(),
      this.getBuildRows(heroId, patch),
    ]);
    if (itemsResult.status === 'rejected' || rowsResult.status === 'rejected') {
      return {
        builds: [],
        buildSampleSize: 0,
        availability: { builds: 'unavailable' },
      };
    }

    const { builds, sampleSize } = this.createBuildVariants(rowsResult.value, itemsResult.value);
    return {
      builds,
      buildSampleSize: sampleSize,
      availability: {
        builds: builds.length >= 2 ? 'ready' : 'collecting',
      },
    };
  }

  private createBuildVariants(
    rows: ExplorerBuildRow[],
    items: RawItems,
  ): { builds: HeroBuildVariant[]; sampleSize: number } {
    const itemsById = new Map<number, { item: RawItem; slug: string }>();
    for (const [slug, item] of Object.entries(items)) {
      itemsById.set(item.id, { item, slug });
    }

    const samples = rows.flatMap((row) => {
      const sample = this.toBuildSample(row, items, itemsById);
      return sample ? [sample] : [];
    });
    const groups = new Map<string, BuildGroup>();
    for (const sample of samples) {
      const tuple = sample.purchases
        .slice(0, BUILD_TUPLE_SIZE)
        .map((purchase) => purchase.slug);
      if (tuple.length < BUILD_TUPLE_SIZE) {
        continue;
      }
      const key = tuple.join('|');
      const group = groups.get(key) ?? { key, samples: [] };
      group.samples.push(sample);
      groups.set(key, group);
    }

    const supported = [...groups.values()]
      .filter((group) => group.samples.length >= BUILD_MIN_GAMES)
      .sort((left, right) => {
        const gameDifference = right.samples.length - left.samples.length;
        if (gameDifference !== 0) {
          return gameDifference;
        }
        const leftWinRate = left.samples.filter((sample) => sample.won).length / left.samples.length;
        const rightWinRate = right.samples.filter((sample) => sample.won).length / right.samples.length;
        return rightWinRate - leftWinRate || left.key.localeCompare(right.key);
      })
      .slice(0, BUILD_MAX_VARIANTS);

    return {
      builds: supported.map((group) => this.toBuildVariant(group)),
      sampleSize: samples.length,
    };
  }

  private toBuildSample(
    row: ExplorerBuildRow,
    items: RawItems,
    itemsById: Map<number, { item: RawItem; slug: string }>,
  ): BuildSample | null {
    const finalItemIds = new Set(
      [row.item_0, row.item_1, row.item_2, row.item_3, row.item_4, row.item_5]
        .filter((itemId): itemId is number => itemId !== null && itemId > 0),
    );
    const finalItemSlugs = new Set(
      [...finalItemIds].flatMap((itemId) => {
        const value = itemsById.get(itemId);
        return value ? [value.slug] : [];
      }),
    );
    const purchases = (row.purchase_log ?? [])
      .flatMap((entry) => {
        const parsed = purchaseEntrySchema.safeParse(entry);
        if (!parsed.success) {
          return [];
        }
        const item = items[parsed.data.key];
        if (
          item?.cost == null
          || item.cost < MAJOR_ITEM_MIN_COST
          || !item.dname
          || parsed.data.key.startsWith('recipe_')
        ) {
          return [];
        }
        const isComposite = item.created === true || Boolean(item.components?.length);
        if (!isComposite && !finalItemSlugs.has(parsed.data.key)) {
          return [];
        }
        return [{
          item,
          slug: parsed.data.key,
          purchaseSec: Math.max(0, Math.round(parsed.data.time)),
        }];
      })
      .sort((left, right) => left.purchaseSec - right.purchaseSec);

    return purchases.length >= BUILD_TUPLE_SIZE
      ? { won: row.won, purchases }
      : null;
  }

  private toBuildVariant(group: BuildGroup): HeroBuildVariant {
    const items: HeroBuildItem[] = [];
    const maxLength = Math.min(
      BUILD_ITEM_LIMIT,
      Math.max(...group.samples.map((sample) => sample.purchases.length)),
    );
    for (let order = 0; order < maxLength; order += 1) {
      const purchasesBySlug = new Map<string, MajorPurchase[]>();
      for (const sample of group.samples) {
        const purchase = sample.purchases[order];
        if (!purchase) {
          continue;
        }
        const purchases = purchasesBySlug.get(purchase.slug) ?? [];
        purchases.push(purchase);
        purchasesBySlug.set(purchase.slug, purchases);
      }
      const selected = [...purchasesBySlug.entries()]
        .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
        .at(0);
      if (!selected) {
        break;
      }
      const [, purchases] = selected;
      if (
        order >= BUILD_TUPLE_SIZE
        && (purchases.length < 2 || purchases.length / group.samples.length < 0.35)
      ) {
        break;
      }
      const purchase = purchases[0];
      if (!purchase) {
        break;
      }
      const times = purchases.map((value) => value.purchaseSec);
      items.push({
        id: purchase.item.id,
        slug: purchase.slug,
        name: purchase.item.dname ?? purchase.slug,
        imageUrl: this.toAssetUrl(purchase.item.img),
        order: order + 1,
        medianPurchaseSec: this.percentile(times, 0.5),
        p25PurchaseSec: this.percentile(times, 0.25),
        p75PurchaseSec: this.percentile(times, 0.75),
      });
    }

    const wins = group.samples.filter((sample) => sample.won).length;
    return {
      id: group.key,
      games: group.samples.length,
      wins,
      winRate: wins / group.samples.length,
      items,
      source: 'parsed_current_patch',
    };
  }

  private percentile(values: number[], percentile: number): number {
    const sorted = values.toSorted((left, right) => left - right);
    if (sorted.length === 0) {
      return 0;
    }
    const position = (sorted.length - 1) * percentile;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lower = sorted[lowerIndex] ?? 0;
    const upper = sorted[upperIndex] ?? lower;
    return Math.round(lower + (upper - lower) * (position - lowerIndex));
  }

  private toRankWinRates(hero: RawHero): RankWinRate[] {
    return RANK_BRACKETS.map((rank) => {
      const games = this.numberField(hero, `${rank}_pick`);
      const wins = this.numberField(hero, `${rank}_win`);
      return {
        rank,
        games,
        wins,
        winRate: games > 0 ? wins / games : null,
        window: 'rolling_7d',
      };
    });
  }

  private async getRawHeroes(): Promise<RawHero[]> {
    return this.heroesCache.get('hero-stats', async () =>
      heroStatsSchema.parse(await this.request('/heroStats')),
    );
  }

  private async getItems(): Promise<RawItems> {
    return this.itemsCache.get('items', async () =>
      itemsSchema.parse(await this.request('/constants/items')),
    );
  }

  private async loadMetaPositionSnapshot(
    patch: string,
    rank?: RankBracket,
  ): Promise<MetaPositionSnapshot> {
    const positionStats = await this.getPositionStats(patch, rank);
    const hasCompleteCoverage = new Set(positionStats.map((stat) => stat.position)).size === 5;
    if (rank && !hasCompleteCoverage) {
      const fallback = await this.getMetaPositionSnapshot();
      return {
        ...fallback,
        rank,
      };
    }
    return {
      patch,
      rank: rank ?? null,
      rankFilter: rank ? 'average_match_rank' : 'all_ranks',
      window: 'current_patch_30d',
      minimumGames: POSITION_MIN_GAMES,
      fetchedAt: new Date().toISOString(),
      isStale: false,
      availability: hasCompleteCoverage ? 'ready' : 'collecting',
      positionStats,
    };
  }

  private async getPositionStats(
    patch: string,
    rank?: RankBracket,
  ): Promise<HeroPositionStat[]> {
    const patchLiteral = patch.replaceAll("'", "''");
    const rankCondition = rank ? `AND FLOOR(pub.avg_rank_tier / 10) = ${rank}` : '';
    const sql = [
      'WITH recent_matches AS (',
      'SELECT m.match_id, m.radiant_win',
      'FROM matches m',
      'JOIN match_patch mp USING(match_id)',
      'JOIN public_matches pub USING(match_id)',
      `WHERE mp.patch = '${patchLiteral}'`,
      'AND m.version IS NOT NULL',
      `AND m.start_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '${POSITION_WINDOW_DAYS} days')::bigint`,
      rankCondition,
      'ORDER BY m.start_time DESC, m.match_id DESC',
      `LIMIT ${POSITION_MATCH_LIMIT}`,
      '), lane_players AS (',
      'SELECT pm.match_id, pm.hero_id, pm.player_slot, rm.radiant_win,',
      'pm.lane_role, pm.is_roaming,',
      'ROW_NUMBER() OVER (',
      'PARTITION BY pm.match_id, (pm.player_slot < 128), pm.lane_role',
      'ORDER BY COALESCE(pm.lh_t[11], pm.last_hits, 0) DESC,',
      'COALESCE(pm.gold_per_min, 0) DESC, pm.player_slot',
      ') AS lane_farm_rank',
      'FROM player_matches pm',
      'JOIN recent_matches rm USING(match_id)',
      'WHERE pm.hero_id > 0',
      'AND (pm.lane_role IN (1, 2, 3, 4) OR pm.is_roaming = TRUE)',
      '), classified AS (',
      'SELECT hero_id, player_slot, radiant_win,',
      'CASE',
      'WHEN is_roaming = TRUE OR lane_role = 4 THEN 4',
      'WHEN lane_role = 2 THEN 2',
      'WHEN lane_role = 1 AND lane_farm_rank = 1 THEN 1',
      'WHEN lane_role = 1 THEN 5',
      'WHEN lane_role = 3 AND lane_farm_rank = 1 THEN 3',
      'WHEN lane_role = 3 THEN 4',
      'ELSE NULL',
      'END AS position',
      'FROM lane_players',
      ')',
      'SELECT hero_id, position, COUNT(*)::int AS games,',
      'SUM(CASE WHEN (player_slot < 128) = radiant_win THEN 1 ELSE 0 END)::int AS wins',
      'FROM classified',
      'WHERE position IS NOT NULL',
      'GROUP BY hero_id, position',
      `HAVING COUNT(*) >= ${POSITION_MIN_GAMES}`,
      'ORDER BY position, games DESC',
    ].filter(Boolean).join(' ');
    const response = explorerPositionResponseSchema.parse(await this.request(
      `/explorer?sql=${encodeURIComponent(sql)}`,
      Math.max(this.config.timeoutMs, 20_000),
    ));
    if (response.err) {
      throw new ExternalServiceError('Dota position meta is temporarily unavailable', {
        provider: 'OpenDota',
        cause: response.err,
      });
    }
    return response.rows.map((row) => {
      const position: HeroPosition = row.position;
      return {
        heroId: row.hero_id,
        position,
        picks: row.games,
        wins: row.wins,
        winRate: row.wins / row.games,
        isApproximate: position !== 2,
        method: position === 2 ? 'lane_role' : 'lane_role_farm_priority',
      };
    });
  }

  private async getBuildRows(heroId: number, patch: string): Promise<ExplorerBuildRow[]> {
    const patchLiteral = patch.replaceAll("'", "''");
    const sql = [
      'SELECT pm.match_id, pm.item_0, pm.item_1, pm.item_2, pm.item_3, pm.item_4, pm.item_5,',
      'pm.purchase_log, ((pm.player_slot < 128) = m.radiant_win) AS won',
      'FROM player_matches pm',
      'JOIN matches m USING(match_id)',
      'JOIN match_patch mp USING(match_id)',
      'JOIN public_matches pub USING(match_id)',
      `WHERE pm.hero_id = ${heroId}`,
      `AND mp.patch = '${patchLiteral}'`,
      'AND m.version IS NOT NULL',
      'AND pm.purchase_log IS NOT NULL',
      'ORDER BY m.start_time DESC, pm.match_id DESC',
      `LIMIT ${BUILD_SAMPLE_LIMIT}`,
    ].join(' ');
    const response = explorerResponseSchema.parse(await this.request(
      `/explorer?sql=${encodeURIComponent(sql)}`,
      Math.max(this.config.timeoutMs, 20_000),
    ));
    if (response.err) {
      throw new ExternalServiceError('Dota build data is temporarily unavailable', {
        provider: 'OpenDota',
        cause: response.err,
      });
    }
    return response.rows;
  }

  private toAssetUrl(path: string | null | undefined): string | null {
    if (!path) {
      return null;
    }
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `https://cdn.cloudflare.steamstatic.com${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private toHeroMeta(hero: RawHero, rank?: RankBracket): HeroMeta {
    const rankedPicks = rank ? this.numberField(hero, `${rank}_pick`) : 0;
    const rankedWins = rank ? this.numberField(hero, `${rank}_win`) : 0;
    const picks = rank ? rankedPicks : hero.pub_pick;
    const wins = rank ? rankedWins : hero.pub_win;

    return {
      id: hero.id,
      name: hero.name.replace('npc_dota_hero_', ''),
      localizedName: hero.localized_name,
      primaryAttribute: hero.primary_attr,
      attackType: hero.attack_type,
      roles: hero.roles,
      imageUrl: `https://cdn.cloudflare.steamstatic.com${hero.img}`,
      iconUrl: `https://cdn.cloudflare.steamstatic.com${hero.icon}`,
      picks,
      wins,
      winRate: picks > 0 ? wins / picks : 0.5,
    };
  }

  private numberField(hero: RawHero, key: string) {
    const value = hero[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private async request(path: string, timeoutMs = this.config.timeoutMs): Promise<unknown> {
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`OpenDota responded with ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new ExternalServiceError('Dota meta data is temporarily unavailable', {
        provider: 'OpenDota',
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
