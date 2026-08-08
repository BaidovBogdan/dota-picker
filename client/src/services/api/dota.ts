import { onlineManager } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { z } from 'zod';

import { fallbackHeroes, heroById } from '@/data/heroes';
import { translate } from '@/i18n';
import { bootstrapGuestSession } from '@/services/api/auth';
import {
  ApiError,
  apiRequest,
  getAuthGeneration,
  isAuthGenerationCurrent,
} from '@/services/api/client';
import { refreshNetworkState } from '@/services/network';
import { analyzeOffline } from '@/services/offline-engine';
import { resetToLocalGuest } from '@/services/session';
import {
  flushAppPersistence,
  getSessionScope,
  type PendingOfflineAnalysis,
  useAppStore,
} from '@/store/app-store';
import type {
  AnalysisResult,
  Draft,
  Hero,
  Position,
  RecommendationEvidence,
  RecommendationMetrics,
  RecommendationProvenance,
  RecognizedDraft,
} from '@/types/domain';

const positionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const backendHeroSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  localizedName: z.string().min(1).nullable().optional(),
  primaryAttribute: z.enum(['str', 'agi', 'int', 'all']).optional(),
  imageUrl: z.string().min(1).optional(),
  iconUrl: z.string().min(1).optional(),
  roles: z.array(z.string()).optional(),
  picks: z.number().nonnegative().optional(),
  wins: z.number().nonnegative().optional(),
  winRate: z.number().min(0).max(1).optional(),
});

const backendQuotaSchema = z.object({
  plan: z.enum(['free', 'pro']),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  nextRefillAt: z.string().min(1).nullable(),
  planExpiresAt: z.string().min(1).nullable(),
});

const backendRecognizedPickSchema = z.object({
  side: z.enum(['ally', 'enemy', 'unknown']),
  visualGroup: z.enum(['left', 'right']).optional(),
  slot: z.number().int().nonnegative(),
  heroId: z.number().int().positive().nullable(),
  heroName: z.string(),
  localizedName: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
});

const recommendationMetricsSchema = z.object({
  roleFit: z.number().min(0).max(1),
  counter: z.number().min(0).max(1),
  meta: z.number().min(0).max(1),
  synergy: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1).optional(),
  coverage: z.number().min(0).max(1).optional(),
  worstMatchup: z.number().min(0).max(1).optional(),
});

const recommendationScoreBreakdownSchema = z.object({
  role: z.number().finite(),
  matchup: z.number().finite(),
  meta: z.number().finite(),
  teamFit: z.number().finite(),
  reliability: z.number().finite(),
  advisor: z.number().finite(),
  diversity: z.number().finite(),
  total: z.number().finite(),
});

const recommendationPairEvidenceSchema = z.object({
  heroId: z.number().int().positive(),
  rankGames: z.number().int().nonnegative(),
  rankWins: z.number().int().nonnegative(),
  patchGames: z.number().int().nonnegative(),
  patchWins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  expectedWinRate: z.number().min(0).max(1),
  advantage: z.number().min(-1).max(1),
  reliability: z.number().min(0).max(1),
});

const recommendationEvidenceSchema = z.object({
  matchups: z.object({
    source: z.string().min(1),
    opponentsCovered: z.number().int().nonnegative(),
    opponentsTotal: z.number().int().nonnegative(),
    games: z.number().int().nonnegative(),
    minimumGames: z.number().int().nonnegative(),
    weightedWinRate: z.number().min(0).max(1).nullable(),
    expectedWinRate: z.number().min(0).max(1),
    patch: z.string().min(1).optional(),
    rank: z.number().int().min(1).max(8).nullable().optional(),
    rankScoped: z.boolean().optional(),
    rankOpponentsCovered: z.number().int().nonnegative().optional(),
    rankGames: z.number().int().nonnegative().optional(),
    patchGames: z.number().int().nonnegative().optional(),
    minimumPatchGames: z.number().int().nonnegative().optional(),
    isStale: z.boolean().optional(),
    availability: z.enum(['ready', 'unavailable']).optional(),
    byOpponent: z.array(recommendationPairEvidenceSchema).max(5).optional(),
  }),
  synergy: z
    .object({
      source: z.string().min(1),
      alliesCovered: z.number().int().nonnegative(),
      alliesTotal: z.number().int().nonnegative(),
      rankAlliesCovered: z.number().int().nonnegative(),
      games: z.number().int().nonnegative(),
      rankGames: z.number().int().nonnegative(),
      patchGames: z.number().int().nonnegative(),
      minimumGames: z.number().int().nonnegative(),
      weightedWinRate: z.number().min(0).max(1).nullable(),
      expectedWinRate: z.number().min(0).max(1).nullable(),
      pairScore: z.number().min(0).max(1),
      compositionScore: z.number().min(0).max(1),
      reliability: z.number().min(0).max(1),
      patch: z.string().min(1).nullable(),
      rank: z.number().int().min(1).max(8).nullable(),
      rankScoped: z.boolean(),
      isStale: z.boolean(),
      availability: z.enum(['ready', 'unavailable']),
      byAlly: z.array(recommendationPairEvidenceSchema).max(4),
    })
    .optional(),
  meta: z.object({
    source: z.string().min(1),
    games: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    winRate: z.number().min(0).max(1),
    rankScoped: z.boolean(),
    position: positionSchema,
    positionApproximate: z.boolean().nullable(),
    isStale: z.boolean(),
  }),
});

