import type {
  DraftPairStat,
  HeroMeta,
  HeroPositionStat,
  MetaSnapshot,
} from '../heroes/heroes.types.js';
import type {
  Position,
  RankRequest,
  Recommendation,
  RecommendationEvidence,
  RecommendationMetricsV2,
  RecommendationPairEvidence,
  RecommendationProvenance,
  RecommendationReason,
  RecommendationResult,
  RecommendationScoreBreakdown,
  RecommendationV2,
} from './recommendation.types.js';

const PAIR_PATCH_PRIOR_GAMES = 80;
const PAIR_RANK_PRIOR_GAMES = 40;
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
  rankGames: number;
  patchGames: number;
  minimumPatchGames: number;
  rankCoverage: number;
  byOpponent: RecommendationPairEvidence[];
};

type PositionEvaluation = {
  score: number;
  stat: HeroPositionStat | null;
};

type TeamEvaluation = {
  score: number;
  fillsNeed: boolean;
  pairScore: number;
  compositionScore: number;
  reliability: number;
  coverage: number;
  rankCoverage: number;
  games: number;
  rankGames: number;
  patchGames: number;
  minimumGames: number;
  weightedWinRate: number | null;
  expectedWinRate: number | null;
  byAlly: RecommendationPairEvidence[];
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

function smoothedRate(
  wins: number,
  games: number,
  priorRate: number,
  priorGames: number
) {
  return clamp(
    (wins + clamp(priorRate, 0.35, 0.65) * priorGames) / (games + priorGames)
  );
}

function logit(value: number) {
  const bounded = clamp(value, 0.35, 0.65);
  return Math.log(bounded / (1 - bounded));
}

function expectedCandidateWinRate(
  candidate: HeroMeta,
  enemy: HeroMeta | undefined,
  matchupBaselineByHero: MetaSnapshot['matchupBaselineByHero']
) {
  const candidateWinRate =
    matchupBaselineByHero?.get(candidate.id) ?? candidate.winRate;
  if (!enemy) {
    return clamp(candidateWinRate, 0.42, 0.58);
  }
  const enemyWinRate = matchupBaselineByHero?.get(enemy.id) ?? enemy.winRate;
  const odds = logit(candidateWinRate) - logit(enemyWinRate);
  return clamp(1 / (1 + Math.exp(-odds)), 0.35, 0.65);
}

function tagRoleFit(hero: HeroMeta, position: Position) {
  const weights = positionRoleWeights[position];
  return clamp(Math.max(0, ...hero.roles.map(role => weights[role] ?? 0)));
}

function positionEvaluation(
  hero: HeroMeta,
  position: Position,
  statsByHero: Map<number, HeroPositionStat[]>
): PositionEvaluation {
  const tagScore = tagRoleFit(hero, position);
  const stats = statsByHero.get(hero.id) ?? [];
  const target = stats.find(stat => stat.position === position);
  if (!target) {
    return {
      score: tagScore * (stats.length > 0 ? 0.7 : 0.85),
      stat: null,
    };
  }

  const totalPicks = stats.reduce((total, stat) => total + stat.picks, 0);
  const share = totalPicks > 0 ? target.picks / totalPicks : 0;
  const shareScore = clamp((share - 0.05) / 0.6);
  const sampleReliability =
    target.picks / (target.picks + POSITION_PRIOR_GAMES);
  const observedScore = shareScore * (0.75 + sampleReliability * 0.25);
  return {
    score: clamp(tagScore * 0.35 + observedScore * 0.65),
    stat: target,
  };
}

function isPositionEligible(
  hero: HeroMeta,
  position: Position,
  evaluation: PositionEvaluation
) {
  if (evaluation.score < MIN_ROLE_FIT) return false;
  if (evaluation.stat) return true;
  const isCarry = hero.roles.includes('Carry');
  if (position === 4 && isCarry) {
    return false;
  }
  if (position === 5 && (isCarry || !hero.roles.includes('Support'))) {
    return false;
  }
  return true;
}

function scopedPairRate(
  stat: DraftPairStat,
  expected: number,
  rankRequested: boolean
) {
  const patchRate = smoothedRate(
    stat.patchWins,
    stat.patchGames,
    expected,
    PAIR_PATCH_PRIOR_GAMES
  );
  const winRate = rankRequested
    ? smoothedRate(
        stat.rankWins,
        stat.rankGames,
        patchRate,
        PAIR_RANK_PRIOR_GAMES
      )
    : patchRate;
  const patchReliability =
    stat.patchGames / (stat.patchGames + PAIR_PATCH_PRIOR_GAMES * 2);
  const rankReliability = rankRequested
    ? stat.rankGames / (stat.rankGames + PAIR_RANK_PRIOR_GAMES * 2)
    : patchReliability;
  return {
    advantage: winRate - expected,
    expected,
    games:
      rankRequested && stat.rankGames > 0 ? stat.rankGames : stat.patchGames,
    reliability: rankRequested
      ? rankReliability * 0.75 + patchReliability * 0.25
      : patchReliability,
    winRate,
    stat,
  };
}

function candidateWinRateAgainstEnemy(
  candidate: HeroMeta,
  enemy: HeroMeta | undefined,
  stat: DraftPairStat,
  matchupBaselineByHero: MetaSnapshot['matchupBaselineByHero'],
  rankRequested: boolean
) {
  const expected = expectedCandidateWinRate(
    candidate,
    enemy,
    matchupBaselineByHero
  );
  return scopedPairRate(stat, expected, rankRequested);
}

function matchupEvaluation(
  candidate: HeroMeta,
  enemyIds: number[],
  heroById: Map<number, HeroMeta>,
  matchupByEnemy: MetaSnapshot['matchupByEnemy'],
  matchupBaselineByHero: MetaSnapshot['matchupBaselineByHero'],
  rankRequested: boolean
): MatchupEvaluation {
  const observed = enemyIds.flatMap(enemyId => {
    const stat = matchupByEnemy.get(enemyId)?.get(candidate.id);
    return stat && stat.patchGames > 0
      ? [
          {
            heroId: enemyId,
            ...candidateWinRateAgainstEnemy(
              candidate,
              heroById.get(enemyId),
              stat,
              matchupBaselineByHero,
              rankRequested
            ),
          },
        ]
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
        0.58
      ),
      rankGames: 0,
      patchGames: 0,
      minimumPatchGames: 0,
      rankCoverage: 0,
      byOpponent: [],
    };
  }

  const totalGames = observed.reduce((total, value) => total + value.games, 0);
  const rankGames = observed.reduce(
    (total, value) => total + value.stat.rankGames,
    0
  );
  const patchGames = observed.reduce(
    (total, value) => total + value.stat.patchGames,
    0
  );
  const totalWeight = observed.reduce(
    (total, value) => total + Math.min(50, Math.sqrt(value.games)),
    0
  );
  const weightedAdvantage =
    observed.reduce(
      (total, value) =>
        total + value.advantage * Math.min(50, Math.sqrt(value.games)),
      0
    ) / totalWeight;
  const weightedWinRate =
    observed.reduce(
      (total, value) =>
        total + value.winRate * Math.min(50, Math.sqrt(value.games)),
      0
    ) / totalWeight;
  const expectedWinRate =
    observed.reduce(
      (total, value) =>
        total + value.expected * Math.min(50, Math.sqrt(value.games)),
      0
    ) / totalWeight;
  const worstAdvantage = Math.min(...observed.map(value => value.advantage));
  const coverage = observed.length / enemyIds.length;
  const rankCoverage =
    observed.filter(value => value.stat.rankGames > 0).length / enemyIds.length;
  const coverageShrinkage = Math.sqrt(coverage);
  const robustAdvantage =
    (weightedAdvantage * 0.75 + worstAdvantage * 0.25) * coverageShrinkage;
  const reliability =
    observed.reduce((total, value) => total + value.reliability, 0) /
    enemyIds.length;

  return {
    score: clamp(0.5 + robustAdvantage / 0.12),
    worstScore: clamp(0.5 + worstAdvantage / 0.12),
    games: totalGames,
    minimumGames: Math.min(...observed.map(value => value.games)),
    coverage,
    reliability,
    weightedWinRate,
    expectedWinRate,
    rankGames,
    patchGames,
    minimumPatchGames: Math.min(
      ...observed.map(value => value.stat.patchGames)
    ),
    rankCoverage,
    byOpponent: observed.map(value => ({
      heroId: value.heroId,
      rankGames: value.stat.rankGames,
      rankWins: value.stat.rankWins,
      patchGames: value.stat.patchGames,
      patchWins: value.stat.patchWins,
      winRate: round(value.winRate),
      expectedWinRate: round(value.expected),
      advantage: round(value.advantage),
      reliability: round(value.reliability),
    })),
  };
}

