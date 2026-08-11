import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { ExternalServiceError } from '../../lib/errors.js';
import type {
  DraftSnapshotMaterialization,
  DraftSnapshotPairRow,
  DraftSnapshotPositionRow,
} from './draft-snapshot.repository.js';
import type {
  DraftDataPopulation,
  DraftDataSource,
  DraftSnapshotHero,
  HeroPosition,
  PatchMeta,
  RankBracket,
} from './heroes.types.js';

export const DRAFT_SNAPSHOT_PRIMARY_SOURCE = 'opendota_public_matches_explorer_positions' as const;
export const DRAFT_SNAPSHOT_FALLBACK_SOURCE = 'opendota_public_matches_lane_roles' as const;
export const DRAFT_PAIR_WINDOW = 'rolling_recent_public_matches' as const;
export const DRAFT_PRIMARY_POSITION_WINDOW = 'current_patch_parsed_lane_roles' as const;
export const DRAFT_POSITION_WINDOW = 'rolling_lane_role_scenarios' as const;

const PUBLIC_MATCH_MAX_PAGES = 35;
const PUBLIC_MATCH_DESIRED_RANKED_MATCHES = 1_000;
const PUBLIC_MATCH_MINIMUM_RANKED_MATCHES = 200;
const PUBLIC_MATCH_PAGE_DELAY_MS = 75;
const PUBLIC_MATCH_RATE_RESERVE = 5;
const PUBLIC_MATCH_TOTAL_BUDGET_MS = 60_000;
const SOURCE_CACHE_MS = 5 * 60 * 1_000;
const SOURCE_TIMEOUT_MS = 20_000;
const POSITION_MIN_GAMES = 10;
const POSITION_MATCH_LIMIT = 20_000;
const PARSED_POSITION_MIN_HERO_COVERAGE = 20;

const publicMatchSchema = z.object({
  match_id: z.coerce.number().int().positive(),
  radiant_win: z.boolean(),
  start_time: z.coerce.number().int().positive(),
  duration: z.coerce.number().int().nonnegative(),
  lobby_type: z.coerce.number().int().nonnegative(),
  game_mode: z.coerce.number().int().nonnegative(),
  avg_rank_tier: z.coerce.number().int().nonnegative().nullable().optional().default(null),
  radiant_team: z.array(z.coerce.number().int().nonnegative()),
  dire_team: z.array(z.coerce.number().int().nonnegative()),
}).loose();

const publicMatchesSchema = z.array(publicMatchSchema);

const laneRoleScenarioSchema = z.object({
  hero_id: z.coerce.number().int().positive(),
  lane_role: z.coerce.number().int().min(1).max(4),
  time: z.coerce.number().int().positive(),
  games: z.coerce.number().int().nonnegative(),
  wins: z.coerce.number().int().nonnegative(),
}).loose();

const laneRoleScenariosSchema = z.array(laneRoleScenarioSchema);

const parsedPositionRowSchema = z.object({
  hero_id: z.coerce.number().int().positive(),
  position: z.coerce.number().int().min(1).max(5),
  games: z.coerce.number().int().positive(),
  wins: z.coerce.number().int().nonnegative(),
}).loose();

const parsedPositionResponseSchema = z.object({
  rows: z.array(parsedPositionRowSchema).optional().default([]),
  err: z.string().nullable().optional(),
}).loose();

type PublicMatch = z.infer<typeof publicMatchSchema>;
type LaneRoleScenario = z.infer<typeof laneRoleScenarioSchema>;

type RateBudget = {
  minuteRemaining: number | null;
  dayRemaining: number | null;
  retryAfterSeconds: number | null;
};

type SourceResponse<T> = {
  value: T;
  rateBudget: RateBudget;
};

type DraftSourceSample = {
  matches: PublicMatch[];
  positionRows: DraftSnapshotPositionRow[];
  source: DraftDataSource;
  generatedAt: Date;
};

type CachedSourceSample = {
  value: DraftSourceSample;
  expiresAt: number;
};

function integerHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function rankBucket(match: PublicMatch): RankBracket | null {
  const rank = Math.floor((match.avg_rank_tier ?? 0) / 10);
  return rank >= 1 && rank <= 8 ? rank as RankBracket : null;
}

function isCompleteMatch(match: PublicMatch, patchStartedAt: number): boolean {
  if (
    match.start_time * 1_000 < patchStartedAt
    || match.duration < 300
    || match.radiant_team.length !== 5
    || match.dire_team.length !== 5
  ) {
    return false;
  }
  const heroes = [...match.radiant_team, ...match.dire_team];
  return heroes.every((heroId) => heroId > 0) && new Set(heroes).size === 10;
}

