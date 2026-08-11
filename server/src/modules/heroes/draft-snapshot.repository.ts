import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  draftMetaSnapshots,
  draftPairStats,
  draftPositionStats,
} from '../../db/schema.js';
import type {
  DraftDataSource,
  DraftDataPopulation,
  DraftDataPopulationId,
  DraftSnapshotHero,
  HeroPosition,
  RankBracket,
} from './heroes.types.js';
import {
  DRAFT_SNAPSHOT_FALLBACK_SOURCE,
  DRAFT_SNAPSHOT_PRIMARY_SOURCE,
} from './draft-snapshot-source.js';

export const draftDataPopulations: Record<DraftDataPopulationId, DraftDataPopulation> = {
  ranked_all_pick: {
    id: 'ranked_all_pick',
    version: 1,
    audience: 'opendota_recent_public_sample',
    lobbyTypes: [7],
    gameModes: [22],
    minimumMatches: 200,
  },
  public_all_pick: {
    id: 'public_all_pick',
    version: 1,
    audience: 'opendota_recent_public_sample',
    lobbyTypes: [],
    gameModes: [1, 22],
    minimumMatches: 50,
  },
};

export const primaryDraftDataPopulation = draftDataPopulations.ranked_all_pick;
export const fallbackDraftDataPopulation = draftDataPopulations.public_all_pick;

export type DraftSnapshotPairRow = {
  relation: 'matchup' | 'synergy';
  selectedHeroId: number;
  candidateHeroId: number;
  rankBucket: 0 | RankBracket;
  games: number;
  wins: number;
};

export type DraftSnapshotPositionRow = {
  heroId: number;
  position: HeroPosition;
  rankBucket: 0 | RankBracket;
  games: number;
  wins: number;
};

export type DraftSnapshotInfo = {
  id: string;
  patch: string;
  source: DraftDataSource;
  population: DraftDataPopulation;
  snapshotVersion: 1;
  matchCount: number;
  rankMatchCounts: Partial<Record<RankBracket, number>>;
  generatedAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  heroes: DraftSnapshotHero[];
};

export type StoredDraftSnapshot = DraftSnapshotInfo & {
  isStale: boolean;
  pairRows: DraftSnapshotPairRow[];
  positionRows: DraftSnapshotPositionRow[];
};

export type DraftSnapshotMaterialization = {
  source: DraftDataSource;
  matchCount: number;
  rankMatchCounts: Partial<Record<RankBracket, number>>;
  generatedAt: Date;
  expiresAt: Date;
  heroes: DraftSnapshotHero[];
  pairRows: DraftSnapshotPairRow[];
  positionRows: DraftSnapshotPositionRow[];
};

export type DraftSnapshotLookup = {
  patch?: string | undefined;
  population: DraftDataPopulationId;
  rank?: RankBracket | undefined;
  enemyHeroIds: number[];
  allyHeroIds: number[];
  includePositions?: boolean | undefined;
};

export type DraftSnapshotRepository = {
  findLatestInfo(
    patch: string | undefined,
    population: DraftDataPopulationId,
  ): Promise<DraftSnapshotInfo | null>;
  findLatestReady(lookup: DraftSnapshotLookup): Promise<StoredDraftSnapshot | null>;
  tryBegin(
    patch: string,
    population: DraftDataPopulationId,
  ): Promise<string | null>;
  abandonBuildingStartedBefore(before: Date): Promise<void>;
  complete(id: string, materialization: DraftSnapshotMaterialization): Promise<void>;
  fail(id: string, failureCode: string): Promise<void>;
  prune(retainAfter: Date): Promise<void>;
};

function toRankBracket(value: number): RankBracket | null {
  return value >= 1 && value <= 8 && Number.isInteger(value)
    ? value as RankBracket
    : null;
}

function toRankMatchCounts(value: Record<string, number>): Partial<Record<RankBracket, number>> {
  const result: Partial<Record<RankBracket, number>> = {};
  for (const [key, count] of Object.entries(value)) {
    const rank = toRankBracket(Number(key));
    if (rank && Number.isInteger(count) && count >= 0) {
      result[rank] = count;
    }
  }
  return result;
}

