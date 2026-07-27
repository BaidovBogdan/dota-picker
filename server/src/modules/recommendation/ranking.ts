import type {
  HeroMeta,
  HeroPositionStat,
  MatchupStat,
  MetaSnapshot,
} from '../heroes/heroes.types.js';
import type {
  Position,
  RankRequest,
  Recommendation,
  RecommendationEvidence,
  RecommendationMetricsV2,
  RecommendationProvenance,
  RecommendationReason,
  RecommendationResult,
  RecommendationScoreBreakdown,
  RecommendationV2,
} from './recommendation.types.js';

const MATCHUP_PRIOR_GAMES = 80;
const POSITION_PRIOR_GAMES = 120;
const MIN_ROLE_FIT = 0.5;
const DEFAULT_RESULT_LIMIT = 3;
const CANDIDATE_POOL_LIMIT = 8;
const ADVISOR_MAX_POINTS = 2;
const DIVERSITY_MAX_PENALTY = 2.5;

const positionRoleWeights: Record<Position, Record<string, number>> = {
  1: { Carry: 1, Escape: 0.3, Nuker: 0.2 },
  2: { Nuker: 1, Carry: 0.72, Disabler: 0.45, Escape: 0.3 },
  3: { Initiator: 1, Durable: 0.92, Disabler: 0.62, Carry: 0.25 },
  4: { Support: 0.88, Disabler: 1, Initiator: 0.7, Nuker: 0.45 },
  5: { Support: 1, Disabler: 0.72, Initiator: 0.42 },
};

export type RecommendationCandidate = {
  recommendation: RecommendationV2;
  heroMeta: HeroMeta;
  baseScore: number;
  deterministicRank: number;
};

type MatchupEvaluation = {
  score: number;
  worstScore: number;
  games: number;
  minimumGames: number;
  coverage: number;
  reliability: number;
  weightedWinRate: number | null;
  expectedWinRate: number;
};

type PositionEvaluation = {
  score: number;
  stat: HeroPositionStat | null;
};

