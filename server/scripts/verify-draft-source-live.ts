import { performance } from 'node:perf_hooks';
import { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import {
  DRAFT_PAIR_WINDOW,
  DRAFT_POSITION_WINDOW,
  DRAFT_PRIMARY_POSITION_WINDOW,
  DRAFT_SNAPSHOT_PRIMARY_SOURCE,
  OpenDotaDraftSnapshotSource,
} from '../src/modules/heroes/draft-snapshot-source.js';
import { draftDataPopulations } from '../src/modules/heroes/draft-snapshot.repository.js';

const config = {
  baseUrl: (process.env.OPEN_DOTA_BASE_URL ?? 'https://api.opendota.com/api').replace(/\/$/, ''),
  timeoutMs: 20_000,
  cacheTtlMs: 90 * 60 * 1_000,
  cacheStaleMs: 24 * 60 * 60 * 1_000,
} as const;

const originalFetch = globalThis.fetch;
const requestCounts = {
  total: 0,
  publicMatches: 0,
  explorer: 0,
  laneRoles: 0,
  metadata: 0,
};

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  requestCounts.total += 1;
  if (url.includes('/publicMatches')) requestCounts.publicMatches += 1;
  else if (url.includes('/explorer')) requestCounts.explorer += 1;
  else if (url.includes('/scenarios/laneRoles')) requestCounts.laneRoles += 1;
  else requestCounts.metadata += 1;
  return originalFetch(input, init);
};

try {
  const adapter = new OpenDotaAdapter(config);
  const [patch, heroes] = await Promise.all([
    adapter.getPatchInfo(),
    adapter.getHeroes(),
  ]);
  const source = new OpenDotaDraftSnapshotSource(config);
  const snapshotHeroes = heroes.map((hero) => ({ ...hero, rankStats: {} }));
  const startedAt = performance.now();
  const results = await Promise.all(
    Object.values(draftDataPopulations).map(async (population) => ({
      population,
      materialization: await source.materialize(
        patch,
        population,
        90 * 60 * 1_000,
        snapshotHeroes,
      ),
    })),
  );
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  const populations = results.map(({ population, materialization }) => {
    const allRankPairs = materialization.pairRows.filter((row) => row.rankBucket === 0);
    const positionCoverage = Object.fromEntries(
      [1, 2, 3, 4, 5].map((position) => [
        position,
        materialization.positionRows.filter((row) => (
          row.rankBucket === 0 && row.position === position
        )).length,
      ]),
    );
    return {
      id: population.id,
      audience: population.audience,
      lobbyTypes: population.lobbyTypes,
      gameModes: population.gameModes,
      minimumMatches: population.minimumMatches,
      matchCount: materialization.matchCount,
      rankMatchCounts: materialization.rankMatchCounts,
      source: materialization.source,
      pairWindow: DRAFT_PAIR_WINDOW,
      positionWindow: materialization.source === DRAFT_SNAPSHOT_PRIMARY_SOURCE
        ? DRAFT_PRIMARY_POSITION_WINDOW
        : DRAFT_POSITION_WINDOW,
      pairRows: materialization.pairRows.length,
      allRankMatchupRows: allRankPairs.filter((row) => row.relation === 'matchup').length,
      allRankSynergyRows: allRankPairs.filter((row) => row.relation === 'synergy').length,
      positionRows: materialization.positionRows.length,
      positionCoverage,
      heroes: materialization.heroes.length,
      ready: materialization.matchCount >= population.minimumMatches
        && allRankPairs.length > 0
        && Object.values(positionCoverage).every((count) => count > 0)
        && materialization.heroes.length > 0,
    };
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'live OpenDota background-source verification; no database writes',
    patch,
    durationMs,
    requestCounts,
    populations,
  }, null, 2)}\n`);
} finally {
  globalThis.fetch = originalFetch;
}