const recommendationProvenanceSchema = z.object({
  engineVersion: z.string().min(1),
  scoringVersion: z.string().min(1),
  aiAssisted: z.boolean(),
  model: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
  fallbackReason: z.string().min(1).optional(),
});

const backendRecommendationSchema = z.object({
  hero: backendHeroSchema,
  score: z.number().finite(),
  confidence: z.enum(['low', 'medium', 'high']),
  metrics: recommendationMetricsSchema.optional(),
  scoreBreakdown: recommendationScoreBreakdownSchema.optional(),
  evidence: recommendationEvidenceSchema.optional(),
  reasons: z.array(z.string()),
});

const backendAnalysisSchema = z.object({
  id: z.uuid(),
  source: z.enum(['manual', 'photo', 'overwolf']),
  input: z.object({
    source: z.enum(['manual', 'photo', 'overwolf']),
    position: positionSchema,
    allyHeroIds: z.array(z.number().int().positive()).max(4),
    enemyHeroIds: z.array(z.number().int().positive()).min(1).max(5),
    rank: z.number().int().optional(),
  }),
  result: z.object({
    patch: z.string().min(1),
    metaFetchedAt: z.string().min(1),
    recommendations: z.array(backendRecommendationSchema).min(1),
    provenance: recommendationProvenanceSchema.optional(),
  }),
  createdAt: z.string().min(1),
});

const heroesResponseSchema = z.object({
  heroes: z.array(backendHeroSchema),
  patch: z.string().optional(),
  fetchedAt: z.string().optional(),
});
const metaPositionStatSchema = z.object({
  heroId: z.number().int().positive(),
  position: positionSchema,
  picks: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  isApproximate: z.boolean(),
  method: z.enum(['lane_role', 'lane_role_farm_priority']),
});
const metaPositionResponseSchema = z.object({
  heroes: z.array(backendHeroSchema),
  patch: z.string().min(1),
  rank: positionSchema.or(z.literal(6)).or(z.literal(7)).or(z.literal(8)).nullable(),
  rankFilter: z.enum(['average_match_rank', 'all_ranks']),
  window: z.literal('current_patch_30d'),
  minimumGames: z.number().int().positive(),
  fetchedAt: z.string().min(1),
  isStale: z.boolean(),
  availability: z.enum(['ready', 'collecting']),
  positionStats: z.array(metaPositionStatSchema),
});
const heroDetailResponseSchema = z.object({
  hero: backendHeroSchema,
  patch: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    releasedAt: z.string().nullable(),
  }),
  generatedAt: z.string().min(1),
  isStale: z.boolean(),
  rankWinRates: z.array(
    z.object({
      rank: positionSchema.or(z.literal(6)).or(z.literal(7)).or(z.literal(8)),
      games: z.number().int().nonnegative(),
      wins: z.number().int().nonnegative(),
      winRate: z.number().min(0).max(1).nullable(),
      window: z.literal('rolling_7d'),
    }),
  ),
  builds: z.array(
    z.object({
      id: z.string().min(1),
      games: z.number().int().positive(),
      wins: z.number().int().nonnegative(),
      winRate: z.number().min(0).max(1),
      items: z.array(
        z.object({
          id: z.number().int().nonnegative(),
          slug: z.string().min(1),
          name: z.string().min(1),
          imageUrl: z.string().nullable(),
          order: z.number().int().positive(),
          medianPurchaseSec: z.number().int().nonnegative(),
          p25PurchaseSec: z.number().int().nonnegative(),
          p75PurchaseSec: z.number().int().nonnegative(),
        }),
      ),
      source: z.literal('parsed_current_patch'),
    }),
  ),
  buildSampleSize: z.number().int().nonnegative(),
  availability: z.object({
    builds: z.enum(['ready', 'collecting', 'unavailable']),
  }),
});
const photoResponseSchema = z.object({
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  recognized: z.array(backendRecognizedPickSchema).max(10),
});
const analysisResponseSchema = z.object({
  analysis: backendAnalysisSchema,
  quota: backendQuotaSchema,
});
const historyResponseSchema = z.object({
  items: z.array(backendAnalysisSchema),
  nextCursor: z.string().nullable(),
});
const quotaResponseSchema = z.object({ quota: backendQuotaSchema });

type BackendHero = z.infer<typeof backendHeroSchema>;
type BackendQuota = z.infer<typeof backendQuotaSchema>;
type BackendRecognizedPick = z.infer<typeof backendRecognizedPickSchema>;
type BackendAnalysis = z.infer<typeof backendAnalysisSchema>;

const applyServerQuota = (quota: BackendQuota) => {
  const store = useAppStore.getState();
  const ownerScope = getSessionScope(store.session, store.guestId);
  if (!ownerScope) return;
  store.setServerAttempts(
    {
      remaining: quota.remaining,
      maximum: quota.limit,
      nextRefreshAt: quota.nextRefillAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      planExpiresAt: quota.planExpiresAt,
    },
    ownerScope,
  );
};