function matchesPopulation(match: PublicMatch, population: DraftDataPopulation): boolean {
  return population.gameModes.includes(match.game_mode)
    && (
      population.lobbyTypes.length === 0
      || population.lobbyTypes.includes(match.lobby_type)
    );
}

function addPairObservation(
  target: Map<string, DraftSnapshotPairRow>,
  relation: DraftSnapshotPairRow['relation'],
  selectedHeroId: number,
  candidateHeroId: number,
  rank: RankBracket | null,
  candidateWon: boolean,
): void {
  const add = (bucket: 0 | RankBracket): void => {
    const key = `${relation}:${selectedHeroId}:${candidateHeroId}:${bucket}`;
    const current = target.get(key);
    if (current) {
      current.games += 1;
      current.wins += candidateWon ? 1 : 0;
      return;
    }
    target.set(key, {
      relation,
      selectedHeroId,
      candidateHeroId,
      rankBucket: bucket,
      games: 1,
      wins: candidateWon ? 1 : 0,
    });
  };
  add(0);
  if (rank) add(rank);
}

function aggregatePairRows(matches: readonly PublicMatch[]): DraftSnapshotPairRow[] {
  const rows = new Map<string, DraftSnapshotPairRow>();
  for (const match of matches) {
    const rank = rankBucket(match);
    const teams = [
      { heroes: match.radiant_team, opponents: match.dire_team, won: match.radiant_win },
      { heroes: match.dire_team, opponents: match.radiant_team, won: !match.radiant_win },
    ];
    for (const team of teams) {
      for (const selectedHeroId of team.heroes) {
        for (const candidateHeroId of team.opponents) {
          addPairObservation(
            rows,
            'matchup',
            selectedHeroId,
            candidateHeroId,
            rank,
            !team.won,
          );
        }
        for (const candidateHeroId of team.heroes) {
          if (candidateHeroId !== selectedHeroId) {
            addPairObservation(
              rows,
              'synergy',
              selectedHeroId,
              candidateHeroId,
              rank,
              team.won,
            );
          }
        }
      }
    }
  }
  return [...rows.values()].toSorted((left, right) => (
    left.relation.localeCompare(right.relation)
    || left.selectedHeroId - right.selectedHeroId
    || left.candidateHeroId - right.candidateHeroId
    || left.rankBucket - right.rankBucket
  ));
}

const positionLaneRoles: Record<HeroPosition, readonly number[]> = {
  1: [1],
  2: [2],
  3: [3],
  4: [3, 4],
  5: [1],
};

function aggregatePositionRows(rows: readonly LaneRoleScenario[]): DraftSnapshotPositionRow[] {
  const byHeroAndLane = new Map<string, { games: number; wins: number }>();
  for (const row of rows) {
    if (row.wins > row.games) continue;
    const key = `${row.hero_id}:${row.lane_role}`;
    const current = byHeroAndLane.get(key) ?? { games: 0, wins: 0 };
    current.games += row.games;
    current.wins += row.wins;
    byHeroAndLane.set(key, current);
  }
  const heroIds = [...new Set(rows.map((row) => row.hero_id))].toSorted((left, right) => left - right);
  const result: DraftSnapshotPositionRow[] = [];
  for (const heroId of heroIds) {
    for (const position of [1, 2, 3, 4, 5] as const) {
      let games = 0;
      let wins = 0;
      for (const laneRole of positionLaneRoles[position]) {
        const value = byHeroAndLane.get(`${heroId}:${laneRole}`);
        games += value?.games ?? 0;
        wins += value?.wins ?? 0;
      }
      if (games >= POSITION_MIN_GAMES) {
        result.push({ heroId, position, rankBucket: 0, games, wins });
      }
    }
  }
  return result;
}

