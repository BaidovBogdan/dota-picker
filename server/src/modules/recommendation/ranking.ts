import type { HeroMeta, MatchupStat } from '../heroes/heroes.types.js';
import type { Position, RankRequest, Recommendation, RecommendationReason, RecommendationResult } from './recommendation.types.js';

const positionRoleWeights: Record<Position, Record<string, number>> = {
  1: { Carry: 1, Escape: 0.25, Nuker: 0.2 },
  2: { Nuker: 1, Carry: 0.65, Disabler: 0.4, Escape: 0.25 },
  3: { Initiator: 1, Durable: 0.9, Disabler: 0.55, Carry: 0.3 },
  4: { Support: 0.8, Disabler: 1, Initiator: 0.65, Nuker: 0.4 },
  5: { Support: 1, Disabler: 0.8, Initiator: 0.45 },
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function roleFit(hero: HeroMeta, position: Position) {
  const weights = positionRoleWeights[position];
  return clamp(Math.max(0, ...hero.roles.map((role) => weights[role] ?? 0)));
}

function candidateWinRateAgainstEnemy(stat: MatchupStat | undefined) {
  if (!stat || stat.gamesPlayed === 0) {
    return { winRate: 0.5, games: 0 };
  }
  const candidateWins = stat.gamesPlayed - stat.wins;
  return {
    winRate: (candidateWins + 20) / (stat.gamesPlayed + 40),
    games: stat.gamesPlayed,
  };
}

function matchupScore(heroId: number, enemyIds: number[], matchupByEnemy: RankRequest['snapshot']['matchupByEnemy']) {
  const values = enemyIds.map((enemyId) => candidateWinRateAgainstEnemy(matchupByEnemy.get(enemyId)?.get(heroId)));
  const games = values.reduce((total, value) => total + value.games, 0);
  const weighted = values.reduce((total, value) => total + value.winRate * Math.max(1, Math.sqrt(value.games)), 0);
  const weight = values.reduce((total, value) => total + Math.max(1, Math.sqrt(value.games)), 0);
  const winRate = weight > 0 ? weighted / weight : 0.5;
  return { score: clamp((winRate - 0.42) / 0.16), games };
}

function metaScore(hero: HeroMeta) {
  const winComponent = clamp((hero.winRate - 0.43) / 0.14);
  const sampleComponent = clamp(Math.log10(hero.picks + 1) / 5);
  return winComponent * 0.8 + sampleComponent * 0.2;
}

function synergyScore(candidate: HeroMeta, allies: HeroMeta[]) {
  if (allies.length === 0) {
    return 0.5;
  }

  const teamRoles = new Set(allies.flatMap((hero) => hero.roles));
  let score = 0.45;
  if (!teamRoles.has('Disabler') && candidate.roles.includes('Disabler')) {
    score += 0.22;
  }
  if (!teamRoles.has('Initiator') && candidate.roles.includes('Initiator')) {
    score += 0.16;
  }
  if (!teamRoles.has('Durable') && candidate.roles.includes('Durable')) {
    score += 0.12;
  }

  const meleeAllies = allies.filter((hero) => hero.attackType === 'Melee').length;
  if (meleeAllies >= 3 && candidate.attackType === 'Melee') {
    score -= 0.2;
  }
  return clamp(score);
}

function confidence(games: number, enemyCount: number): Recommendation['confidence'] {
  const average = enemyCount > 0 ? games / enemyCount : 0;
  if (average >= 300) {
    return 'high';
  }
  if (average >= 80) {
    return 'medium';
  }
  return 'low';
}

function reasons(metrics: Recommendation['metrics'], games: number): RecommendationReason[] {
  const result: RecommendationReason[] = [];
  if (metrics.counter >= 0.67) result.push('strong_counter');
  if (metrics.roleFit >= 0.75) result.push('good_role_fit');
  if (metrics.meta >= 0.65) result.push('meta_favorite');
  if (metrics.synergy >= 0.65) result.push('fills_team_need');
  if (games < 80) result.push('limited_matchup_data');
  return result.slice(0, 3);
}

export function rankRecommendations({ draft, snapshot }: RankRequest): RecommendationResult {
  const unavailable = new Set([...draft.allyHeroIds, ...draft.enemyHeroIds]);
  const heroById = new Map(snapshot.heroes.map((hero) => [hero.id, hero]));
  const allies = draft.allyHeroIds.flatMap((id) => {
    const hero = heroById.get(id);
    return hero ? [hero] : [];
  });

  const ranked = snapshot.heroes
    .filter((hero) => !unavailable.has(hero.id))
    .map((hero) => {
      const role = roleFit(hero, draft.position);
      const matchup = matchupScore(hero.id, draft.enemyHeroIds, snapshot.matchupByEnemy);
      const meta = metaScore(hero);
      const synergy = synergyScore(hero, allies);
      const total = role * 0.34 + matchup.score * 0.38 + meta * 0.18 + synergy * 0.1;
      const metrics = {
        roleFit: round(role),
        counter: round(matchup.score),
        meta: round(meta),
        synergy: round(synergy),
      };
      return {
        hero,
        total,
        matchupGames: matchup.games,
        metrics,
      };
    })
    .filter((candidate) => candidate.metrics.roleFit >= 0.3)
    .sort((left, right) => right.total - left.total || right.matchupGames - left.matchupGames || left.hero.id - right.hero.id)
    .slice(0, 3)
    .map(({ hero, total, matchupGames, metrics }) => ({
      hero: {
        id: hero.id,
        name: hero.name,
        localizedName: hero.localizedName,
        imageUrl: hero.imageUrl,
        iconUrl: hero.iconUrl,
        roles: hero.roles,
      },
      score: Math.round(clamp(total) * 100),
      confidence: confidence(matchupGames, draft.enemyHeroIds.length),
      metrics,
      reasons: reasons(metrics, matchupGames),
    }));

  return {
    patch: snapshot.patch,
    metaFetchedAt: snapshot.fetchedAt,
    recommendations: ranked,
  };
}