const getQueuedOfflineResult = (idempotencyKey: string) => {
  const store = useAppStore.getState();
  const ownerScope = getSessionScope(store.session, store.guestId);
  if (!ownerScope) return undefined;
  const pending = store.pendingOfflineAnalyses.find(
    (item) => item.ownerScope === ownerScope && item.idempotencyKey === idempotencyKey,
  );
  return pending ? store.history.find((item) => item.id === pending.localResultId) : undefined;
};

const assertOfflinePlanActive = () => {
  const store = useAppStore.getState();
  const expiresAt = store.attempts.planExpiresAt;
  if (store.session?.plan === 'pro' && expiresAt && Date.parse(expiresAt) <= Date.now()) {
    store.refreshFreeAttempts();
    throw new ApiError(translate('errors.quotaExhausted'), 402, 'QUOTA_EXHAUSTED');
  }
};

const positionsFromRoles = (roles: string[] = []): Position[] => {
  const normalized = roles.map((role) => role.toLowerCase());
  const result = new Set<Position>();
  if (normalized.some((role) => role.includes('carry'))) result.add(1);
  if (normalized.some((role) => role.includes('nuker'))) result.add(2);
  if (normalized.some((role) => role.includes('durable') || role.includes('initiator')))
    result.add(3);
  if (normalized.some((role) => role.includes('support') || role.includes('disabler'))) {
    result.add(4);
    result.add(5);
  }
  return result.size ? [...result] : [1, 2, 3, 4, 5];
};

const mapHero = (item: BackendHero): Hero => {
  const local = heroById.get(item.id);
  const attributes = {
    str: 'strength',
    agi: 'agility',
    int: 'intelligence',
    all: 'universal',
  } as const;
  return {
    id: item.id,
    slug: local?.slug ?? item.name.replace('npc_dota_hero_', ''),
    name: item.localizedName ?? local?.name ?? item.name,
    attribute: item.primaryAttribute
      ? attributes[item.primaryAttribute]
      : (local?.attribute ?? 'universal'),
    positions: local?.positions ?? positionsFromRoles(item.roles),
    imageUrl: item.imageUrl ?? local?.imageUrl ?? '',
    ...(item.iconUrl ? { iconUrl: item.iconUrl } : {}),
    ...(typeof item.picks === 'number' ? { picks: item.picks } : {}),
    ...(typeof item.wins === 'number' ? { wins: item.wins } : {}),
    ...(typeof item.winRate === 'number' ? { winRate: item.winRate } : {}),
  };
};

const reasonKeys: Record<string, string> = {
  strong_counter: 'recommendation.reason.strongCounter',
  good_role_fit: 'recommendation.reason.roleFit',
  meta_favorite: 'recommendation.reason.meta',
  fills_team_need: 'recommendation.reason.teamNeed',
  strong_synergy: 'recommendation.reason.strongSynergy',
  stable_across_draft: 'recommendation.reason.stableAcrossDraft',
  limited_matchup_data: 'recommendation.reason.limitedData',
};

const mapRecommendationMetrics = (
  metrics: z.infer<typeof recommendationMetricsSchema>,
): RecommendationMetrics => ({
  roleFit: metrics.roleFit,
  counter: metrics.counter,
  meta: metrics.meta,
  synergy: metrics.synergy,
  ...(typeof metrics.reliability === 'number' ? { reliability: metrics.reliability } : {}),
  ...(typeof metrics.coverage === 'number' ? { coverage: metrics.coverage } : {}),
  ...(typeof metrics.worstMatchup === 'number' ? { worstMatchup: metrics.worstMatchup } : {}),
});

const mapRecommendationEvidence = (
  evidence: z.infer<typeof recommendationEvidenceSchema>,
): RecommendationEvidence => {
  const matchups = evidence.matchups;
  return {
    matchups: {
      source: matchups.source,
      opponentsCovered: matchups.opponentsCovered,
      opponentsTotal: matchups.opponentsTotal,
      games: matchups.games,
      minimumGames: matchups.minimumGames,
      weightedWinRate: matchups.weightedWinRate,
      expectedWinRate: matchups.expectedWinRate,
      ...(matchups.patch ? { patch: matchups.patch } : {}),
      ...(matchups.rank !== undefined ? { rank: matchups.rank } : {}),
      ...(typeof matchups.rankScoped === 'boolean' ? { rankScoped: matchups.rankScoped } : {}),
      ...(typeof matchups.rankOpponentsCovered === 'number'
        ? { rankOpponentsCovered: matchups.rankOpponentsCovered }
        : {}),
      ...(typeof matchups.rankGames === 'number' ? { rankGames: matchups.rankGames } : {}),
      ...(typeof matchups.patchGames === 'number' ? { patchGames: matchups.patchGames } : {}),
      ...(typeof matchups.minimumPatchGames === 'number'
        ? { minimumPatchGames: matchups.minimumPatchGames }
        : {}),
      ...(typeof matchups.isStale === 'boolean' ? { isStale: matchups.isStale } : {}),
      ...(matchups.availability ? { availability: matchups.availability } : {}),
      ...(matchups.byOpponent ? { byOpponent: matchups.byOpponent } : {}),
    },
    ...(evidence.synergy
      ? {
          synergy: {
            source: evidence.synergy.source,
            alliesCovered: evidence.synergy.alliesCovered,
            alliesTotal: evidence.synergy.alliesTotal,
            rankAlliesCovered: evidence.synergy.rankAlliesCovered,
            games: evidence.synergy.games,
            rankGames: evidence.synergy.rankGames,
            patchGames: evidence.synergy.patchGames,
            minimumGames: evidence.synergy.minimumGames,
            weightedWinRate: evidence.synergy.weightedWinRate,
            expectedWinRate: evidence.synergy.expectedWinRate,
            pairScore: evidence.synergy.pairScore,
            compositionScore: evidence.synergy.compositionScore,
            reliability: evidence.synergy.reliability,
            patch: evidence.synergy.patch,
            rank: evidence.synergy.rank,
            rankScoped: evidence.synergy.rankScoped,
            isStale: evidence.synergy.isStale,
            availability: evidence.synergy.availability,
            byAlly: evidence.synergy.byAlly,
          },
        }
      : {}),
    meta: evidence.meta,
  };
};