function toInfo(row: typeof draftMetaSnapshots.$inferSelect): DraftSnapshotInfo {
  const population = (
    draftDataPopulations as Partial<Record<string, DraftDataPopulation>>
  )[row.population];
  if (!population || row.populationVersion !== 1 || row.snapshotVersion !== 1) {
    throw new Error('Unsupported draft snapshot contract');
  }
  const source = row.source === DRAFT_SNAPSHOT_PRIMARY_SOURCE
    || row.source === DRAFT_SNAPSHOT_FALLBACK_SOURCE
    ? row.source
    : null;
  if (!source || !Array.isArray(row.heroes) || row.heroes.length === 0) {
    throw new Error('Invalid draft snapshot data contract');
  }
  return {
    id: row.id,
    patch: row.patch,
    source,
    population,
    snapshotVersion: 1,
    matchCount: row.matchCount,
    rankMatchCounts: toRankMatchCounts(row.rankMatchCounts),
    generatedAt: row.generatedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    heroes: row.heroes.map((hero) => ({
      ...hero,
      roles: [...hero.roles],
      rankStats: Object.fromEntries(
        Object.entries(hero.rankStats).map(([rank, stats]) => [rank, { ...stats }]),
      ),
    })),
  };
}

export class PostgresDraftSnapshotRepository implements DraftSnapshotRepository {
  public constructor(private readonly db: Database) {}

  public async hasReadySnapshot(): Promise<boolean> {
    const [row] = await this.db
      .select({ id: draftMetaSnapshots.id })
      .from(draftMetaSnapshots)
      .where(eq(draftMetaSnapshots.status, 'ready'))
      .limit(1);
    return row !== undefined;
  }

  public async findLatestInfo(
    patch: string | undefined,
    population: DraftDataPopulationId,
  ): Promise<DraftSnapshotInfo | null> {
    const [row] = await this.db
      .select()
      .from(draftMetaSnapshots)
      .where(and(
        ...(patch === undefined ? [] : [eq(draftMetaSnapshots.patch, patch)]),
        eq(draftMetaSnapshots.population, population),
        eq(draftMetaSnapshots.status, 'ready'),
      ))
      .orderBy(desc(draftMetaSnapshots.completedAt), desc(draftMetaSnapshots.createdAt))
      .limit(1);
    return row ? toInfo(row) : null;
  }

  public async findLatestReady(lookup: DraftSnapshotLookup): Promise<StoredDraftSnapshot | null> {
    const info = await this.findLatestInfo(lookup.patch, lookup.population);
    if (!info) {
      return null;
    }
    const rankBuckets: (0 | RankBracket)[] = lookup.rank === undefined
      ? [0]
      : [0, lookup.rank];
    const enemyHeroIds = [...new Set(lookup.enemyHeroIds)];
    const allyHeroIds = [...new Set(lookup.allyHeroIds)];
    const matchupQuery = enemyHeroIds.length === 0
      ? Promise.resolve([])
      : this.db
        .select()
        .from(draftPairStats)
        .where(and(
          eq(draftPairStats.snapshotId, info.id),
          eq(draftPairStats.relation, 'matchup'),
          inArray(draftPairStats.selectedHeroId, enemyHeroIds),
          inArray(draftPairStats.rankBucket, rankBuckets),
        ));
    const synergyQuery = allyHeroIds.length === 0
      ? Promise.resolve([])
      : this.db
        .select()
        .from(draftPairStats)
        .where(and(
          eq(draftPairStats.snapshotId, info.id),
          eq(draftPairStats.relation, 'synergy'),
          inArray(draftPairStats.selectedHeroId, allyHeroIds),
          inArray(draftPairStats.rankBucket, rankBuckets),
        ));
    const positionQuery = lookup.includePositions === false
      ? Promise.resolve([])
      : this.db
        .select()
        .from(draftPositionStats)
        .where(and(
          eq(draftPositionStats.snapshotId, info.id),
          inArray(draftPositionStats.rankBucket, rankBuckets),
        ));
    const [matchupRows, synergyRows, positionRows] = await Promise.all([
      matchupQuery,
      synergyQuery,
      positionQuery,
    ]);
    const now = Date.now();
    const expiresAt = info.expiresAt ? Date.parse(info.expiresAt) : Number.NaN;
    return {
      ...info,
      isStale: Number.isFinite(expiresAt) && expiresAt <= now,
      pairRows: [...matchupRows, ...synergyRows].map((row) => ({
        relation: row.relation,
        selectedHeroId: row.selectedHeroId,
        candidateHeroId: row.candidateHeroId,
        rankBucket: row.rankBucket as 0 | RankBracket,
        games: row.games,
        wins: row.wins,
      })),
      positionRows: positionRows.map((row) => ({
        heroId: row.heroId,
        position: row.position as HeroPosition,
        rankBucket: row.rankBucket as 0 | RankBracket,
        games: row.games,
        wins: row.wins,
      })),
    };
  }