type TeamEvaluation = {
  score: number;
  fillsNeed: boolean;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function roundPoints(value: number) {
  return Math.round(value * 10) / 10;
}

function safeRate(wins: number, games: number) {
  return games > 0 ? clamp(wins / games) : 0.5;
}

function smoothedRate(wins: number, games: number, priorRate: number, priorGames: number) {
  return clamp((wins + clamp(priorRate, 0.35, 0.65) * priorGames) / (games + priorGames));
}

function logit(value: number) {
  const bounded = clamp(value, 0.35, 0.65);
  return Math.log(bounded / (1 - bounded));
}

function expectedCandidateWinRate(
  candidate: HeroMeta,
  enemy: HeroMeta | undefined,
  matchupBaselineByHero: MetaSnapshot['matchupBaselineByHero'],
) {
  const candidateWinRate = matchupBaselineByHero?.get(candidate.id) ?? candidate.winRate;
  if (!enemy) {
    return clamp(candidateWinRate, 0.42, 0.58);
  }
  const enemyWinRate = matchupBaselineByHero?.get(enemy.id) ?? enemy.winRate;
  const odds = logit(candidateWinRate) - logit(enemyWinRate);
  return clamp(1 / (1 + Math.exp(-odds)), 0.35, 0.65);
}

function tagRoleFit(hero: HeroMeta, position: Position) {
  const weights = positionRoleWeights[position];
  return clamp(Math.max(0, ...hero.roles.map((role) => weights[role] ?? 0)));
}

function positionEvaluation(
  hero: HeroMeta,
  position: Position,
  statsByHero: Map<number, HeroPositionStat[]>,
): PositionEvaluation {
  const tagScore = tagRoleFit(hero, position);
  const stats = statsByHero.get(hero.id) ?? [];
  const target = stats.find((stat) => stat.position === position);
  if (!target) {
    return {
      score: stats.length > 0 ? tagScore * 0.7 : tagScore,
      stat: null,
    };
  }

  const totalPicks = stats.reduce((total, stat) => total + stat.picks, 0);
  const share = totalPicks > 0 ? target.picks / totalPicks : 0;
  const shareScore = clamp((share - 0.05) / 0.6);
  const sampleReliability = target.picks / (target.picks + POSITION_PRIOR_GAMES);
  const observedScore = shareScore * (0.75 + sampleReliability * 0.25);
  return {
    score: clamp(tagScore * 0.35 + observedScore * 0.65),
    stat: target,
  };
}

function candidateWinRateAgainstEnemy(
  candidate: HeroMeta,
  enemy: HeroMeta | undefined,
  stat: MatchupStat,
  matchupBaselineByHero: MetaSnapshot['matchupBaselineByHero'],
) {
  const expected = expectedCandidateWinRate(candidate, enemy, matchupBaselineByHero);
  const candidateWins = Math.max(0, stat.gamesPlayed - stat.wins);
  const winRate = smoothedRate(candidateWins, stat.gamesPlayed, expected, MATCHUP_PRIOR_GAMES);
  return {
    advantage: winRate - expected,
    expected,
    games: stat.gamesPlayed,
    reliability: stat.gamesPlayed / (stat.gamesPlayed + MATCHUP_PRIOR_GAMES * 2),
    winRate,
  };
}

function matchupEvaluation(
  candidate: HeroMeta,
  enemyIds: number[],
  heroById: Map<number, HeroMeta>,
  matchupByEnemy: MetaSnapshot['matchupByEnemy'],
  matchupBaselineByHero: MetaSnapshot['matchupBaselineByHero'],
): MatchupEvaluation {
  const observed = enemyIds.flatMap((enemyId) => {
    const stat = matchupByEnemy.get(enemyId)?.get(candidate.id);
    return stat && stat.gamesPlayed > 0
      ? [candidateWinRateAgainstEnemy(
          candidate,
          heroById.get(enemyId),
          stat,
          matchupBaselineByHero,
        )]
      : [];
  });
  if (observed.length === 0) {
    return {
      score: 0.5,
      worstScore: 0.5,
      games: 0,
      minimumGames: 0,
      coverage: 0,
      reliability: 0,
      weightedWinRate: null,
      expectedWinRate: clamp(
        matchupBaselineByHero?.get(candidate.id) ?? candidate.winRate,
        0.42,
        0.58,
      ),
    };
  }

  const totalGames = observed.reduce((total, value) => total + value.games, 0);
  const totalWeight = observed.reduce((total, value) => total + Math.min(50, Math.sqrt(value.games)), 0);
  const weightedAdvantage = observed.reduce(
    (total, value) => total + value.advantage * Math.min(50, Math.sqrt(value.games)),
    0,
  ) / totalWeight;
  const weightedWinRate = observed.reduce(
    (total, value) => total + value.winRate * Math.min(50, Math.sqrt(value.games)),
    0,
  ) / totalWeight;
  const expectedWinRate = observed.reduce(
    (total, value) => total + value.expected * Math.min(50, Math.sqrt(value.games)),
    0,
  ) / totalWeight;
  const worstAdvantage = Math.min(...observed.map((value) => value.advantage));
  const coverage = observed.length / enemyIds.length;
  const coverageShrinkage = Math.sqrt(coverage);
  const robustAdvantage = (weightedAdvantage * 0.75 + worstAdvantage * 0.25) * coverageShrinkage;
  const reliability = observed.reduce((total, value) => total + value.reliability, 0)
    / enemyIds.length;

  return {
    score: clamp(0.5 + robustAdvantage / 0.12),
    worstScore: clamp(0.5 + worstAdvantage / 0.12),
    games: totalGames,
    minimumGames: Math.min(...observed.map((value) => value.games)),
    coverage,
    reliability,
    weightedWinRate,
    expectedWinRate,
  };
}

function metaEvaluation(
  hero: HeroMeta,
  position: Position,
  positionStat: HeroPositionStat | null,
  snapshot: MetaSnapshot,
  maximumHeroPicks: number,
  maximumPositionPicks: number,
  rankRequested: boolean,
) {
  const usingPosition = positionStat !== null;
  const games = positionStat?.picks ?? hero.picks;
  const wins = positionStat?.wins ?? hero.wins;
  const baseline = safeRate(hero.wins, hero.picks);
  const winRate = smoothedRate(
    wins,
    games,
    usingPosition ? baseline : 0.5,
    usingPosition ? POSITION_PRIOR_GAMES : 200,
  );
  const winComponent = clamp((winRate - 0.45) / 0.1);
  const maximumPicks = usingPosition ? maximumPositionPicks : maximumHeroPicks;
  const popularity = maximumPicks > 0
    ? clamp(Math.log1p(games) / Math.log1p(maximumPicks))
    : 0;
  const sampleReliability = games / (games + (usingPosition ? 200 : 500));
  const score = winComponent * 0.72 + popularity * 0.16 + sampleReliability * 0.12;
  const rankScoped = usingPosition
    ? snapshot.positionMeta?.rankFilter === 'average_match_rank'
    : rankRequested && hero.picks > 0;
  const source: RecommendationEvidence['meta']['source'] = usingPosition
    ? 'opendota_current_patch_30d_position'
    : rankScoped
      ? 'opendota_rank_hero_stats'
      : 'opendota_public_hero_stats';

  return {
    score: clamp(score),
    reliability: sampleReliability,
    evidence: {
      source,
      games,
      wins,
      winRate: safeRate(wins, games),
      rankScoped,
      position,
      positionApproximate: positionStat?.isApproximate ?? null,
      isStale: usingPosition ? (snapshot.positionMeta?.isStale ?? false) : false,
    } satisfies RecommendationEvidence['meta'],
  };
}

function teamEvaluation(candidate: HeroMeta, allies: HeroMeta[]): TeamEvaluation {
  if (allies.length === 0) {
    return { score: 0.5, fillsNeed: false };
  }

  const teamRoles = new Set(allies.flatMap((hero) => hero.roles));
  const needs = [
    { role: 'Disabler', points: 0.18 },
    { role: 'Initiator', points: 0.14 },
    { role: 'Durable', points: 0.1 },
  ] as const;
  let score = 0.5;
  let fillsNeed = false;
  for (const need of needs) {
    if (!teamRoles.has(need.role) && candidate.roles.includes(need.role)) {
      score += need.points;
      fillsNeed = true;
    }
  }

  const meleeAllies = allies.filter((hero) => hero.attackType === 'Melee').length;
  if (meleeAllies >= 3 && candidate.attackType === 'Melee') {
    score -= 0.18;
  }
  const carryAllies = allies.filter((hero) => hero.roles.includes('Carry')).length;
  if (carryAllies >= 2 && candidate.roles.includes('Carry')) {
    score -= 0.12;
  }
  return { score: clamp(score), fillsNeed };
}

function recommendationConfidence(
  matchup: MatchupEvaluation,
  metaReliability: number,
): Recommendation['confidence'] {
  const minimumGames = matchup.coverage > 0
    ? matchup.minimumGames
    : 0;
  const combined = matchup.reliability * 0.75 + metaReliability * 0.25;
  if (
    matchup.coverage === 1
    && matchup.minimumGames >= 300
    && metaReliability >= 0.6
    && combined >= 0.65
  ) {
    return 'high';
  }
  if (
    matchup.coverage >= 0.6
    && minimumGames >= 80
    && metaReliability >= 0.3
    && combined >= 0.35
  ) {
    return 'medium';
  }
  return 'low';
}

function recommendationReasons(
  metrics: RecommendationMetricsV2,
  matchup: MatchupEvaluation,
  fillsNeed: boolean,
): RecommendationReason[] {
  const result: RecommendationReason[] = [];
  if (
    metrics.counter >= 0.67
    && matchup.coverage >= 0.6
    && matchup.minimumGames >= 80
  ) {
    result.push('strong_counter');
  }
  if (metrics.roleFit >= 0.75) result.push('good_role_fit');
  if (metrics.meta >= 0.66) result.push('meta_favorite');
  if (fillsNeed && metrics.synergy >= 0.62) result.push('fills_team_need');
  if (matchup.coverage < 1 || matchup.minimumGames < 80) result.push('limited_matchup_data');
  return result.slice(0, 4);
}

function roleSimilarity(left: HeroMeta, right: HeroMeta) {
  const leftRoles = new Set(left.roles);
  const overlap = right.roles.filter((role) => leftRoles.has(role)).length;
  const union = new Set([...left.roles, ...right.roles]).size;
  const roles = union > 0 ? overlap / union : 0;
  const attackType = left.attackType === right.attackType ? 1 : 0;
  const attribute = left.primaryAttribute === right.primaryAttribute ? 1 : 0;
  return roles * 0.55 + attackType * 0.25 + attribute * 0.2;
}

function diversityPenalty(candidate: RecommendationCandidate, selected: RecommendationCandidate[]) {
  if (selected.length === 0) {
    return 0;
  }
  const maximumSimilarity = Math.max(
    ...selected.map((entry) => roleSimilarity(candidate.heroMeta, entry.heroMeta)),
  );
  return maximumSimilarity * DIVERSITY_MAX_PENALTY;
}

function advisorAdjustment(
  candidate: RecommendationCandidate,
  advisorOrder: number[] | undefined,
  poolSize: number,
) {
  if (!advisorOrder || poolSize <= 1) {
    return 0;
  }
  const advisorRank = advisorOrder.indexOf(candidate.heroMeta.id);
  if (advisorRank < 0) {
    return 0;
  }
  const rankDelta = (candidate.deterministicRank - advisorRank) / (poolSize - 1);
  return clamp(
    rankDelta * ADVISOR_MAX_POINTS,
    -ADVISOR_MAX_POINTS,
    ADVISOR_MAX_POINTS,
  );
}

function withFinalScore(
  candidate: RecommendationCandidate,
  advisorPoints: number,
  diversityPoints: number,
): RecommendationCandidate {
  const total = clamp(
    candidate.baseScore + advisorPoints - diversityPoints,
    0,
    100,
  );
  const scoreBreakdown: RecommendationScoreBreakdown = {
    ...candidate.recommendation.scoreBreakdown,
    advisor: roundPoints(advisorPoints),
    diversity: roundPoints(-diversityPoints),
    total: roundPoints(total),
  };
  return {
    ...candidate,
    recommendation: {
      ...candidate.recommendation,
      score: Math.round(total),
      scoreBreakdown,
    },
  };
}

function selectRecommendations(
  pool: RecommendationCandidate[],
  advisorOrder: number[] | undefined,
  limit: number,
) {
  const remaining = [...pool];
  const selected: RecommendationCandidate[] = [];
  while (remaining.length > 0 && selected.length < limit) {
    const ranked = remaining
      .map((candidate) => {
        const advisorPoints = advisorAdjustment(candidate, advisorOrder, pool.length);
        const diversityPoints = diversityPenalty(candidate, selected);
        return withFinalScore(candidate, advisorPoints, diversityPoints);
      })
      .sort((left, right) =>
        right.recommendation.scoreBreakdown.total - left.recommendation.scoreBreakdown.total
        || right.baseScore - left.baseScore
        || left.deterministicRank - right.deterministicRank
        || left.heroMeta.id - right.heroMeta.id);
    const winner = ranked[0];
    if (!winner) {
      break;
    }
    selected.push(winner);
    const index = remaining.findIndex((candidate) => candidate.heroMeta.id === winner.heroMeta.id);
    remaining.splice(index, 1);
  }
  return selected.map((candidate) => candidate.recommendation);
}

function statsByHero(snapshot: MetaSnapshot) {
  const result = new Map<number, HeroPositionStat[]>();
  for (const stat of snapshot.positionMeta?.positionStats ?? []) {
    const values = result.get(stat.heroId) ?? [];
    values.push(stat);
    result.set(stat.heroId, values);
  }
  return result;
}

export function rankRecommendationPool(
  { draft, snapshot }: RankRequest,
  limit = CANDIDATE_POOL_LIMIT,
): RecommendationCandidate[] {
  const unavailable = new Set([
    ...draft.allyHeroIds,
    ...draft.enemyHeroIds,
    ...(draft.bannedHeroIds ?? []),
  ]);
  const heroById = new Map(snapshot.heroes.map((hero) => [hero.id, hero]));
  const allies = draft.allyHeroIds.flatMap((id) => {
    const hero = heroById.get(id);
    return hero ? [hero] : [];
  });
  const positionStatsByHero = statsByHero(snapshot);
  const maximumHeroPicks = Math.max(0, ...snapshot.heroes.map((hero) => hero.picks));
  const maximumPositionPicks = Math.max(
    0,
    ...(snapshot.positionMeta?.positionStats
      .filter((stat) => stat.position === draft.position)
      .map((stat) => stat.picks) ?? []),
  );

  const candidates = snapshot.heroes
    .filter((hero) => !unavailable.has(hero.id))
    .map((hero) => {
      const position = positionEvaluation(hero, draft.position, positionStatsByHero);
      const matchup = matchupEvaluation(
        hero,
        draft.enemyHeroIds,
        heroById,
        snapshot.matchupByEnemy,
        snapshot.matchupBaselineByHero,
      );
      const meta = metaEvaluation(
        hero,
        draft.position,
        position.stat,
        snapshot,
        maximumHeroPicks,
        maximumPositionPicks,
        draft.rank !== undefined,
      );
      const team = teamEvaluation(hero, allies);
      const reliability = matchup.reliability * 0.75 + meta.reliability * 0.25;
      const metrics: RecommendationMetricsV2 = {
        roleFit: round(position.score),
        counter: round(matchup.score),
        meta: round(meta.score),
        synergy: round(team.score),
        reliability: round(reliability),
        coverage: round(matchup.coverage),
        worstMatchup: round(matchup.worstScore),
      };
      const scoreBreakdown: RecommendationScoreBreakdown = {
        role: roundPoints(position.score * 28),
        matchup: roundPoints(matchup.score * 34),
        meta: roundPoints(meta.score * 20),
        teamFit: roundPoints(team.score * 12),
        reliability: roundPoints(reliability * 6),
        advisor: 0,
        diversity: 0,
        total: 0,
      };
      const baseScore = scoreBreakdown.role
        + scoreBreakdown.matchup
        + scoreBreakdown.meta
        + scoreBreakdown.teamFit
        + scoreBreakdown.reliability;
      scoreBreakdown.total = roundPoints(baseScore);
      const recommendation: RecommendationV2 = {
        hero: {
          id: hero.id,
          name: hero.name,
          localizedName: hero.localizedName,
          imageUrl: hero.imageUrl,
          iconUrl: hero.iconUrl,
          roles: hero.roles,
        },
        score: Math.round(clamp(baseScore, 0, 100)),
        confidence: recommendationConfidence(matchup, meta.reliability),
        metrics,
        scoreBreakdown,
        evidence: {
          matchups: {
            source: 'opendota_rolling_all_ranks',
            opponentsCovered: Math.round(matchup.coverage * draft.enemyHeroIds.length),
            opponentsTotal: draft.enemyHeroIds.length,
            games: matchup.games,
            minimumGames: matchup.minimumGames,
            weightedWinRate: matchup.weightedWinRate === null
              ? null
              : round(matchup.weightedWinRate),
            expectedWinRate: round(matchup.expectedWinRate),
          },
          meta: meta.evidence,
        },
        reasons: recommendationReasons(metrics, matchup, team.fillsNeed),
      };
      return { recommendation, heroMeta: hero, baseScore, deterministicRank: 0 };
    })
    .filter((candidate) => candidate.recommendation.metrics.roleFit >= MIN_ROLE_FIT)
    .sort((left, right) =>
      right.baseScore - left.baseScore
      || right.recommendation.evidence.matchups.games - left.recommendation.evidence.matchups.games
      || left.heroMeta.id - right.heroMeta.id)
    .slice(0, limit);

  return candidates.map((candidate, deterministicRank) => ({
    ...candidate,
    deterministicRank,
  }));
}

export function recommendationResultFromPool(
  request: RankRequest,
  pool: RecommendationCandidate[],
  provenance: RecommendationProvenance,
  advisorOrder?: number[],
): RecommendationResult {
  return {
    patch: request.snapshot.patch,
    metaFetchedAt: request.snapshot.fetchedAt,
    recommendations: selectRecommendations(pool, advisorOrder, DEFAULT_RESULT_LIMIT),
    provenance,
  };
}

export function rankRecommendations(request: RankRequest): RecommendationResult {
  const pool = rankRecommendationPool(request);
  return recommendationResultFromPool(request, pool, {
    engineVersion: 'hybrid-v2',
    scoringVersion: 'data-first-v2',
    aiAssisted: false,
  });
}