const mapRecommendationProvenance = (
  provenance: z.infer<typeof recommendationProvenanceSchema>,
): RecommendationProvenance => ({
  engineVersion: provenance.engineVersion,
  scoringVersion: provenance.scoringVersion,
  aiAssisted: provenance.aiAssisted,
  ...(provenance.model ? { model: provenance.model } : {}),
  ...(provenance.promptVersion ? { promptVersion: provenance.promptVersion } : {}),
  ...(provenance.fallbackReason ? { fallbackReason: provenance.fallbackReason } : {}),
});

const mapAnalysis = (analysis: BackendAnalysis): AnalysisResult => ({
  id: analysis.id,
  draft: {
    allies: analysis.input.allyHeroIds,
    enemies: analysis.input.enemyHeroIds,
    position: analysis.input.position,
    rank: analysis.input.rank ?? null,
    source: analysis.input.source,
    photoUri: null,
    updatedAt: analysis.createdAt,
  },
  recommendations: analysis.result.recommendations.slice(0, 3).map((item, index) => ({
    hero: mapHero(item.hero),
    score: item.score,
    label: index === 0 ? 'best' : index === 1 ? 'reliable' : 'fallback',
    confidence: item.confidence,
    ...(item.metrics ? { metrics: mapRecommendationMetrics(item.metrics) } : {}),
    ...(item.scoreBreakdown ? { scoreBreakdown: item.scoreBreakdown } : {}),
    ...(item.evidence ? { evidence: mapRecommendationEvidence(item.evidence) } : {}),
    reasons: item.reasons.map((reason) =>
      reasonKeys[reason] ? `i18n:${reasonKeys[reason]}` : reason,
    ),
    risks: item.evidence ? [] : ['i18n:recommendation.risk.comfort'],
    laneFit: analysis.input.rank
      ? `i18n:recommendation.lane.rank|${analysis.input.rank}`
      : 'i18n:recommendation.lane.general',
  })),
  patch: analysis.result.patch,
  confidence: analysis.result.recommendations[0]?.confidence ?? 'low',
  dataUpdatedAt: analysis.result.metaFetchedAt,
  createdAt: analysis.createdAt,
  source: 'server',
  ...(analysis.result.provenance
    ? { provenance: mapRecommendationProvenance(analysis.result.provenance) }
    : {}),
});

export async function getHeroes(): Promise<Hero[]> {
  try {
    const payload = await apiRequest<z.infer<typeof heroesResponseSchema>>('/heroes', {
      timeoutMs: 6_000,
      schema: heroesResponseSchema,
    });
    const heroes = payload.heroes.map(mapHero);
    if (!heroes.length)
      throw new ApiError(translate('errors.emptyHeroes'), 502, 'EMPTY_HERO_CATALOG');
    useAppStore.getState().setHeroes(heroes);
    return heroes;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
    useAppStore.getState().setHeroes(fallbackHeroes);
    return fallbackHeroes;
  }
}

export type MetaSnapshot = {
  hero: Hero | null;
  entries: MetaRotationEntry[];
  catalog: Hero[];
  patch: string;
  fetchedAt: string;
  rank: number | null;
  rankFilter: 'average_match_rank' | 'all_ranks';
  window: 'current_patch_30d';
  minimumGames: number;
  isStale: boolean;
  error: 'refresh_failed' | 'upstream_stale' | null;
  availability: 'ready' | 'collecting';
  positionStats: MetaPositionStat[];
};

export type MetaPositionStat = {
  heroId: number;
  position: Position;
  picks: number;
  wins: number;
  winRate: number;
  isApproximate: boolean;
  method: 'lane_role' | 'lane_role_farm_priority';
};

export type MetaRotationEntry = {
  position: Position;
  hero: Hero;
  picks: number;
  wins: number;
  winRate: number;
  isApproximate: boolean;
  isStale: boolean;
  method: 'lane_role' | 'lane_role_farm_priority';
};

export const META_SNAPSHOT_STALE_RETRY_MS = 5 * 60 * 1_000;
export const META_SNAPSHOT_COLLECTING_RETRY_MS = 30 * 1_000;