function metaEvaluation(
  hero: HeroMeta,
  position: Position,
  positionStat: HeroPositionStat | null,
  snapshot: MetaSnapshot,
  maximumHeroPicks: number,
  maximumPositionPicks: number,
  rankRequested: boolean
) {
  const usingPosition = positionStat !== null;
  const games = positionStat?.picks ?? hero.picks;
  const wins = positionStat?.wins ?? hero.wins;
  const baseline = safeRate(hero.wins, hero.picks);
  const winRate = smoothedRate(
    wins,
    games,
    usingPosition ? baseline : 0.5,
    usingPosition ? POSITION_PRIOR_GAMES : 200
  );
  const winComponent = clamp((winRate - 0.45) / 0.1);
  const maximumPicks = usingPosition ? maximumPositionPicks : maximumHeroPicks;
  const popularity =
    maximumPicks > 0 ? clamp(Math.log1p(games) / Math.log1p(maximumPicks)) : 0;
  const sampleReliability = games / (games + (usingPosition ? 200 : 500));
  const score =
    winComponent * 0.72 + popularity * 0.16 + sampleReliability * 0.12;
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
      isStale: usingPosition
        ? (snapshot.positionMeta?.isStale ?? false)
        : false,
    } satisfies RecommendationEvidence['meta'],
  };
}

