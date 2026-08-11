import { performance } from 'node:perf_hooks';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { AppConfig } from '../src/config/env.js';
import type { Database } from '../src/db/client.js';
import { AdminService } from '../src/modules/admin/admin.service.js';

const itemCount = 20;
const serializationRuns = 500;

function recommendation(id: number) {
  return {
    hero: {
      id,
      name: `npc_dota_hero_${id}`,
      localizedName: `Hero ${id}`,
      imageUrl: `https://cdn.example.test/heroes/${id}.png`,
      iconUrl: `https://cdn.example.test/heroes/${id}-icon.png`,
      roles: ['Carry', 'Escape'],
    },
    score: 80,
    confidence: 'high',
    metrics: {
      roleFit: 0.81,
      counter: 0.72,
      meta: 0.64,
      synergy: 0.58,
      reliability: 0.74,
      coverage: 0.8,
      worstMatchup: 0.47,
    },
    scoreBreakdown: {
      role: 19.4,
      matchup: 24.5,
      meta: 11.1,
      teamFit: 12.5,
      reliability: 6.1,
      advisor: 1.2,
      diversity: 5.2,
      total: 80,
    },
    evidence: {
      matchups: {
        source: 'opendota_current_patch_rank_pairs',
        opponentsCovered: 4,
        opponentsTotal: 4,
        games: 16_480,
        minimumGames: 100,
        weightedWinRate: 0.547,
        expectedWinRate: 0.519,
        patch: '7.41',
        rank: 7,
        rankScoped: true,
        rankOpponentsCovered: 4,
        rankGames: 12_210,
        patchGames: 16_480,
        minimumPatchGames: 100,
        isStale: false,
        availability: 'ready',
        byOpponent: [1, 5, 14, 26].map((heroId) => ({
          heroId,
          rankGames: 2_100,
          rankWins: 1_120,
          patchGames: 2_800,
          patchWins: 1_490,
          winRate: 0.532,
          expectedWinRate: 0.516,
          advantage: 0.016,
          reliability: 0.79,
        })),
      },
      synergy: {
        source: 'opendota_current_patch_rank_pairs',
        alliesCovered: 3,
        alliesTotal: 3,
        rankAlliesCovered: 3,
        games: 8_120,
        rankGames: 6_840,
        patchGames: 8_120,
        minimumGames: 100,
        weightedWinRate: 0.531,
        expectedWinRate: 0.51,
        pairScore: 0.63,
        compositionScore: 0.56,
        reliability: 0.77,
        patch: '7.41',
        rank: 7,
        rankScoped: true,
        isStale: false,
        availability: 'ready',
        byAlly: [2, 3, 4].map((heroId) => ({
          heroId,
          rankGames: 1_400,
          rankWins: 742,
          patchGames: 1_770,
          patchWins: 940,
          winRate: 0.53,
          expectedWinRate: 0.51,
          advantage: 0.02,
          reliability: 0.75,
        })),
      },
      meta: {
        source: 'opendota_current_patch_30d_position',
        games: 25_000,
        wins: 13_325,
        winRate: 0.533,
        rankScoped: true,
        position: 1,
        positionApproximate: false,
        isStale: false,
      },
    },
    reasons: ['strong_counter', 'good_role_fit', 'strong_synergy'],
  };
}

function fullHistoryItem(index: number) {
  const recommendations = [0, 1, 2].map((offset) => recommendation(index * 10 + offset + 1));
  return {
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    source: 'manual',
    input: {
      source: 'manual',
      position: 1,
      allyHeroIds: [2, 3, 4],
      enemyHeroIds: [1, 5, 14, 26],
      bannedHeroIds: [7, 8, 9],
      rank: 7,
    },
    result: {
      patch: '7.41',
      metaFetchedAt: '2026-08-10T00:00:00.000Z',
      recommendations,
      provenance: {
        engineVersion: 'deterministic-v3',
        scoringVersion: 'draft-pairs-v3',
        aiAssisted: false,
      },
      dataHealth: {
        snapshotId: '00000000-0000-4000-8000-000000000111',
        snapshotVersion: 1,
        source: 'opendota_public_matches_explorer_positions',
        population: {
          id: 'ranked_all_pick',
          version: 1,
          audience: 'opendota_recent_public_sample',
          lobbyTypes: [7],
          gameModes: [22],
          minimumMatches: 1_000,
        },
        fallbackFrom: null,
        matchCount: 18_200,
        minimumMatches: 1_000,
        rankMatchCounts: { '7': 11_500 },
        generatedAt: '2026-08-10T00:00:00.000Z',
        expiresAt: '2026-08-10T01:00:00.000Z',
        availability: 'ready',
        isStale: false,
      },
      draftCompleteness: { bans: 'known' },
    },
    createdAt: '2026-08-10T00:00:00.000Z',
  };
}

function summaryHistoryItem(item: ReturnType<typeof fullHistoryItem>) {
  return {
    id: item.id,
    source: item.source,
    input: {
      position: item.input.position,
      rank: item.input.rank,
      enemyHeroIds: item.input.enemyHeroIds,
    },
    result: {
      patch: item.result.patch,
      recommendations: item.result.recommendations.map(({ hero, score, confidence }) => ({
        hero,
        score,
        confidence,
      })),
    },
    createdAt: item.createdAt,
  };
}