export const isMetaSnapshotIncomplete = (snapshot?: MetaSnapshot) =>
  Boolean(
    snapshot &&
    (snapshot.availability === 'collecting' ||
      snapshot.positionStats.length === 0 ||
      snapshot.catalog.length === 0),
  );

const selectMetaRotation = (
  heroes: Hero[],
  positionStats: MetaPositionStat[],
  isStale: boolean,
): MetaRotationEntry[] => {
  const heroesById = new Map(heroes.map((hero) => [hero.id, hero]));
  const usedHeroIds = new Set<number>();
  return ([1, 2, 3, 4, 5] as const).flatMap((position) => {
    const candidates = positionStats
      .filter((candidate) => candidate.position === position && heroesById.has(candidate.heroId))
      .sort(
        (left, right) =>
          right.winRate - left.winRate || right.picks - left.picks || left.heroId - right.heroId,
      );
    const stat =
      candidates.find((candidate) => !usedHeroIds.has(candidate.heroId)) ?? candidates[0];
    const hero = stat ? heroesById.get(stat.heroId) : undefined;
    if (!stat || !hero) return [];
    usedHeroIds.add(hero.id);
    return [{ hero, ...stat, isStale }];
  });
};

const rankMetaHeroes = (heroes: Hero[]) =>
  heroes
    .filter((hero) => (hero.picks ?? 0) > 0 && typeof hero.winRate === 'number')
    .sort((left, right) => {
      const winRateDelta = (right.winRate ?? 0) - (left.winRate ?? 0);
      const picksDelta = (right.picks ?? 0) - (left.picks ?? 0);
      return winRateDelta || picksDelta || left.id - right.id;
    });

const buildMetaCatalog = (heroes: Hero[], positionStats: MetaPositionStat[]): Hero[] => {
  const statsByHero = new Map<
    number,
    {
      picks: number;
      wins: number;
      positions: Set<Position>;
    }
  >();
  for (const stat of positionStats) {
    const aggregate = statsByHero.get(stat.heroId) ?? {
      picks: 0,
      wins: 0,
      positions: new Set<Position>(),
    };
    aggregate.picks += stat.picks;
    aggregate.wins += stat.wins;
    aggregate.positions.add(stat.position);
    statsByHero.set(stat.heroId, aggregate);
  }
  return rankMetaHeroes(
    heroes.flatMap((hero) => {
      const aggregate = statsByHero.get(hero.id);
      if (!aggregate || aggregate.picks <= 0) return [];
      return [
        {
          ...hero,
          positions: [...aggregate.positions].sort((left, right) => left - right),
          picks: aggregate.picks,
          wins: aggregate.wins,
          winRate: aggregate.wins / aggregate.picks,
        },
      ];
    }),
  );
};

const metaSnapshotCache = new Map<string, MetaSnapshot>();
const META_SNAPSHOT_CACHE_LIMIT = 2;

export function clearMetaSnapshotMemoryCache() {
  metaSnapshotCache.clear();
}

const cacheMetaSnapshot = (key: string, snapshot: MetaSnapshot) => {
  metaSnapshotCache.delete(key);
  metaSnapshotCache.set(key, snapshot);
  while (metaSnapshotCache.size > META_SNAPSHOT_CACHE_LIMIT) {
    const oldestKey = metaSnapshotCache.keys().next().value;
    if (oldestKey === undefined) break;
    metaSnapshotCache.delete(oldestKey);
  }
};

export async function getMetaSnapshot(rank?: number | null): Promise<MetaSnapshot> {
  const cacheKey = rank == null ? 'all' : String(rank);
  try {
    const suffix = rank ? `?rank=${rank}` : '';
    const payload = await apiRequest<z.infer<typeof metaPositionResponseSchema>>(
      `/heroes/meta-positions${suffix}`,
      {
        timeoutMs: 32_000,
        schema: metaPositionResponseSchema,
      },
    );
    if (payload.rank !== (rank ?? null)) {
      throw new ApiError(translate('errors.incompatibleResponse'), 502, 'META_RANK_MISMATCH');
    }
    const heroes = payload.heroes.map(mapHero);
    if (heroes.length) useAppStore.getState().setHeroes(heroes);
    const positionStats: MetaPositionStat[] = payload.positionStats;
    const entries = selectMetaRotation(heroes, positionStats, payload.isStale);
    const snapshot: MetaSnapshot = {
      hero: entries[0]?.hero ?? null,
      entries,
      catalog: buildMetaCatalog(heroes, positionStats),
      patch: payload.patch,
      fetchedAt: payload.fetchedAt,
      rank: payload.rank,
      rankFilter: payload.rankFilter,
      window: payload.window,
      minimumGames: payload.minimumGames,
      isStale: payload.isStale,
      error: payload.isStale ? 'upstream_stale' : null,
      availability: payload.availability,
      positionStats,
    };
    if (!isMetaSnapshotIncomplete(snapshot)) cacheMetaSnapshot(cacheKey, snapshot);
    return snapshot;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
    const cached = metaSnapshotCache.get(cacheKey);
    if (!cached) throw error;
    cacheMetaSnapshot(cacheKey, cached);
    return {
      ...cached,
      isStale: true,
      error: 'refresh_failed',
      entries: cached.entries.map((entry) => ({ ...entry, isStale: true })),
    };
  }
}