function teamEvaluation(
  candidate: HeroMeta,
  allies: HeroMeta[],
  snapshot: MetaSnapshot,
  rankRequested: boolean
): TeamEvaluation {
  if (allies.length === 0) {
    return {
      score: 0.5,
      fillsNeed: false,
      pairScore: 0.5,
      compositionScore: 0.5,
      reliability: 0,
      coverage: 0,
      rankCoverage: 0,
      games: 0,
      rankGames: 0,
      patchGames: 0,
      minimumGames: 0,
      weightedWinRate: null,
      expectedWinRate: null,
      byAlly: [],
    };
  }

  const roleCounts = new Map<string, number>();
  for (const ally of allies) {
    for (const role of ally.roles) {
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    }
  }
  const needs = [
    { role: 'Disabler', target: 2, points: 0.16 },
    { role: 'Initiator', target: 1, points: 0.13 },
    { role: 'Durable', target: 1, points: 0.09 },
  ] as const;
  let compositionScore = 0.5;
  let fillsNeed = false;
  for (const need of needs) {
    if (
      (roleCounts.get(need.role) ?? 0) < need.target &&
      candidate.roles.includes(need.role)
    ) {
      compositionScore += need.points;
      fillsNeed = true;
    }
  }

  const meleeAllies = allies.filter(hero => hero.attackType === 'Melee').length;
  if (meleeAllies >= 3 && candidate.attackType === 'Melee') {
    compositionScore -= 0.18;
  }
  const carryAllies = allies.filter(hero =>
    hero.roles.includes('Carry')
  ).length;
  if (carryAllies >= 2 && candidate.roles.includes('Carry')) {
    compositionScore -= 0.12;
  }
  compositionScore = clamp(compositionScore);

  const candidateBaseline =
    snapshot.matchupBaselineByHero?.get(candidate.id) ?? candidate.winRate;
  const observed = allies.flatMap(ally => {
    const stat = snapshot.synergyByAlly.get(ally.id)?.get(candidate.id);
    if (!stat || stat.patchGames === 0) {
      return [];
    }
    const allyBaseline =
      snapshot.matchupBaselineByHero?.get(ally.id) ?? ally.winRate;
    const expected = clamp((candidateBaseline + allyBaseline) / 2, 0.4, 0.6);
    return [
      {
        heroId: ally.id,
        ...scopedPairRate(stat, expected, rankRequested),
      },
    ];
  });
  if (observed.length === 0) {
    return {
      score: compositionScore,
      fillsNeed,
      pairScore: 0.5,
      compositionScore,
      reliability: 0,
      coverage: 0,
      rankCoverage: 0,
      games: 0,
      rankGames: 0,
      patchGames: 0,
      minimumGames: 0,
      weightedWinRate: null,
      expectedWinRate: null,
      byAlly: [],
    };
  }

  const totalWeight = observed.reduce(
    (total, value) => total + Math.min(50, Math.sqrt(value.games)),
    0
  );
  const weightedAdvantage =
    observed.reduce(
      (total, value) =>
        total + value.advantage * Math.min(50, Math.sqrt(value.games)),
      0
    ) / totalWeight;
  const worstAdvantage = Math.min(...observed.map(value => value.advantage));
  const weightedWinRate =
    observed.reduce(
      (total, value) =>
        total + value.winRate * Math.min(50, Math.sqrt(value.games)),
      0
    ) / totalWeight;
  const expectedWinRate =
    observed.reduce(
      (total, value) =>
        total + value.expected * Math.min(50, Math.sqrt(value.games)),
      0
    ) / totalWeight;
  const coverage = observed.length / allies.length;
  const rankCoverage =
    observed.filter(value => value.stat.rankGames > 0).length / allies.length;
  const reliability =
    observed.reduce((total, value) => total + value.reliability, 0) /
    allies.length;
  const pairScore = clamp(
    0.5 + (weightedAdvantage * 0.8 + worstAdvantage * 0.2) / 0.1
  );
  const pairWeight = clamp(reliability * Math.sqrt(coverage), 0, 0.8);
  return {
    score: clamp(compositionScore * (1 - pairWeight) + pairScore * pairWeight),
    fillsNeed,
    pairScore,
    compositionScore,
    reliability,
    coverage,
    rankCoverage,
    games: observed.reduce((total, value) => total + value.games, 0),
    rankGames: observed.reduce(
      (total, value) => total + value.stat.rankGames,
      0
    ),
    patchGames: observed.reduce(
      (total, value) => total + value.stat.patchGames,
      0
    ),
    minimumGames: Math.min(...observed.map(value => value.games)),
    weightedWinRate,
    expectedWinRate,
    byAlly: observed.map(value => ({
      heroId: value.heroId,
      rankGames: value.stat.rankGames,
      rankWins: value.stat.rankWins,
      patchGames: value.stat.patchGames,
      patchWins: value.stat.patchWins,
      winRate: round(value.winRate),
      expectedWinRate: round(value.expected),
      advantage: round(value.advantage),
      reliability: round(value.reliability),
    })),
  };
}