function populationHealth(matches: readonly PublicMatch[]): {
  matchCount: number;
  rankMatchCounts: Partial<Record<RankBracket, number>>;
} {
  const rankMatchCounts: Partial<Record<RankBracket, number>> = {};
  for (const match of matches) {
    const rank = rankBucket(match);
    if (rank) rankMatchCounts[rank] = (rankMatchCounts[rank] ?? 0) + 1;
  }
  return { matchCount: matches.length, rankMatchCounts };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class OpenDotaDraftSnapshotSource {
  private readonly cache = new Map<string, CachedSourceSample>();
  private readonly pending = new Map<string, Promise<DraftSourceSample>>();

  public constructor(private readonly config: AppConfig['openDota']) {}

  public async materialize(
    patch: PatchMeta,
    population: DraftDataPopulation,
    freshForMs: number,
    heroes: DraftSnapshotHero[],
  ): Promise<DraftSnapshotMaterialization> {
    const sample = await this.loadSample(patch);
    const matches = sample.matches.filter((match) => matchesPopulation(match, population));
    const health = populationHealth(matches);
    return {
      ...health,
      generatedAt: sample.generatedAt,
      expiresAt: new Date(sample.generatedAt.getTime() + freshForMs),
      source: sample.source,
      heroes: heroes.map((hero) => ({
        ...hero,
        roles: [...hero.roles],
        rankStats: Object.fromEntries(
          Object.entries(hero.rankStats).map(([rank, stats]) => [rank, { ...stats }]),
        ),
      })),
      pairRows: aggregatePairRows(matches),
      positionRows: sample.positionRows,
    };
  }

  private async loadSample(patch: PatchMeta): Promise<DraftSourceSample> {
    const cached = this.cache.get(patch.name);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.pending.get(patch.name);
    if (pending) return pending;
    const request = this.collectSample(patch)
      .then((value) => {
        this.cache.set(patch.name, { value, expiresAt: Date.now() + SOURCE_CACHE_MS });
        return value;
      })
      .finally(() => this.pending.delete(patch.name));
    this.pending.set(patch.name, request);
    return request;
  }

  private async collectSample(patch: PatchMeta): Promise<DraftSourceSample> {
    const patchStartedAt = patch.releasedAt ? Date.parse(patch.releasedAt) : Number.NaN;
    if (!Number.isFinite(patchStartedAt)) {
      throw new ExternalServiceError('Dota patch start time is unavailable', {
        provider: 'OpenDota',
        patch: patch.name,
      });
    }
    const [matches, positions] = await Promise.all([
      this.collectPublicMatches(patchStartedAt),
      this.collectPositions(patch.name),
    ]);
    return {
      matches,
      positionRows: positions.rows,
      source: positions.source,
      generatedAt: new Date(),
    };
  }

  private async collectPositions(patch: string): Promise<{
    rows: DraftSnapshotPositionRow[];
    source: DraftDataSource;
  }> {
    try {
      const rows = await this.collectParsedCurrentPatchPositions(patch);
      const coverageReady = [1, 2, 3, 4, 5].every((position) => (
        rows.filter((row) => row.position === position).length
          >= PARSED_POSITION_MIN_HERO_COVERAGE
      ));
      if (coverageReady) {
        return { rows, source: DRAFT_SNAPSHOT_PRIMARY_SOURCE };
      }
    } catch (error) {
      if (!(error instanceof ExternalServiceError)) throw error;
      return this.collectScenarioPositions();
    }
    return this.collectScenarioPositions();
  }

  private async collectScenarioPositions(): Promise<{
    rows: DraftSnapshotPositionRow[];
    source: DraftDataSource;
  }> {
    const scenarios = await this.request('/scenarios/laneRoles', laneRoleScenariosSchema);
    return {
      rows: aggregatePositionRows(scenarios.value),
      source: DRAFT_SNAPSHOT_FALLBACK_SOURCE,
    };
  }

  private async collectParsedCurrentPatchPositions(
    patch: string,
  ): Promise<DraftSnapshotPositionRow[]> {
    const patchLiteral = patch.replaceAll("'", "''");
    const sql = [
      'WITH patch_matches AS (',
      'SELECT m.match_id, m.radiant_win',
      'FROM matches m',
      'JOIN match_patch mp USING(match_id)',
      'JOIN public_matches pub USING(match_id)',
      `WHERE mp.patch = '${patchLiteral}'`,
      'AND pub.game_mode = ANY(ARRAY[1,22]::integer[])',
      'AND pub.duration >= 300',
      'AND cardinality(pub.radiant_team) = 5',
      'AND cardinality(pub.dire_team) = 5',
      'AND m.version IS NOT NULL',
      'ORDER BY m.start_time DESC, m.match_id DESC',
      `LIMIT ${POSITION_MATCH_LIMIT}`,
      '), lane_players AS (',
      'SELECT pm.match_id, pm.hero_id, pm.player_slot, selected.radiant_win,',
      'pm.lane_role, pm.is_roaming,',
      'ROW_NUMBER() OVER (',
      'PARTITION BY pm.match_id, (pm.player_slot < 128), pm.lane_role',
      'ORDER BY COALESCE(pm.lh_t[11], pm.last_hits, 0) DESC,',
      'COALESCE(pm.gold_per_min, 0) DESC, pm.player_slot',
      ') AS lane_farm_rank',
      'FROM player_matches pm',
      'JOIN patch_matches selected USING(match_id)',
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
      ') SELECT hero_id, position, COUNT(*)::int AS games,',
      'SUM(CASE WHEN (player_slot < 128) = radiant_win THEN 1 ELSE 0 END)::int AS wins',
      'FROM classified WHERE position IS NOT NULL',
      'GROUP BY hero_id, position',
      `HAVING COUNT(*) >= ${POSITION_MIN_GAMES}`,
      'ORDER BY hero_id, position',
    ].join(' ');
    const response = await this.request(
      `/explorer?sql=${encodeURIComponent(sql)}`,
      parsedPositionResponseSchema,
    );
    if (response.value.err) {
      throw new ExternalServiceError('Dota parsed position source is temporarily unavailable', {
        provider: 'OpenDota',
        cause: response.value.err,
      });
    }
    return response.value.rows.map((row) => ({
      heroId: row.hero_id,
      position: row.position as HeroPosition,
      rankBucket: 0,
      games: row.games,
      wins: row.wins,
    }));
  }

  private async collectPublicMatches(patchStartedAt: number): Promise<PublicMatch[]> {
    const matches = new Map<number, PublicMatch>();
    const deadline = Date.now() + PUBLIC_MATCH_TOTAL_BUDGET_MS;
    let cursor: number | null = null;
    let rankedMatches = 0;
    for (let page = 0; page < PUBLIC_MATCH_MAX_PAGES; page += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        if (rankedMatches >= PUBLIC_MATCH_MINIMUM_RANKED_MATCHES) break;
        throw new ExternalServiceError('OpenDota snapshot collection exceeded its time budget', {
          provider: 'OpenDota',
          retryAfterMs: 15 * 60 * 1_000,
        });
      }
      const path: string = cursor === null
        ? '/publicMatches'
        : `/publicMatches?less_than_match_id=${cursor}`;
      const response: SourceResponse<PublicMatch[]> = await this.request(
        path,
        publicMatchesSchema,
        remainingMs,
      );
      let nextCursor: number | null = null;
      for (const match of response.value) {
        nextCursor = nextCursor === null ? match.match_id : Math.min(nextCursor, match.match_id);
        if (!isCompleteMatch(match, patchStartedAt)) continue;
        const isNew = !matches.has(match.match_id);
        matches.set(match.match_id, match);
        if (isNew && match.lobby_type === 7 && match.game_mode === 22) rankedMatches += 1;
      }
      if (
        rankedMatches >= PUBLIC_MATCH_DESIRED_RANKED_MATCHES
        || response.value.length < 100
        || nextCursor === null
        || (cursor !== null && nextCursor >= cursor)
      ) {
        break;
      }
      const rateLow = (
        response.rateBudget.minuteRemaining !== null
        && response.rateBudget.minuteRemaining <= PUBLIC_MATCH_RATE_RESERVE
      ) || (
        response.rateBudget.dayRemaining !== null
        && response.rateBudget.dayRemaining <= PUBLIC_MATCH_RATE_RESERVE
      );
      if (rateLow) {
        if (rankedMatches >= PUBLIC_MATCH_MINIMUM_RANKED_MATCHES) break;
        throw new ExternalServiceError('OpenDota snapshot rate budget is temporarily exhausted', {
          provider: 'OpenDota',
          retryAfterMs: Math.max(
            15 * 60 * 1_000,
            (response.rateBudget.retryAfterSeconds ?? 0) * 1_000,
          ),
          minuteRemaining: response.rateBudget.minuteRemaining,
          dayRemaining: response.rateBudget.dayRemaining,
        });
      }
      cursor = nextCursor;
      await delay(PUBLIC_MATCH_PAGE_DELAY_MS);
    }
    return [...matches.values()];
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    timeBudgetMs = SOURCE_TIMEOUT_MS,
  ): Promise<SourceResponse<T>> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(Math.max(
          1,
          Math.min(timeBudgetMs, Math.max(this.config.timeoutMs, SOURCE_TIMEOUT_MS)),
        )),
      });
    } catch (error) {
      throw new ExternalServiceError('Dota snapshot source is temporarily unavailable', {
        provider: 'OpenDota',
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const rateBudget: RateBudget = {
      minuteRemaining: integerHeader(response.headers, 'x-rate-limit-remaining-minute'),
      dayRemaining: integerHeader(response.headers, 'x-rate-limit-remaining-day'),
      retryAfterSeconds: integerHeader(response.headers, 'retry-after'),
    };
    if (!response.ok) {
      throw new ExternalServiceError('Dota snapshot source is temporarily unavailable', {
        provider: 'OpenDota',
        status: response.status,
        retryAfterMs: Math.max(
          response.status === 429 ? 15 * 60 * 1_000 : 60 * 1_000,
          (rateBudget.retryAfterSeconds ?? 0) * 1_000,
        ),
      });
    }
    try {
      return { value: schema.parse(await response.json()), rateBudget };
    } catch (error) {
      throw new ExternalServiceError('Dota snapshot source returned an invalid response', {
        provider: 'OpenDota',
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