export type HeroRankWinRate = {
  rank: number;
  games: number;
  wins: number;
  winRate: number | null;
  window: 'rolling_7d';
};

export type HeroBuildItem = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  order: number;
  medianPurchaseSec: number;
  p25PurchaseSec: number;
  p75PurchaseSec: number;
};

export type HeroBuildVariant = {
  id: string;
  games: number;
  wins: number;
  winRate: number;
  items: HeroBuildItem[];
  source: 'parsed_current_patch';
};

export type HeroDetail = {
  hero: Hero;
  patch: {
    id: number;
    name: string;
    releasedAt: string | null;
  };
  generatedAt: string;
  isStale: boolean;
  rankWinRates: HeroRankWinRate[];
  builds: HeroBuildVariant[];
  buildSampleSize: number;
  availability: {
    builds: 'ready' | 'collecting' | 'unavailable';
  };
};

export async function getHeroDetail(heroId: number): Promise<HeroDetail> {
  const payload = await apiRequest<z.infer<typeof heroDetailResponseSchema>>(
    `/heroes/${heroId}/detail`,
    {
      timeoutMs: 30_000,
      schema: heroDetailResponseSchema,
    },
  );
  return {
    ...payload,
    hero: mapHero(payload.hero),
  };
}

export async function recognizePhoto(input: {
  uri: string;
  idempotencyKey: string;
  expectedUserId?: string;
  signal?: AbortSignal;
}): Promise<RecognizedDraft> {
  const expectedUserId = input.expectedUserId ?? useAppStore.getState().session?.userId;
  const form = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(input.uri, input.signal ? { signal: input.signal } : undefined);
    if (!response.ok) throw new ApiError(translate('errors.photoRead'), 0, 'PHOTO_READ_ERROR');
    const sourceBlob = await response.blob();
    const inferredType = input.uri.startsWith('data:image/png')
      ? 'image/png'
      : input.uri.startsWith('data:image/webp')
        ? 'image/webp'
        : 'image/jpeg';
    const type = ['image/jpeg', 'image/png', 'image/webp'].includes(sourceBlob.type)
      ? sourceBlob.type
      : inferredType;
    const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const uploadBlob = sourceBlob.type === type ? sourceBlob : new Blob([sourceBlob], { type });
    form.append('image', uploadBlob, `draft.${extension}`);
  } else {
    const imageFile = new File(input.uri);
    const imageType = imageFile.type.toLowerCase();
    const extension =
      imageType === 'image/png' ? 'png' : imageType === 'image/webp' ? 'webp' : 'jpg';
    form.append('image', imageFile, `draft.${extension}`);
  }
  const payload = await apiRequest<z.infer<typeof photoResponseSchema>>(
    '/analyses/photo/recognize',
    {
      method: 'POST',
      body: form,
      headers: { 'Idempotency-Key': input.idempotencyKey },
      ...(input.signal ? { signal: input.signal } : {}),
      timeoutMs: 40_000,
      schema: photoResponseSchema,
    },
  );
  if (!expectedUserId || useAppStore.getState().session?.userId !== expectedUserId) {
    throw new ApiError(translate('errors.authChanged'), 0, 'AUTH_OPERATION_STALE');
  }

  const assigned = payload.recognized.filter(
    (item): item is BackendRecognizedPick & { heroId: number; side: 'ally' | 'enemy' } =>
      item.heroId !== null && item.side !== 'unknown' && !item.needsReview,
  );
  const neutralPicks = payload.recognized
    .filter((item) => item.side === 'unknown' || item.heroId === null || item.needsReview)
    .map((item) => ({
      heroId: item.heroId,
      name: item.localizedName ?? item.heroName,
      ...(item.visualGroup ? { visualGroup: item.visualGroup } : {}),
      slot: item.slot,
      confidence: item.confidence,
      needsReview: item.needsReview,
    }));
  return {
    allies: assigned.filter((item) => item.side === 'ally').map((item) => item.heroId),
    enemies: assigned.filter((item) => item.side === 'enemy').map((item) => item.heroId),
    neutralPicks,
    confidence: payload.recognized.length
      ? payload.recognized.reduce((sum, item) => sum + item.confidence, 0) /
        payload.recognized.length
      : 0,
    warnings: [
      ...(payload.quality === 'partial' ? [translate('photo.warning.partial')] : []),
      ...(payload.quality === 'too_blurry' ? [translate('photo.warning.blurry')] : []),
      ...(payload.quality === 'not_dota' ? [translate('photo.warning.notDota')] : []),
      ...(neutralPicks.length > 0 ? [translate('photo.warning.reviewSides')] : []),
    ],
  };
}