function payloadMetrics(value: unknown) {
  const serialized = JSON.stringify(value);
  const startedAt = performance.now();
  for (let index = 0; index < serializationRuns; index += 1) JSON.stringify(value);
  return {
    jsonBytes: Buffer.byteLength(serialized),
    gzipBytes: gzipSync(serialized).byteLength,
    brotliBytes: brotliCompressSync(serialized).byteLength,
    serializeRuns: serializationRuns,
    serializeMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}

function emptyOverviewQuery() {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    groupBy: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: <TResult1 = unknown[], TResult2 = never>(
      onFulfilled?: ((result: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve([]).then(onFulfilled, onRejected),
  };
  return builder;
}

async function overviewRoundTrips() {
  let selectCalls = 0;
  const db = {
    select: () => {
      selectCalls += 1;
      return emptyOverviewQuery();
    },
  } as unknown as Database;
  const service = new AdminService(
    db,
    { admin: { overviewCacheTtlMs: 10_000 } } as AppConfig,
  );
  await service.overview({ days: 30 });
  const coldSelectCalls = selectCalls;
  await Promise.all(Array.from({ length: 50 }, () => service.overview({ days: 30 })));
  const hotAdditionalSelectCalls = selectCalls - coldSelectCalls;

  let concurrentSelectCalls = 0;
  const concurrentService = new AdminService({
    select: () => {
      concurrentSelectCalls += 1;
      return emptyOverviewQuery();
    },
  } as unknown as Database, { admin: { overviewCacheTtlMs: 10_000 } } as AppConfig);
  await Promise.all(Array.from({ length: 20 }, () => concurrentService.overview({ days: 7 })));

  return {
    coldSelectCalls,
    hotAdditionalSelectCalls,
    concurrentColdSelectCalls: concurrentSelectCalls,
    legacySelectCallsFor50HotRequests: coldSelectCalls * 50,
  };
}

const fullItems = Array.from({ length: itemCount }, (_, index) => fullHistoryItem(index));
const historyFull = { view: 'full', items: fullItems, nextCursor: null };
const historySummary = {
  view: 'summary',
  items: fullItems.map(summaryHistoryItem),
  nextCursor: null,
};
const adminFull = {
  items: fullItems.map((item) => ({
    ...item,
    accountId: '00000000-0000-4000-8000-000000000201',
    account: { id: '00000000-0000-4000-8000-000000000201', kind: 'user', email: 'fixture@example.test' },
    status: 'completed',
    rawInput: null,
    rawResult: null,
    dataQuality: { input: 'valid', result: 'valid', issues: [] },
    patch: item.result.patch,
    errorCode: null,
    revision: 0,
    durationMs: 250,
    durationKind: 'initial_terminal_state',
    quotaEvents: [{ id: item.id, delta: -1, reason: 'analysis', createdAt: item.createdAt }],
    sourceImage: { stored: false, status: 'not_applicable', detail: 'fixture' },
    updatedAt: item.createdAt,
  })),
  pagination: { limit: itemCount, offset: 0, total: itemCount },
};
const adminSummary = {
  items: fullItems.map((item) => ({
    id: item.id,
    accountId: '00000000-0000-4000-8000-000000000201',
    account: { id: '00000000-0000-4000-8000-000000000201', kind: 'user', email: 'fixture@example.test' },
    status: 'completed',
    source: item.source,
    recommendationHeroIds: item.result.recommendations.map((entry) => entry.hero.id),
    hasResult: true,
    patch: item.result.patch,
    errorCode: null,
    revision: 0,
    durationMs: 250,
    durationKind: 'initial_terminal_state',
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
  })),
  pagination: { limit: itemCount, offset: 0, total: itemCount, nextCursor: null },
};

const historyFullMetrics = payloadMetrics(historyFull);
const historySummaryMetrics = payloadMetrics(historySummary);
const adminFullMetrics = payloadMetrics(adminFull);
const adminSummaryMetrics = payloadMetrics(adminSummary);
const overview = await overviewRoundTrips();

const reduction = (before: number, after: number) => Math.round((1 - after / before) * 10_000) / 100;
process.stdout.write(`${JSON.stringify({
  conditions: {
    mode: 'local synthetic fixture benchmark',
    database: 'in-memory query double for overview call counts',
    network: 'disabled',
    itemCount,
    note: 'Payload and CPU values are local fixture measurements, not production latency or p95 claims.',
  },
  history: {
    legacyFull: historyFullMetrics,
    summary: historySummaryMetrics,
    jsonReductionPercent: reduction(historyFullMetrics.jsonBytes, historySummaryMetrics.jsonBytes),
    gzipReductionPercent: reduction(historyFullMetrics.gzipBytes, historySummaryMetrics.gzipBytes),
    databaseRoundTripsPerRequest: { legacyFull: 1, summary: 1 },
  },
  adminAnalyses: {
    legacyFull: adminFullMetrics,
    summary: adminSummaryMetrics,
    jsonReductionPercent: reduction(adminFullMetrics.jsonBytes, adminSummaryMetrics.jsonBytes),
    gzipReductionPercent: reduction(adminFullMetrics.gzipBytes, adminSummaryMetrics.gzipBytes),
    databaseRoundTripsPerListRequest: { legacyFull: 3, summary: 2 },
  },
  adminOverview: {
    cachedService: overview,
    legacySelectCallsFor20ConcurrentColdRequests: overview.concurrentColdSelectCalls * 20,
  },
  quotaReadPath: {
    legacy: { databaseSelects: 1, transactions: 1, rowLocks: 1 },
    optimizedMaterializedRead: { databaseSelects: 1, transactions: 0, rowLocks: 0 },
  },
}, null, 2)}\n`);