  public async tryBegin(
    patch: string,
    population: DraftDataPopulationId,
  ): Promise<string | null> {
    try {
      const [row] = await this.db
        .insert(draftMetaSnapshots)
        .values({
          patch,
          population,
          populationVersion: 1,
          snapshotVersion: 1,
          status: 'building',
        })
        .returning({ id: draftMetaSnapshots.id });
      return row?.id ?? null;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code === '23505') {
        return null;
      }
      throw error;
    }
  }

  public async abandonBuildingStartedBefore(before: Date): Promise<void> {
    await this.db
      .update(draftMetaSnapshots)
      .set({ status: 'failed', failureCode: 'BUILD_LEASE_EXPIRED' })
      .where(and(
        eq(draftMetaSnapshots.status, 'building'),
        lt(draftMetaSnapshots.createdAt, before),
      ));
  }

  public async complete(
    id: string,
    materialization: DraftSnapshotMaterialization,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (let offset = 0; offset < materialization.pairRows.length; offset += 500) {
        const batch = materialization.pairRows.slice(offset, offset + 500);
        await tx.insert(draftPairStats).values(batch.map((row) => ({
          snapshotId: id,
          relation: row.relation,
          selectedHeroId: row.selectedHeroId,
          candidateHeroId: row.candidateHeroId,
          rankBucket: row.rankBucket,
          games: row.games,
          wins: row.wins,
        })));
      }
      for (let offset = 0; offset < materialization.positionRows.length; offset += 500) {
        const batch = materialization.positionRows.slice(offset, offset + 500);
        await tx.insert(draftPositionStats).values(batch.map((row) => ({
          snapshotId: id,
          heroId: row.heroId,
          position: row.position,
          rankBucket: row.rankBucket,
          games: row.games,
          wins: row.wins,
        })));
      }
      const [completed] = await tx
        .update(draftMetaSnapshots)
        .set({
          status: 'ready',
          source: materialization.source,
          heroes: materialization.heroes,
          matchCount: materialization.matchCount,
          rankMatchCounts: materialization.rankMatchCounts,
          generatedAt: materialization.generatedAt,
          expiresAt: materialization.expiresAt,
          completedAt: new Date(),
          failureCode: null,
        })
        .where(and(
          eq(draftMetaSnapshots.id, id),
          eq(draftMetaSnapshots.status, 'building'),
        ))
        .returning({ id: draftMetaSnapshots.id });
      if (!completed) {
        throw new Error('Draft snapshot lease is no longer active');
      }
    });
  }

  public async fail(id: string, failureCode: string): Promise<void> {
    await this.db
      .update(draftMetaSnapshots)
      .set({ status: 'failed', failureCode })
      .where(and(
        eq(draftMetaSnapshots.id, id),
        eq(draftMetaSnapshots.status, 'building'),
      ));
  }

  public async prune(retainAfter: Date): Promise<void> {
    await this.db.execute(sql`
      with ranked_ready as (
        select id, row_number() over (
          partition by population
          order by completed_at desc nulls last, created_at desc
        ) as retention_rank
        from draft_meta_snapshots
        where status = 'ready'
      )
      delete from draft_meta_snapshots
      where id in (
        select id from ranked_ready where retention_rank > 2
      )
    `);
    await this.db
      .delete(draftMetaSnapshots)
      .where(and(
        eq(draftMetaSnapshots.status, 'failed'),
        lt(draftMetaSnapshots.createdAt, retainAfter),
      ));
  }
}