export async function analyzeDraft(
  draft: Draft,
  idempotencyKey: string,
  options: { expectedUserId?: string; signal?: AbortSignal; applyQuota?: boolean } = {},
): Promise<AnalysisResult> {
  const expectedUserId = options.expectedUserId ?? useAppStore.getState().session?.userId;
  if (!draft.position || draft.enemies.length === 0) {
    throw new ApiError(translate('errors.validationDraft'), 422, 'VALIDATION_ERROR');
  }
  if (!(await refreshNetworkState())) {
    assertOfflinePlanActive();
    return getQueuedOfflineResult(idempotencyKey) ?? analyzeOffline(draft);
  }

  try {
    const payload = await apiRequest<z.infer<typeof analysisResponseSchema>>('/analyses/manual', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        source: draft.source,
        position: draft.position,
        allyHeroIds: draft.allies,
        enemyHeroIds: draft.enemies,
        ...(draft.rank ? { rank: draft.rank } : {}),
      }),
      ...(options.signal ? { signal: options.signal } : {}),
      timeoutMs: 25_000,
      schema: analysisResponseSchema,
    });
    if (!expectedUserId || useAppStore.getState().session?.userId !== expectedUserId) {
      throw new ApiError(translate('errors.staleSession'), 0, 'AUTH_OPERATION_STALE');
    }
    if (options.applyQuota !== false) {
      applyServerQuota(payload.quota);
      const session = useAppStore.getState().session;
      if (session && session.plan !== payload.quota.plan) {
        useAppStore.getState().setSession({ ...session, plan: payload.quota.plan });
      }
    }
    return mapAnalysis(payload.analysis);
  } catch (error) {
    if (
      expectedUserId &&
      useAppStore.getState().session?.userId === expectedUserId &&
      error instanceof ApiError &&
      (error.code === 'QUOTA_EXHAUSTED' || error.status === 402)
    ) {
      const store = useAppStore.getState();
      const attempts = store.serverAttempts ?? store.attempts;
      const details =
        error.details && typeof error.details === 'object'
          ? (error.details as { nextRefillAt?: unknown })
          : null;
      const ownerScope = getSessionScope(store.session, store.guestId);
      const nextAttempts = {
        ...attempts,
        remaining: 0,
        nextRefreshAt:
          typeof details?.nextRefillAt === 'string' ? details.nextRefillAt : attempts.nextRefreshAt,
      };
      if (ownerScope) store.setServerAttempts(nextAttempts, ownerScope);
      else store.setAttempts(nextAttempts);
    }
    if (
      error instanceof ApiError &&
      (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') &&
      (!expectedUserId || useAppStore.getState().session?.userId === expectedUserId)
    ) {
      assertOfflinePlanActive();
      return getQueuedOfflineResult(idempotencyKey) ?? analyzeOffline(draft);
    }
    throw error;
  }
}

export async function getServerHistory() {
  const payload = await apiRequest<z.infer<typeof historyResponseSchema>>(
    '/analyses/history?limit=50',
    { schema: historyResponseSchema },
  );
  return payload.items.map(mapAnalysis);
}

let pendingSync: Promise<void> | null = null;
let pendingSyncRequested = false;
const IDEMPOTENCY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const NON_RETRYABLE_OFFLINE_REPLAY_CODES = new Set([
  'HERO_NOT_FOUND',
  'INVALID_DRAFT',
  'VALIDATION_ERROR',
  'IDEMPOTENCY_KEY_REUSED',
]);

type OfflineReplayOutcome = 'resolved' | 'discarded' | 'halt';

const refreshAuthoritativeQuota = async (expectedUserId: string, authGeneration: number) => {
  const payload = await apiRequest<z.infer<typeof quotaResponseSchema>>('/quota', {
    schema: quotaResponseSchema,
  });
  const store = useAppStore.getState();
  if (
    !isAuthGenerationCurrent(authGeneration) ||
    store.session?.userId !== expectedUserId
  ) {
    return;
  }
  applyServerQuota(payload.quota);
  if (store.session.plan !== payload.quota.plan) {
    store.setSession({ ...store.session, plan: payload.quota.plan });
  }
};

const selectPendingOfflineAnalyses = (ownerScope: string) =>
  useAppStore
    .getState()
    .pendingOfflineAnalyses.filter((item) => item.ownerScope === ownerScope);

const isOfflineReplayContextCurrent = (
  expectedUserId: string,
  ownerScope: string,
  authGeneration: number,
) => {
  const store = useAppStore.getState();
  return (
    isAuthGenerationCurrent(authGeneration) &&
    store.session?.userId === expectedUserId &&
    getSessionScope(store.session, store.guestId) === ownerScope
  );
};