function recommendationConfidence(
  matchup: MatchupEvaluation,
  metaReliability: number,
  pairDataReady: boolean,
  pairDataStale: boolean
): Recommendation['confidence'] {
  const combined = matchup.reliability * 0.75 + metaReliability * 0.25;
  if (
    pairDataReady &&
    !pairDataStale &&
    matchup.coverage === 1 &&
    matchup.reliability >= 0.5 &&
    metaReliability >= 0.6 &&
    combined >= 0.55
  ) {
    return 'high';
  }
  if (
    pairDataReady &&
    matchup.coverage >= 0.6 &&
    matchup.reliability >= 0.15 &&
    metaReliability >= 0.3 &&
    combined >= 0.25
  ) {
    return 'medium';
  }
  return 'low';
}

function recommendationReasons(
  metrics: RecommendationMetricsV2,
  matchup: MatchupEvaluation,
  team: TeamEvaluation
): RecommendationReason[] {
  const result: RecommendationReason[] = [];
  if (
    metrics.counter >= 0.67 &&
    matchup.coverage >= 0.6 &&
    matchup.reliability >= 0.2
  ) {
    result.push('strong_counter');
  }
  if (metrics.roleFit >= 0.75) result.push('good_role_fit');
  if (metrics.meta >= 0.66) result.push('meta_favorite');
  if (team.fillsNeed && metrics.synergy >= 0.62) result.push('fills_team_need');
  if (team.reliability >= 0.2 && team.pairScore >= 0.62)
    result.push('strong_synergy');
  if (
    matchup.coverage === 1 &&
    matchup.worstScore >= 0.54 &&
    matchup.reliability >= 0.25
  ) {
    result.push('stable_across_draft');
  }
  if (matchup.coverage < 1 || matchup.reliability < 0.2)
    result.push('limited_matchup_data');
  return result.slice(0, 4);
}

function roleSimilarity(left: HeroMeta, right: HeroMeta) {
  const leftRoles = new Set(left.roles);
  const overlap = right.roles.filter(role => leftRoles.has(role)).length;
  const union = new Set([...left.roles, ...right.roles]).size;
  const roles = union > 0 ? overlap / union : 0;
  const attackType = left.attackType === right.attackType ? 1 : 0;
  const attribute = left.primaryAttribute === right.primaryAttribute ? 1 : 0;
  return roles * 0.55 + attackType * 0.25 + attribute * 0.2;
}

