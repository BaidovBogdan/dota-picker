import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { ExternalServiceError, NotFoundError } from '../../lib/errors.js';
import { TtlCache } from './cache.js';
import {
  draftDataPopulations,
  fallbackDraftDataPopulation,
  primaryDraftDataPopulation,
  type DraftSnapshotPairRow,
  type DraftSnapshotPositionRow,
  type DraftSnapshotRepository,
  type StoredDraftSnapshot,
} from './draft-snapshot.repository.js';
import {
  DRAFT_PAIR_WINDOW,
  DRAFT_PRIMARY_POSITION_WINDOW,
  DRAFT_POSITION_WINDOW,
  DRAFT_SNAPSHOT_PRIMARY_SOURCE,
  OpenDotaDraftSnapshotSource,
} from './draft-snapshot-source.js';
import type {
  DraftDataHealth,
  DraftDataPopulation,
  DraftDataPopulationId,
  DraftPairScope,
  DraftPairStat,
  DraftSnapshotHero,
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
const DETAIL_CACHE_BOOTSTRAP_MS = 3_000;
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
const PAIR_FOREGROUND_WAIT_MS = 1_500;
const PAIR_QUERY_TIMEOUT_MS = 5_000;
const DRAFT_SNAPSHOT_FRESH_MS = 90 * 60 * 1_000;
const DRAFT_SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const DRAFT_SNAPSHOT_RETRY_MS = 60 * 1_000;
const DRAFT_SNAPSHOT_INSUFFICIENT_RETRY_MS = 90 * 60 * 1_000;
const DRAFT_SNAPSHOT_BUILD_LEASE_MS = 5 * 60 * 1_000;
const DRAFT_SNAPSHOT_MIN_RANK_POSITION_MATCHES = 50;
const DRAFT_SNAPSHOT_MIN_RANK_HERO_GAMES = 30;
const DRAFT_SNAPSHOT_MEMORY_MAX_ENTRIES = 256;
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

type HeroDetailLoad = {
  value: HeroDetail;
  failureReason?: string;
};

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
  value: Map<number, DraftPairStat>;
  scope: DraftPairScope;
  freshUntil: number;
  staleUntil: number;
};

type DraftPairRelation = 'matchup' | 'synergy';

type PersistedSnapshotResolution =
  | {
      kind: 'ready';
      snapshot: StoredDraftSnapshot;
      fallbackFrom: DraftDataPopulationId | null;
    }
  | {
      kind: 'not_ready';
      availability: 'collecting' | 'unavailable';
    };

type PersistedSnapshotPurpose = 'draft' | 'positions' | 'metadata';