const replayPendingOfflineAnalysis = async (
  pending: PendingOfflineAnalysis,
  expectedUserId: string,
  ownerScope: string,
  authGeneration: number,
): Promise<OfflineReplayOutcome> => {
  const firstReplayAt = pending.firstReplayAt ? Date.parse(pending.firstReplayAt) : Number.NaN;
  if (
    Number.isFinite(firstReplayAt) &&
    Date.now() - firstReplayAt >= IDEMPOTENCY_RETRY_WINDOW_MS
  ) {
    useAppStore.getState().rejectOfflineAnalysis(pending.localResultId);
    return 'discarded';
  }

  if (!pending.firstReplayAt || !Number.isFinite(firstReplayAt)) {
    const replayedAt = new Date().toISOString();
    useAppStore.getState().setOfflineAnalysisReplay(pending.localResultId, replayedAt);
    try {
      await flushAppPersistence();
    } catch {
      if (!isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration)) {
        return 'halt';
      }
      useAppStore.getState().setOfflineAnalysisReplay(pending.localResultId, null);
      return 'halt';
    }
    if (
      !isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration) ||
      !onlineManager.isOnline()
    ) {
      return 'halt';
    }
  }

  try {
    const result = await analyzeDraft(pending.draft, pending.idempotencyKey, {
      expectedUserId,
      applyQuota: false,
    });
    if (result.source !== 'server') return 'halt';
    if (!isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration)) return 'halt';
    const latest = useAppStore.getState();
    if (latest.serverAttempts && latest.serverAttemptsOwnerScope === ownerScope) {
      latest.setServerAttempts(
        {
          ...latest.serverAttempts,
          remaining: Math.max(0, latest.serverAttempts.remaining - 1),
        },
        ownerScope,
      );
    }
    latest.resolveOfflineAnalysis(pending.localResultId, result);
    return 'resolved';
  } catch (error) {
    if (!isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration)) return 'halt';
    if (error instanceof ApiError && NON_RETRYABLE_OFFLINE_REPLAY_CODES.has(error.code)) {
      useAppStore.getState().rejectOfflineAnalysis(pending.localResultId);
      return 'discarded';
    }
    return 'halt';
  }
};

const syncPendingOfflineAnalyses = () => {
  if (pendingSync) {
    pendingSyncRequested = true;
    return pendingSync;
  }
  const task = (async () => {
    const authGeneration = getAuthGeneration();
    const initial = useAppStore.getState();
    const expectedUserId = initial.session?.userId;
    const ownerScope = getSessionScope(initial.session, initial.guestId);
    if (!expectedUserId || !ownerScope || !onlineManager.isOnline()) return;
    let pendingBatch = selectPendingOfflineAnalyses(ownerScope);
    if (pendingBatch.length === 0) return;
    let changedServerState = false;

    while (pendingBatch.length > 0 && onlineManager.isOnline()) {
      for (const pending of pendingBatch) {
        if (
          !isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration) ||
          !onlineManager.isOnline()
        ) {
          return;
        }
        const outcome = await replayPendingOfflineAnalysis(
          pending,
          expectedUserId,
          ownerScope,
          authGeneration,
        );
        if (outcome === 'halt') return;
        if (outcome === 'resolved') changedServerState = true;
      }
      if (!isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration)) return;
      pendingBatch = selectPendingOfflineAnalyses(ownerScope);
    }

    if (
      changedServerState &&
      onlineManager.isOnline() &&
      isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration)
    ) {
      await refreshAuthoritativeQuota(expectedUserId, authGeneration).catch(() => {});
    }
    if (
      onlineManager.isOnline() &&
      isOfflineReplayContextCurrent(expectedUserId, ownerScope, authGeneration) &&
      useAppStore
        .getState()
        .pendingOfflineAnalyses.some((item) => item.ownerScope === ownerScope)
    ) {
      pendingSyncRequested = true;
    }
  })();
  pendingSync = task.finally(() => {
    pendingSync = null;
    if (pendingSyncRequested) {
      pendingSyncRequested = false;
      void syncPendingOfflineAnalyses();
    }
  });
  return pendingSync;
};

export async function syncQuota(): Promise<BackendQuota | undefined> {
  const expectedSession = useAppStore.getState().session;
  const expectedUserId = expectedSession?.userId;
  let payload;
  try {
    payload = await apiRequest<z.infer<typeof quotaResponseSchema>>('/quota', {
      schema: quotaResponseSchema,
    });
  } catch (error) {
    const store = useAppStore.getState();
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      store.session?.userId === expectedUserId &&
      store.guestId
    ) {
      if (expectedSession?.kind === 'registered') resetToLocalGuest(true);
      const session = await bootstrapGuestSession(store.guestId);
      const recoveredSession = useAppStore.getState().session;
      if (recoveredSession?.userId !== session.userId) return undefined;
      return syncQuota();
    }
    throw error;
  }
  if (useAppStore.getState().session?.userId !== expectedUserId) return undefined;
  applyServerQuota(payload.quota);
  const session = useAppStore.getState().session;
  if (session && session.plan !== payload.quota.plan) {
    if (useAppStore.getState().session?.userId !== expectedUserId) return undefined;
    useAppStore.getState().setSession({ ...session, plan: payload.quota.plan });
  }
  void syncPendingOfflineAnalyses();
  return payload.quota;
}

export async function resetDevelopmentQuota(): Promise<BackendQuota> {
  const expectedUserId = useAppStore.getState().session?.userId;
  if (!expectedUserId) {
    throw new ApiError(translate('errors.authRequired'), 401, 'AUTH_REQUIRED');
  }
  const payload = await apiRequest<z.infer<typeof quotaResponseSchema>>('/quota/reset', {
    method: 'POST',
    schema: quotaResponseSchema,
  });
  const store = useAppStore.getState();
  if (store.session?.userId !== expectedUserId) {
    throw new ApiError(translate('errors.authChanged'), 0, 'AUTH_OPERATION_STALE');
  }
  applyServerQuota(payload.quota);
  const session = useAppStore.getState().session;
  if (session && session.userId === expectedUserId && session.plan !== payload.quota.plan) {
    useAppStore.getState().setSession({ ...session, plan: payload.quota.plan });
  }
  return payload.quota;
}