function diversityPenalty(
  candidate: RecommendationCandidate,
  selected: RecommendationCandidate[]
) {
  if (selected.length === 0) {
    return 0;
  }
  const maximumSimilarity = Math.max(
    ...selected.map(entry => roleSimilarity(candidate.heroMeta, entry.heroMeta))
  );
  return maximumSimilarity * DIVERSITY_MAX_PENALTY;
}

function advisorAdjustment(
  candidate: RecommendationCandidate,
  advisorOrder: number[] | undefined,
  poolSize: number
) {
  if (!advisorOrder || poolSize <= 1) {
    return 0;
  }
  const advisorRank = advisorOrder.indexOf(candidate.heroMeta.id);
  if (advisorRank < 0) {
    return 0;
  }
  const rankDelta =
    (candidate.deterministicRank - advisorRank) / (poolSize - 1);
  return clamp(
    rankDelta * ADVISOR_MAX_POINTS,
    -ADVISOR_MAX_POINTS,
    ADVISOR_MAX_POINTS
  );
}

function withFinalScore(
  candidate: RecommendationCandidate,
  advisorPoints: number,
  diversityPoints: number
): RecommendationCandidate {
  const total = clamp(
    candidate.baseScore + advisorPoints - diversityPoints,
    0,
    100
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
  limit: number
) {
  const remaining = [...pool];
  const selected: RecommendationCandidate[] = [];
  while (remaining.length > 0 && selected.length < limit) {
    const ranked = remaining
      .map(candidate => {
        const advisorPoints = advisorAdjustment(
          candidate,
          advisorOrder,
          pool.length
        );
        const diversityPoints = diversityPenalty(candidate, selected);
        return withFinalScore(candidate, advisorPoints, diversityPoints);
      })
      .sort(
        (left, right) =>
          right.recommendation.scoreBreakdown.total -
            left.recommendation.scoreBreakdown.total ||
          right.baseScore - left.baseScore ||
          left.deterministicRank - right.deterministicRank ||
          left.heroMeta.id - right.heroMeta.id
      );
    const winner = ranked[0];
    if (!winner) {
      break;
    }
    selected.push(winner);
    const index = remaining.findIndex(
      candidate => candidate.heroMeta.id === winner.heroMeta.id
    );
    remaining.splice(index, 1);
  }
  return selected.map(candidate => candidate.recommendation);
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
  limit = CANDIDATE_POOL_LIMIT
): RecommendationCandidate[] {
  const unavailable = new Set([
    ...draft.allyHeroIds,
    ...draft.enemyHeroIds,
    ...(draft.bannedHeroIds ?? []),
  ]);
  const heroById = new Map(snapshot.heroes.map(hero => [hero.id, hero]));
  const allies = draft.allyHeroIds.flatMap(id => {
    const hero = heroById.get(id);
    return hero ? [hero] : [];
  });
  const positionStatsByHero = statsByHero(snapshot);
  const maximumHeroPicks = Math.max(
    0,
    ...snapshot.heroes.map(hero => hero.picks)
  );
  const maximumPositionPicks = Math.max(
    0,
    ...(snapshot.positionMeta?.positionStats
      .filter(stat => stat.position === draft.position)
      .map(stat => stat.picks) ?? [])
  );
  const rankRequested = draft.rank !== undefined;
  const rankPairSource = 'opendota_current_patch_rank_pairs';
  const allRankPairSource = 'opendota_current_patch_all_ranks_pairs';
  const pairDataReady = snapshot.pairScope?.availability === 'ready';
  const pairDataStale = snapshot.pairScope?.isStale ?? false;

  const candidates = snapshot.heroes
    .filter(hero => !unavailable.has(hero.id))
    .map(hero => {
      const position = positionEvaluation(
        hero,
        draft.position,
        positionStatsByHero
      );
      if (!isPositionEligible(hero, draft.position, position)) {
        return null;
      }
      const matchup = matchupEvaluation(
        hero,
        draft.enemyHeroIds,
        heroById,
        snapshot.matchupByEnemy,
        snapshot.matchupBaselineByHero,
        rankRequested
      );
      const meta = metaEvaluation(
        hero,
        draft.position,
        position.stat,
        snapshot,
        maximumHeroPicks,
        maximumPositionPicks,
        rankRequested
      );
      const team = teamEvaluation(hero, allies, snapshot, rankRequested);
      const matchupRankScoped = rankRequested && matchup.rankGames > 0;
      const teamRankScoped = rankRequested && team.rankGames > 0;
      const matchupSource = matchupRankScoped
        ? rankPairSource
        : allRankPairSource;
      const teamSource = teamRankScoped ? rankPairSource : allRankPairSource;
      const reliability =
        matchup.reliability * 0.65 +
        meta.reliability * 0.25 +
        team.reliability * 0.1;
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
        meta: roundPoints(meta.score * 18),
        teamFit: roundPoints(team.score * 16),
        reliability: roundPoints(reliability * 4),
        advisor: 0,
        diversity: 0,
        total: 0,
      };
      const baseScore =
        scoreBreakdown.role +
        scoreBreakdown.matchup +
        scoreBreakdown.meta +
        scoreBreakdown.teamFit +
        scoreBreakdown.reliability;
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
        confidence: recommendationConfidence(
          matchup,
          meta.reliability,
          pairDataReady,
          pairDataStale
        ),
        metrics,
        scoreBreakdown,
        evidence: {
          matchups: {
            source: matchupSource,
            opponentsCovered: Math.round(
              matchup.coverage * draft.enemyHeroIds.length
            ),
            opponentsTotal: draft.enemyHeroIds.length,
            games: matchup.games,
            minimumGames: matchup.minimumGames,
            weightedWinRate:
              matchup.weightedWinRate === null
                ? null
                : round(matchup.weightedWinRate),
            expectedWinRate: round(matchup.expectedWinRate),
            patch: snapshot.pairScope?.patch ?? snapshot.patch,
            rank: draft.rank ?? null,
            rankScoped: matchupRankScoped,
            rankOpponentsCovered: Math.round(
              matchup.rankCoverage * draft.enemyHeroIds.length
            ),
            rankGames: matchup.rankGames,
            patchGames: matchup.patchGames,
            minimumPatchGames: matchup.minimumPatchGames,
            isStale: pairDataStale,
            availability: snapshot.pairScope?.availability ?? 'unavailable',
            byOpponent: matchup.byOpponent,
          },
          synergy: {
            source:
              team.patchGames > 0 && pairDataReady
                ? teamSource
                : 'team_composition_only',
            alliesCovered: Math.round(team.coverage * allies.length),
            alliesTotal: allies.length,
            rankAlliesCovered: Math.round(team.rankCoverage * allies.length),
            games: team.games,
            rankGames: team.rankGames,
            patchGames: team.patchGames,
            minimumGames: team.minimumGames,
            weightedWinRate:
              team.weightedWinRate === null
                ? null
                : round(team.weightedWinRate),
            expectedWinRate:
              team.expectedWinRate === null
                ? null
                : round(team.expectedWinRate),
            pairScore: round(team.pairScore),
            compositionScore: round(team.compositionScore),
            reliability: round(team.reliability),
            patch: snapshot.pairScope?.patch ?? null,
            rank: draft.rank ?? null,
            rankScoped: teamRankScoped,
            isStale: pairDataStale,
            availability: snapshot.pairScope?.availability ?? 'unavailable',
            byAlly: team.byAlly,
          },
          meta: meta.evidence,
        },
        reasons: recommendationReasons(metrics, matchup, team),
      };
      return {
        recommendation,
        heroMeta: hero,
        baseScore,
        deterministicRank: 0,
      };
    })
    .filter(
      (candidate): candidate is RecommendationCandidate => candidate !== null
    )
    .sort(
      (left, right) =>
        right.baseScore - left.baseScore ||
        right.recommendation.evidence.matchups.games -
          left.recommendation.evidence.matchups.games ||
        left.heroMeta.id - right.heroMeta.id
    )
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
  advisorOrder?: number[]
): RecommendationResult {
  return {
    patch: request.snapshot.patch,
    metaFetchedAt: request.snapshot.fetchedAt,
    recommendations: selectRecommendations(
      pool,
      advisorOrder,
      DEFAULT_RESULT_LIMIT
    ),
    provenance,
  };
}

export function rankRecommendations(
  request: RankRequest
): RecommendationResult {
  const pool = rankRecommendationPool(request);
  return recommendationResultFromPool(request, pool, {
    engineVersion: 'deterministic-v3',
    scoringVersion: 'draft-pairs-v3',
    aiAssisted: false,
  });
}