export type OpenDotaDiagnostic = {
  operation: 'hero-detail-refresh';
  heroId: number;
  patch: string;
  durationMs: number;
  outcome: 'success' | 'fallback';
  availability: HeroDetail['availability']['builds'];
  reason?: string;
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
  private readonly pairPending = new Map<string, Promise<void>>();
  private readonly persistedSnapshotMemory = new Map<string, StoredDraftSnapshot>();
  private readonly draftSnapshotSource: OpenDotaDraftSnapshotSource;
  private readonly persistedSnapshotPrewarm = new Map<DraftDataPopulationId, Promise<void>>();
  private readonly persistedSnapshotRetryAfter = new Map<DraftDataPopulationId, number>();
  private persistedSnapshotPrewarmRun: Promise<void> | undefined;

  public constructor(
    private readonly config: AppConfig['openDota'],
    private readonly reportDiagnostic?: (diagnostic: OpenDotaDiagnostic) => void,
    private readonly draftSnapshots?: DraftSnapshotRepository,
  ) {
    this.heroesCache = new TtlCache(config.cacheTtlMs, config.cacheStaleMs);
    this.patchCache = new TtlCache(config.cacheTtlMs, config.cacheStaleMs);
    this.itemsCache = new TtlCache(
      Math.max(config.cacheTtlMs, ITEMS_CACHE_FRESH_MS),
      Math.max(config.cacheStaleMs, ITEMS_CACHE_STALE_MS),
    );
    this.draftSnapshotSource = new OpenDotaDraftSnapshotSource(config);
  }

  public async getHeroes(rank?: RankBracket): Promise<HeroMeta[]> {
    if (this.draftSnapshots) {
      const resolved = await this.resolvePersistedSnapshot(undefined, rank, [], [], 'metadata');
      if (resolved.kind === 'ready') {
        return resolved.snapshot.heroes.map((hero) => this.toPersistedHeroMeta(hero, rank));
      }
    }
    return this.getRemoteHeroes(rank);
  }

  private async getRemoteHeroes(rank?: RankBracket): Promise<HeroMeta[]> {
    const raw = await this.getRawHeroes();
    return raw.map((hero) => this.toHeroMeta(hero, rank));
  }

  private async getRemoteSnapshotHeroes(): Promise<DraftSnapshotHero[]> {
    const raw = await this.getRawHeroes();
    return raw.map((hero) => this.toDraftSnapshotHero(hero));
  }

  public async getPatch(): Promise<string> {
    if (this.draftSnapshots) {
      const resolved = await this.resolvePersistedSnapshot(
        undefined,
        undefined,
        [],
        [],
        'metadata',
      );
      if (resolved.kind === 'ready') return resolved.snapshot.patch;
    }
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
      return cached?.value ?? this.createCollectingHeroDetail(hero, patch);
    }

    const fallback = cached && cached.staleUntil > now
      ? { ...cached.value, isStale: true }
      : this.createCollectingHeroDetail(hero, patch);
    this.detailCache.set(key, {
      value: fallback,
      freshUntil: now + DETAIL_CACHE_BOOTSTRAP_MS,
      staleUntil: cached && cached.staleUntil > now
        ? cached.staleUntil
        : now + DETAIL_CACHE_STALE_MS,
    });
    this.refreshHeroDetail(key, hero, patch, cached);
    return fallback;
  }

  private refreshHeroDetail(
    key: string,
    hero: RawHero,
    patch: PatchMeta,
    previous: HeroDetailCacheEntry | undefined,
  ): void {
    const startedAt = performance.now();
    const request = this.loadHeroDetail(hero, patch)
      .then(({ value, failureReason }) => {
        const loadedAt = Date.now();
        if (
          value.availability.builds === 'unavailable'
          && previous
          && previous.value.builds.length > 0
          && previous.staleUntil > loadedAt
        ) {
          const staleValue = { ...previous.value, isStale: true };
          this.detailCache.set(key, {
            value: staleValue,
            freshUntil: loadedAt + DETAIL_CACHE_RETRY_MS,
            staleUntil: previous.staleUntil,
          });
          this.emitHeroDetailDiagnostic(
            hero.id,
            patch.name,
            startedAt,
            'fallback',
            staleValue.availability.builds,
            failureReason,
          );
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
        this.emitHeroDetailDiagnostic(
          hero.id,
          patch.name,
          startedAt,
          value.availability.builds === 'unavailable' ? 'fallback' : 'success',
          value.availability.builds,
          failureReason,
        );
        return value;
      })
      .catch((error: unknown) => {
        const failedAt = Date.now();
        if (previous && previous.staleUntil > failedAt) {
          const staleValue = { ...previous.value, isStale: true };
          this.detailCache.set(key, {
            value: staleValue,
            freshUntil: failedAt + DETAIL_CACHE_RETRY_MS,
            staleUntil: previous.staleUntil,
          });
          this.emitHeroDetailDiagnostic(
            hero.id,
            patch.name,
            startedAt,
            'fallback',
            staleValue.availability.builds,
            error,
          );
          return staleValue;
        }
        const unavailable = {
          ...this.createCollectingHeroDetail(hero, patch),
          availability: { builds: 'unavailable' as const },
        };
        this.detailCache.set(key, {
          value: unavailable,
          freshUntil: failedAt + DETAIL_CACHE_RETRY_MS,
          staleUntil: failedAt + DETAIL_CACHE_STALE_MS,
        });
        this.emitHeroDetailDiagnostic(
          hero.id,
          patch.name,
          startedAt,
          'fallback',
          unavailable.availability.builds,
          error,
        );
        return unavailable;
      })
      .finally(() => {
        this.detailPending.delete(key);
      });

    this.detailPending.set(key, request);
  }

  private emitHeroDetailDiagnostic(
    heroId: number,
    patch: string,
    startedAt: number,
    outcome: OpenDotaDiagnostic['outcome'],
    availability: OpenDotaDiagnostic['availability'],
    error?: unknown,
  ): void {
    try {
      this.reportDiagnostic?.({
        operation: 'hero-detail-refresh',
        heroId,
        patch,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        outcome,
        availability,
        ...(error
          ? {
              reason: error instanceof Error
                ? error.message
                : typeof error === 'string'
                  ? error
                  : 'Unknown error',
            }
          : {}),
      });
    } catch {
      return;
    }
  }

  public async getMetaPositionSnapshot(rank?: RankBracket): Promise<MetaPositionSnapshot> {
    if (this.draftSnapshots) {
      return this.getPersistedMetaPositionSnapshot(rank);
    }
    return this.getExplorerMetaPositionSnapshot(rank);
  }

  private async getExplorerMetaPositionSnapshot(rank?: RankBracket): Promise<MetaPositionSnapshot> {
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
    if (this.draftSnapshots) {
      return this.getPersistedSnapshot(rank, enemyIds, allyIds, prefetchedHeroes);
    }
    return this.getExplorerSnapshot(rank, enemyIds, allyIds, prefetchedHeroes);
  }

  public async prewarmDraftSnapshots(): Promise<void> {
    if (!this.draftSnapshots) {
      return;
    }
    if (this.persistedSnapshotPrewarmRun) {
      return this.persistedSnapshotPrewarmRun;
    }
    const request = this.runDraftSnapshotPrewarm()
      .finally(() => {
        this.persistedSnapshotPrewarmRun = undefined;
      });
    this.persistedSnapshotPrewarmRun = request;
    return request;
  }

  private async runDraftSnapshotPrewarm(): Promise<void> {
    if (!this.draftSnapshots) {
      return;
    }
    const patch = await this.getPatchInfo();
    let heroesRequest: Promise<DraftSnapshotHero[]> | undefined;
    const loadHeroes = (): Promise<DraftSnapshotHero[]> => {
      heroesRequest ??= this.getRemoteSnapshotHeroes();
      return heroesRequest;
    };
    const results = await Promise.allSettled(
      Object.values(draftDataPopulations).map((population) => (
        this.prewarmDraftPopulation(patch, population, loadHeroes)
      )),
    );
    await this.draftSnapshots.prune(
      new Date(Date.now() - DRAFT_SNAPSHOT_RETENTION_MS),
    );
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed) {
      throw failed.reason;
    }
  }

  private async getExplorerSnapshot(
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

  private async getPersistedSnapshot(
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[] = [],
    prefetchedHeroes?: HeroMeta[],
  ): Promise<MetaSnapshot> {
    const fetchedAt = new Date().toISOString();
    const resolved = await this.resolvePersistedSnapshot(
      undefined,
      rank,
      enemyIds,
      allyIds,
      'draft',
    );
    if (resolved.kind === 'not_ready') {
      if (resolved.availability === 'collecting') {
        void this.prewarmDraftSnapshots().catch(() => undefined);
      }
      const dataHealth = this.createUnavailableDataHealth(resolved.availability);
      return {
        heroes: [],
        patch: 'unknown patch',
        fetchedAt,
        matchupByEnemy: new Map(),
        synergyByAlly: new Map(),
        pairScope: {
          ...this.emptyDraftPairSnapshot(
            'unknown patch',
            rank,
            resolved.availability,
          ).scope,
          dataHealth,
        },
        matchupBaselineByHero: new Map(),
        positionMeta: this.createCollectingPersistedPositionSnapshot(
          'unknown patch',
          rank,
          dataHealth,
        ),
        dataHealth,
      };
    }

    const dataHealth = this.createPersistedDataHealth(
      resolved.snapshot,
      resolved.fallbackFrom,
      'ready',
    );
    const pairSnapshot = this.toPersistedDraftPairSnapshot(
      resolved.snapshot,
      rank,
      enemyIds,
      allyIds,
      dataHealth,
    );
    const positionMeta = this.toPersistedPositionSnapshot(
      resolved.snapshot,
      rank,
      dataHealth,
    );
    if (positionMeta.availability !== 'ready') {
      return {
        heroes: resolved.snapshot.heroes.map((hero) => this.toPersistedHeroMeta(hero, rank)),
        patch: resolved.snapshot.patch,
        fetchedAt,
        matchupByEnemy: pairSnapshot.matchupByEnemy,
        synergyByAlly: pairSnapshot.synergyByAlly,
        pairScope: pairSnapshot.scope,
        matchupBaselineByHero: new Map(),
        positionMeta,
        dataHealth,
      };
    }
    const heroes = prefetchedHeroes ?? resolved.snapshot.heroes.map(
      (hero) => this.toPersistedHeroMeta(hero, rank),
    );
    return {
      heroes,
      patch: resolved.snapshot.patch,
      fetchedAt,
      matchupByEnemy: pairSnapshot.matchupByEnemy,
      synergyByAlly: pairSnapshot.synergyByAlly,
      pairScope: pairSnapshot.scope,
      matchupBaselineByHero: new Map(heroes.map((hero) => [hero.id, hero.winRate])),
      positionMeta,
      dataHealth,
    };
  }

  private async getPersistedMetaPositionSnapshot(
    rank?: RankBracket,
  ): Promise<MetaPositionSnapshot> {
    const resolved = await this.resolvePersistedSnapshot(undefined, rank, [], [], 'positions');
    if (resolved.kind === 'not_ready') {
      if (resolved.availability === 'collecting') {
        void this.prewarmDraftSnapshots().catch(() => undefined);
      }
      const dataHealth = this.createUnavailableDataHealth(resolved.availability);
      return this.createCollectingPersistedPositionSnapshot(
        'unknown patch',
        rank,
        dataHealth,
      );
    }
    const dataHealth = this.createPersistedDataHealth(
      resolved.snapshot,
      resolved.fallbackFrom,
      'ready',
    );
    return this.toPersistedPositionSnapshot(resolved.snapshot, rank, dataHealth);
  }

  private async resolvePersistedSnapshot(
    patch: string | undefined,
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[],
    purpose: PersistedSnapshotPurpose,
  ): Promise<PersistedSnapshotResolution> {
    const draftSnapshots = this.draftSnapshots;
    if (!draftSnapshots) {
      return { kind: 'not_ready', availability: 'unavailable' };
    }
    const resolutionState = { repositoryUnavailable: false };
    const loadPopulation = async (population: DraftDataPopulation): Promise<{
      snapshot: StoredDraftSnapshot;
      fallbackFrom: DraftDataPopulationId | null;
    } | null> => {
      const memoryKey = this.persistedSnapshotMemoryKey(
        patch,
        population.id,
        rank,
        enemyIds,
        allyIds,
        purpose,
      );
      let snapshot: StoredDraftSnapshot | null;
      try {
        snapshot = await draftSnapshots.findLatestReady({
          patch,
          population: population.id,
          ...(rank === undefined ? {} : { rank }),
          enemyHeroIds: enemyIds,
          allyHeroIds: allyIds,
          includePositions: purpose !== 'metadata',
        });
        if (snapshot) {
          this.rememberPersistedSnapshot(memoryKey, snapshot);
        }
      } catch {
        snapshot = this.persistedSnapshotMemory.get(memoryKey) ?? null;
        if (!snapshot) {
          resolutionState.repositoryUnavailable = true;
        }
      }
      if (snapshot) {
        snapshot = this.withCurrentSnapshotFreshness(snapshot);
      }
      if (
        !snapshot
        || snapshot.matchCount < population.minimumMatches
        || !this.hasRequiredLoadedSnapshotEvidence(
          snapshot,
          purpose,
        )
      ) {
        return null;
      }
      return {
        snapshot,
        fallbackFrom: population.id === primaryDraftDataPopulation.id
          ? null
          : primaryDraftDataPopulation.id,
      };
    };
    const primary = await loadPopulation(primaryDraftDataPopulation);
    const fallback = await loadPopulation(fallbackDraftDataPopulation);
    const selectCurrentPatch = (candidates: NonNullable<typeof primary>[]) => {
      const latest = candidates.toSorted((left, right) => {
        const leftTime = Date.parse(left.snapshot.completedAt ?? left.snapshot.generatedAt ?? '');
        const rightTime = Date.parse(right.snapshot.completedAt ?? right.snapshot.generatedAt ?? '');
        return (Number.isFinite(rightTime) ? rightTime : 0)
          - (Number.isFinite(leftTime) ? leftTime : 0);
      })[0];
      if (!latest) return null;
      return candidates.find((candidate) => (
        candidate.snapshot.patch === latest.snapshot.patch
        && candidate.fallbackFrom === null
      )) ?? latest;
    };
    const candidates = [primary, fallback].flatMap((candidate) => (
      candidate === null ? [] : [candidate]
    ));
    const fresh = selectCurrentPatch(candidates.filter((candidate) => !candidate.snapshot.isStale));
    if (fresh) {
      return { kind: 'ready', ...fresh };
    }
    const stale = selectCurrentPatch(candidates);
    if (stale) {
      return { kind: 'ready', ...stale };
    }
    return {
      kind: 'not_ready',
      availability: resolutionState.repositoryUnavailable ? 'unavailable' : 'collecting',
    };
  }

  private persistedSnapshotMemoryKey(
    patch: string | undefined,
    population: DraftDataPopulationId,
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[],
    purpose: PersistedSnapshotPurpose,
  ): string {
    const normalizedEnemies = [...new Set(enemyIds)].toSorted((left, right) => left - right);
    const normalizedAllies = [...new Set(allyIds)].toSorted((left, right) => left - right);
    return [
      patch ?? 'latest',
      population,
      rank ?? 'all',
      normalizedEnemies.join(','),
      normalizedAllies.join(','),
      purpose,
    ].join(':');
  }

  private rememberPersistedSnapshot(key: string, snapshot: StoredDraftSnapshot): void {
    this.persistedSnapshotMemory.delete(key);
    this.persistedSnapshotMemory.set(key, snapshot);
    if (this.persistedSnapshotMemory.size <= DRAFT_SNAPSHOT_MEMORY_MAX_ENTRIES) {
      return;
    }
    const oldest = this.persistedSnapshotMemory.keys().next().value;
    if (oldest) {
      this.persistedSnapshotMemory.delete(oldest);
    }
  }

  private withCurrentSnapshotFreshness(
    snapshot: StoredDraftSnapshot,
  ): StoredDraftSnapshot {
    const expiresAt = snapshot.expiresAt ? Date.parse(snapshot.expiresAt) : Number.NaN;
    return {
      ...snapshot,
      isStale: !Number.isFinite(expiresAt) || expiresAt <= Date.now(),
    };
  }

  private createPersistedDataHealth(
    snapshot: StoredDraftSnapshot,
    fallbackFrom: DraftDataPopulationId | null,
    availability: DraftDataHealth['availability'],
  ): DraftDataHealth {
    return {
      snapshotId: snapshot.id,
      snapshotVersion: snapshot.snapshotVersion,
      source: snapshot.source,
      population: {
        ...snapshot.population,
        lobbyTypes: [...snapshot.population.lobbyTypes],
        gameModes: [...snapshot.population.gameModes],
      },
      fallbackFrom,
      matchCount: snapshot.matchCount,
      minimumMatches: snapshot.population.minimumMatches,
      rankMatchCounts: { ...snapshot.rankMatchCounts },
      generatedAt: snapshot.generatedAt,
      expiresAt: snapshot.expiresAt,
      availability,
      isStale: snapshot.isStale,
    };
  }

  private createUnavailableDataHealth(
    availability: Exclude<DraftDataHealth['availability'], 'ready'>,
  ): DraftDataHealth {
    return {
      snapshotId: null,
      snapshotVersion: 1,
      source: DRAFT_SNAPSHOT_PRIMARY_SOURCE,
      population: {
        ...primaryDraftDataPopulation,
        lobbyTypes: [...primaryDraftDataPopulation.lobbyTypes],
        gameModes: [...primaryDraftDataPopulation.gameModes],
      },
      fallbackFrom: null,
      matchCount: 0,
      minimumMatches: primaryDraftDataPopulation.minimumMatches,
      rankMatchCounts: {},
      generatedAt: null,
      expiresAt: null,
      availability,
      isStale: false,
    };
  }

  private toPersistedDraftPairSnapshot(
    snapshot: StoredDraftSnapshot,
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[],
    dataHealth: DraftDataHealth,
  ): DraftPairSnapshot {
    const allRankRows = new Map<string, DraftSnapshotPairRow>();
    const rankRows = new Map<string, DraftSnapshotPairRow>();
    for (const row of snapshot.pairRows) {
      const key = `${row.relation}:${row.selectedHeroId}:${row.candidateHeroId}`;
      if (row.rankBucket === 0) {
        allRankRows.set(key, row);
      } else if (row.rankBucket === rank) {
        rankRows.set(key, row);
      }
    }
    const result = this.emptyDraftPairSnapshot(
      snapshot.patch,
      rank,
      'ready',
    );
    const rankHasPopulationCoverage = rank !== undefined
      && (snapshot.rankMatchCounts[rank] ?? 0) >= DRAFT_SNAPSHOT_MIN_RANK_POSITION_MATCHES;
    result.scope = {
      ...result.scope,
      rankFilter: rankHasPopulationCoverage ? 'average_match_rank' : 'all_ranks',
      window: DRAFT_PAIR_WINDOW,
      fetchedAt: snapshot.generatedAt ?? new Date().toISOString(),
      isStale: snapshot.isStale,
      dataHealth,
    };
    const addRelation = (
      relation: 'matchup' | 'synergy',
      selectedIds: number[],
      target: Map<number, Map<number, DraftPairStat>>,
    ): void => {
      const selectedSet = new Set(selectedIds);
      for (const [key, allRank] of allRankRows) {
        if (allRank.relation !== relation || !selectedSet.has(allRank.selectedHeroId)) {
          continue;
        }
        const rankRow = rankRows.get(key);
        const values = target.get(allRank.selectedHeroId) ?? new Map<number, DraftPairStat>();
        values.set(allRank.candidateHeroId, {
          heroId: allRank.candidateHeroId,
          patchGames: allRank.games,
          patchWins: allRank.wins,
          rankGames: rankRow?.games ?? 0,
          rankWins: rankRow?.wins ?? 0,
        });
        target.set(allRank.selectedHeroId, values);
      }
    };
    addRelation('matchup', enemyIds, result.matchupByEnemy);
    addRelation('synergy', allyIds, result.synergyByAlly);
    return result;
  }

  private toPersistedPositionSnapshot(
    snapshot: StoredDraftSnapshot,
    rank: RankBracket | undefined,
    dataHealth: DraftDataHealth,
  ): MetaPositionSnapshot {
    const rankRows = rank === undefined
      ? []
      : snapshot.positionRows.filter((row) => row.rankBucket === rank);
    const rankPositions = new Set(rankRows.map((row) => row.position));
    const useRankRows = rank !== undefined
      && (snapshot.rankMatchCounts[rank] ?? 0) >= DRAFT_SNAPSHOT_MIN_RANK_POSITION_MATCHES
      && rankPositions.size === 5;
    const selectedRows = useRankRows
      ? rankRows
      : snapshot.positionRows.filter((row) => row.rankBucket === 0);
    const hasCompleteCoverage = new Set(selectedRows.map((row) => row.position)).size === 5;
    return {
      patch: snapshot.patch,
      rank: rank ?? null,
      rankFilter: useRankRows ? 'average_match_rank' : 'all_ranks',
      window: snapshot.source === DRAFT_SNAPSHOT_PRIMARY_SOURCE
        ? DRAFT_PRIMARY_POSITION_WINDOW
        : DRAFT_POSITION_WINDOW,
      minimumGames: POSITION_MIN_GAMES,
      fetchedAt: snapshot.generatedAt ?? new Date().toISOString(),
      isStale: snapshot.isStale,
      availability: hasCompleteCoverage ? 'ready' : 'collecting',
      positionStats: selectedRows.map((row) => ({
        heroId: row.heroId,
        position: row.position,
        picks: row.games,
        wins: row.wins,
        winRate: row.wins / row.games,
        isApproximate: row.position !== 2,
        method: snapshot.source === DRAFT_SNAPSHOT_PRIMARY_SOURCE
          ? row.position === 2
            ? 'lane_role'
            : 'lane_role_farm_priority'
          : row.position === 2
            ? 'lane_role_scenario'
            : 'lane_role_scenario_approximation',
      })),
      dataHealth,
    };
  }

  private createCollectingPersistedPositionSnapshot(
    patch: string,
    rank: RankBracket | undefined,
    dataHealth: DraftDataHealth,
  ): MetaPositionSnapshot {
    return {
      patch,
      rank: rank ?? null,
      rankFilter: 'all_ranks',
      window: DRAFT_POSITION_WINDOW,
      minimumGames: POSITION_MIN_GAMES,
      fetchedAt: new Date().toISOString(),
      isStale: false,
      availability: 'collecting',
      positionStats: [],
      dataHealth,
    };
  }

  private async prewarmDraftPopulation(
    patch: PatchMeta,
    population: DraftDataPopulation,
    loadHeroes: () => Promise<DraftSnapshotHero[]>,
  ): Promise<void> {
    if (!this.draftSnapshots) {
      return;
    }
    const pending = this.persistedSnapshotPrewarm.get(population.id);
    if (pending) {
      return pending;
    }
    if ((this.persistedSnapshotRetryAfter.get(population.id) ?? 0) > Date.now()) {
      return;
    }
    const current = await this.draftSnapshots.findLatestInfo(patch.name, population.id)
      .catch((error: unknown) => {
        this.persistedSnapshotRetryAfter.set(
          population.id,
          Date.now() + DRAFT_SNAPSHOT_RETRY_MS,
        );
        throw error;
      });
    const expiresAt = current?.expiresAt ? Date.parse(current.expiresAt) : Number.NaN;
    if (
      current
      && current.matchCount >= population.minimumMatches
      && Number.isFinite(expiresAt)
      && expiresAt > Date.now()
    ) {
      return;
    }
    const request = this.refreshPersistedDraftPopulation(
      patch,
      population,
      await loadHeroes(),
    )
      .catch((error: unknown) => {
        this.persistedSnapshotRetryAfter.set(
          population.id,
          Date.now() + this.draftSnapshotRetryDelayMs(error),
        );
        throw error;
      })
      .finally(() => {
        this.persistedSnapshotPrewarm.delete(population.id);
      });
    this.persistedSnapshotPrewarm.set(population.id, request);
    return request;
  }

  private async refreshPersistedDraftPopulation(
    patch: PatchMeta,
    population: DraftDataPopulation,
    heroes: DraftSnapshotHero[],
  ): Promise<void> {
    if (!this.draftSnapshots) {
      return;
    }
    await this.draftSnapshots.abandonBuildingStartedBefore(
      new Date(Date.now() - DRAFT_SNAPSHOT_BUILD_LEASE_MS),
    );
    const snapshotId = await this.draftSnapshots.tryBegin(patch.name, population.id);
    if (!snapshotId) {
      return;
    }
    try {
      const materialization = await this.draftSnapshotSource.materialize(
        patch,
        population,
        DRAFT_SNAPSHOT_FRESH_MS,
        heroes,
      );
      if (materialization.matchCount < population.minimumMatches) {
        this.persistedSnapshotRetryAfter.set(
          population.id,
          Date.now() + DRAFT_SNAPSHOT_INSUFFICIENT_RETRY_MS,
        );
        await this.draftSnapshots.fail(snapshotId, 'INSUFFICIENT_POPULATION_SAMPLE');
        return;
      }
      if (materialization.heroes.length === 0 || !this.hasRequiredDraftEvidence(
        materialization.pairRows,
        materialization.positionRows,
      )) {
        this.persistedSnapshotRetryAfter.set(
          population.id,
          Date.now() + DRAFT_SNAPSHOT_INSUFFICIENT_RETRY_MS,
        );
        await this.draftSnapshots.fail(snapshotId, 'SNAPSHOT_EVIDENCE_INCOMPLETE');
        return;
      }
      await this.draftSnapshots.complete(snapshotId, materialization);
    } catch (error) {
      await this.draftSnapshots.fail(
        snapshotId,
        error instanceof ExternalServiceError ? 'OPENDOTA_UNAVAILABLE' : 'SNAPSHOT_REFRESH_FAILED',
      ).catch(() => undefined);
      throw error;
    }
  }

  private draftSnapshotRetryDelayMs(error: unknown): number {
    if (!(error instanceof ExternalServiceError)) return DRAFT_SNAPSHOT_RETRY_MS;
    const details = error.details;
    if (typeof details !== 'object' || details === null || !('retryAfterMs' in details)) {
      return DRAFT_SNAPSHOT_RETRY_MS;
    }
    const retryAfterMs = Number((details as { retryAfterMs?: unknown }).retryAfterMs);
    return Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? Math.min(24 * 60 * 60 * 1_000, Math.max(DRAFT_SNAPSHOT_RETRY_MS, retryAfterMs))
      : DRAFT_SNAPSHOT_RETRY_MS;
  }

  private hasRequiredDraftEvidence(
    pairRows: readonly DraftSnapshotPairRow[],
    positionRows: readonly DraftSnapshotPositionRow[],
  ): boolean {
    return pairRows.some((row) => row.rankBucket === 0 && row.relation === 'matchup')
      && pairRows.some((row) => row.rankBucket === 0 && row.relation === 'synergy')
      && new Set(
        positionRows
          .filter((row) => row.rankBucket === 0)
          .map((row) => row.position),
      ).size === 5;
  }

  private hasRequiredLoadedSnapshotEvidence(
    snapshot: StoredDraftSnapshot,
    purpose: PersistedSnapshotPurpose,
  ): boolean {
    if (snapshot.heroes.length === 0) return false;
    if (purpose === 'metadata') return true;
    const positionsReady = new Set(
      snapshot.positionRows
        .filter((row) => row.rankBucket === 0)
        .map((row) => row.position),
    ).size === 5;
    return positionsReady;
  }

  private async getRecommendationPositionMeta(rank?: RankBracket) {
    if (this.draftSnapshots) {
      return this.getPersistedMetaPositionSnapshot(rank).catch(() => undefined);
    }
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
    if (normalizedEnemies.length === 0 && normalizedAllies.length === 0) {
      return this.emptyDraftPairSnapshot(patch, rank, 'ready');
    }

    const now = Date.now();
    const missingEnemies: number[] = [];
    const missingAllies: number[] = [];
    const pendingRequests = new Set<Promise<void>>();

    for (const selectedId of normalizedEnemies) {
      this.collectDraftPairRefresh(
        patch,
        rank,
        'matchup',
        selectedId,
        now,
        missingEnemies,
        pendingRequests,
      );
    }
    for (const selectedId of normalizedAllies) {
      this.collectDraftPairRefresh(
        patch,
        rank,
        'synergy',
        selectedId,
        now,
        missingAllies,
        pendingRequests,
      );
    }

    if (missingEnemies.length > 0 || missingAllies.length > 0) {
      const keys = [
        ...missingEnemies.map((selectedId) => (
          this.draftPairCacheKey(patch, rank, 'matchup', selectedId)
        )),
        ...missingAllies.map((selectedId) => (
          this.draftPairCacheKey(patch, rank, 'synergy', selectedId)
        )),
      ];
      const request = this.refreshDraftPairEntries(
        patch,
        rank,
        missingEnemies,
        missingAllies,
      ).finally(() => {
        for (const key of keys) {
          if (this.pairPending.get(key) === request) this.pairPending.delete(key);
        }
      });
      for (const key of keys) this.pairPending.set(key, request);
      pendingRequests.add(request);
    }

    await this.waitForDraftPairRefresh(pendingRequests);
    return this.composeDraftPairSnapshot(patch, rank, normalizedEnemies, normalizedAllies);
  }

  private async waitForDraftPairRefresh(requests: Set<Promise<void>>): Promise<void> {
    if (requests.size === 0) return;
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled(requests),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, PAIR_FOREGROUND_WAIT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private collectDraftPairRefresh(
    patch: string,
    rank: RankBracket | undefined,
    relation: DraftPairRelation,
    selectedId: number,
    now: number,
    missing: number[],
    pendingRequests: Set<Promise<void>>,
  ) {
    const key = this.draftPairCacheKey(patch, rank, relation, selectedId);
    const cached = this.getCachedDraftPair(key);
    if (cached && cached.freshUntil > now) return;
    const pending = this.pairPending.get(key);
    if (pending) {
      pendingRequests.add(pending);
      return;
    }
    missing.push(selectedId);
  }

  private async refreshDraftPairEntries(
    patch: string,
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[],
  ): Promise<void> {
    const selections = [
      ...enemyIds.map((selectedId) => ({ relation: 'matchup' as const, selectedId })),
      ...allyIds.map((selectedId) => ({ relation: 'synergy' as const, selectedId })),
    ];
    try {
      const snapshot = await this.loadDraftPairSnapshot(patch, rank, enemyIds, allyIds);
      const loadedAt = Date.now();
      for (const selection of selections) {
        const source = selection.relation === 'matchup'
          ? snapshot.matchupByEnemy
          : snapshot.synergyByAlly;
        this.cacheDraftPair(
          this.draftPairCacheKey(patch, rank, selection.relation, selection.selectedId),
          {
            value: new Map(source.get(selection.selectedId) ?? []),
            scope: { ...snapshot.scope },
            freshUntil: loadedAt + Math.max(this.config.cacheTtlMs, PAIR_CACHE_FRESH_MS),
            staleUntil: loadedAt + Math.max(this.config.cacheStaleMs, PAIR_CACHE_STALE_MS),
          },
        );
      }
    } catch {
      const failedAt = Date.now();
      const unavailableScope = this.emptyDraftPairSnapshot(
        patch,
        rank,
        'unavailable',
      ).scope;
      for (const selection of selections) {
        const key = this.draftPairCacheKey(
          patch,
          rank,
          selection.relation,
          selection.selectedId,
        );
        const cached = this.pairCache.get(key);
        if (
          cached?.scope.availability === 'ready'
          && cached.staleUntil > failedAt
        ) {
          this.cacheDraftPair(key, {
            value: cached.value,
            scope: { ...cached.scope, isStale: true },
            freshUntil: Math.min(failedAt + PAIR_CACHE_RETRY_MS, cached.staleUntil),
            staleUntil: cached.staleUntil,
          });
          continue;
        }
        this.cacheDraftPair(key, {
          value: new Map(),
          scope: { ...unavailableScope },
          freshUntil: failedAt + PAIR_CACHE_RETRY_MS,
          staleUntil: failedAt + PAIR_CACHE_RETRY_MS,
        });
      }
    }
  }

  private composeDraftPairSnapshot(
    patch: string,
    rank: RankBracket | undefined,
    enemyIds: number[],
    allyIds: number[],
  ): DraftPairSnapshot {
    const enemyEntries = enemyIds.map((selectedId) => ({
      selectedId,
      entry: this.getCachedDraftPair(
        this.draftPairCacheKey(patch, rank, 'matchup', selectedId),
      ),
    }));
    const allyEntries = allyIds.map((selectedId) => ({
      selectedId,
      entry: this.getCachedDraftPair(
        this.draftPairCacheKey(patch, rank, 'synergy', selectedId),
      ),
    }));
    const entries = [...enemyEntries, ...allyEntries];
    const now = Date.now();
    const availableEntries = entries.flatMap(({ entry }) => (
      entry?.scope.availability === 'ready' && entry.staleUntil > now ? [entry] : []
    ));
    const scopeEntries = entries.flatMap(({ entry }) => entry ? [entry] : []);
    const snapshot = this.emptyDraftPairSnapshot(
      patch,
      rank,
      availableEntries.length === entries.length ? 'ready' : 'unavailable',
    );
    snapshot.scope = {
      ...snapshot.scope,
      fetchedAt: scopeEntries
        .map((entry) => entry.scope.fetchedAt)
        .toSorted()[0] ?? snapshot.scope.fetchedAt,
      isStale: availableEntries.some(
        (entry) => entry.scope.isStale || entry.freshUntil <= now,
      ),
    };
    for (const { selectedId, entry } of enemyEntries) {
      if (entry?.scope.availability === 'ready' && entry.staleUntil > now) {
        snapshot.matchupByEnemy.set(selectedId, new Map(entry.value));
      }
    }
    for (const { selectedId, entry } of allyEntries) {
      if (entry?.scope.availability === 'ready' && entry.staleUntil > now) {
        snapshot.synergyByAlly.set(selectedId, new Map(entry.value));
      }
    }
    return snapshot;
  }

  private draftPairCacheKey(
    patch: string,
    rank: RankBracket | undefined,
    relation: DraftPairRelation,
    selectedId: number,
  ): string {
    return `${patch}:${rank ?? 'all'}:${relation}:${selectedId}`;
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
      ...(enemyIds.length > 0 ? [[
        "SELECT 'matchup'::text AS relation, selected_id, candidate_id,",
        'NOT pub.radiant_win AS candidate_won, FLOOR(pub.avg_rank_tier / 10)::int AS average_rank',
        'FROM public_matches pub',
        'JOIN match_patch mp USING(match_id)',
        'CROSS JOIN LATERAL unnest(pub.radiant_team) selected_id',
        'CROSS JOIN LATERAL unnest(pub.dire_team) candidate_id',
        `WHERE mp.patch = '${patchLiteral}'`,
        `AND pub.radiant_team && ${enemyArray}`,
        `AND selected_id = ANY(${enemyArray})`,
      ].join(' '), [
        "SELECT 'matchup'::text AS relation, selected_id, candidate_id,",
        'pub.radiant_win AS candidate_won, FLOOR(pub.avg_rank_tier / 10)::int AS average_rank',
        'FROM public_matches pub',
        'JOIN match_patch mp USING(match_id)',
        'CROSS JOIN LATERAL unnest(pub.dire_team) selected_id',
        'CROSS JOIN LATERAL unnest(pub.radiant_team) candidate_id',
        `WHERE mp.patch = '${patchLiteral}'`,
        `AND pub.dire_team && ${enemyArray}`,
        `AND selected_id = ANY(${enemyArray})`,
      ].join(' ')] : []),
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

  private async loadHeroDetail(hero: RawHero, patch: PatchMeta): Promise<HeroDetailLoad> {
    const { section, failureReason } = await this.loadBuildSection(hero.id, patch.name);
    return {
      value: {
        hero: this.toHeroMeta(hero),
        patch,
        generatedAt: new Date().toISOString(),
        isStale: false,
        rankWinRates: this.toRankWinRates(hero),
        ...section,
      },
      ...(failureReason ? { failureReason } : {}),
    };
  }

  private createCollectingHeroDetail(hero: RawHero, patch: PatchMeta): HeroDetail {
    return {
      hero: this.toHeroMeta(hero),
      patch,
      generatedAt: new Date().toISOString(),
      isStale: false,
      rankWinRates: this.toRankWinRates(hero),
      builds: [],
      buildSampleSize: 0,
      availability: { builds: 'collecting' },
    };
  }

  private async loadBuildSection(
    heroId: number,
    patch: string,
  ): Promise<{ section: BuildSection; failureReason?: string }> {
    const [itemsResult, rowsResult] = await Promise.allSettled([
      this.getItems(),
      this.getBuildRows(heroId, patch),
    ]);
    if (itemsResult.status === 'rejected' || rowsResult.status === 'rejected') {
      const failures: string[] = [];
      for (const result of [itemsResult, rowsResult]) {
        if (result.status !== 'rejected') continue;
        const reason: unknown = result.reason;
        failures.push(reason instanceof Error ? reason.message : 'Unknown error');
      }
      return {
        section: {
          builds: [],
          buildSampleSize: 0,
          availability: { builds: 'unavailable' },
        },
        failureReason: failures.join('; '),
      };
    }

    const { builds, sampleSize } = this.createBuildVariants(rowsResult.value, itemsResult.value);
    return {
      section: {
        builds,
        buildSampleSize: sampleSize,
        availability: {
          builds: builds.length >= 2 ? 'ready' : 'collecting',
        },
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
    const useRankStatistics = rank !== undefined
      && rankedPicks >= DRAFT_SNAPSHOT_MIN_RANK_HERO_GAMES;
    const picks = useRankStatistics ? rankedPicks : hero.pub_pick;
    const wins = useRankStatistics ? rankedWins : hero.pub_win;

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
      statisticsScope: useRankStatistics ? 'rank' : 'all_ranks',
    };
  }

  private toDraftSnapshotHero(hero: RawHero): DraftSnapshotHero {
    const rankStats: DraftSnapshotHero['rankStats'] = {};
    for (const rank of RANK_BRACKETS) {
      const picks = this.numberField(hero, `${rank}_pick`);
      const wins = this.numberField(hero, `${rank}_win`);
      if (picks > 0 && wins >= 0 && wins <= picks) rankStats[rank] = { picks, wins };
    }
    return { ...this.toHeroMeta(hero), rankStats };
  }

  private toPersistedHeroMeta(
    hero: DraftSnapshotHero,
    rank: RankBracket | undefined,
  ): HeroMeta {
    const { rankStats, ...base } = hero;
    const rankStat = rank === undefined ? undefined : rankStats[rank];
    if (!rankStat || rankStat.picks < DRAFT_SNAPSHOT_MIN_RANK_HERO_GAMES) {
      return { ...base, roles: [...base.roles], statisticsScope: 'all_ranks' };
    }
    return {
      ...base,
      roles: [...base.roles],
      picks: rankStat.picks,
      wins: rankStat.wins,
      winRate: rankStat.wins / rankStat.picks,
      statisticsScope: 'rank',
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
