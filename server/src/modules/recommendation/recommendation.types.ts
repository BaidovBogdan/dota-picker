import type { HeroMeta, MetaSnapshot, RankBracket } from '../heroes/heroes.types.js';

export type Position = 1 | 2 | 3 | 4 | 5;

export type DraftInput = {
  source: 'manual' | 'photo';
  position: Position;
  allyHeroIds: number[];
  enemyHeroIds: number[];
  bannedHeroIds?: number[] | undefined;
  rank?: RankBracket | undefined;
};

export type RecommendationReason =
  | 'strong_counter'
  | 'good_role_fit'
  | 'meta_favorite'
  | 'fills_team_need'
  | 'limited_matchup_data';

export type RecommendationMetrics = {
  roleFit: number;
  counter: number;
  meta: number;
  synergy: number;
  reliability?: number | undefined;
  coverage?: number | undefined;
  worstMatchup?: number | undefined;
};

export type RecommendationMetricsV2 = RecommendationMetrics & {
  reliability: number;
  coverage: number;
  worstMatchup: number;
};

export type RecommendationScoreBreakdown = {
  role: number;
  matchup: number;
  meta: number;
  teamFit: number;
  reliability: number;
  advisor: number;
  diversity: number;
  total: number;
};

export type RecommendationEvidence = {
  matchups: {
    source: 'opendota_rolling_all_ranks';
    opponentsCovered: number;
    opponentsTotal: number;
    games: number;
    minimumGames: number;
    weightedWinRate: number | null;
    expectedWinRate: number;
  };
  meta: {
    source:
      | 'opendota_current_patch_30d_position'
      | 'opendota_rank_hero_stats'
      | 'opendota_public_hero_stats';
    games: number;
    wins: number;
    winRate: number;
    rankScoped: boolean;
    position: Position;
    positionApproximate: boolean | null;
    isStale: boolean;
  };
};

export type Recommendation = {
  hero: Pick<HeroMeta, 'id' | 'name' | 'localizedName' | 'imageUrl' | 'iconUrl' | 'roles'>;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  metrics: RecommendationMetrics;
  scoreBreakdown?: RecommendationScoreBreakdown | undefined;
  evidence?: RecommendationEvidence | undefined;
  reasons: RecommendationReason[];
};

export type RecommendationV2 = Recommendation & {
  metrics: RecommendationMetricsV2;
  scoreBreakdown: RecommendationScoreBreakdown;
  evidence: RecommendationEvidence;
};

export type RecommendationFallbackReason =
  | 'not_configured'
  | 'insufficient_candidates'
  | 'timeout'
  | 'invalid_response'
  | 'provider_error';

export type RecommendationProvenance = {
  engineVersion: 'hybrid-v2';
  scoringVersion: 'data-first-v2';
  aiAssisted: boolean;
  model?: string | undefined;
  promptVersion?: string | undefined;
  fallbackReason?: RecommendationFallbackReason | undefined;
};

export type RecommendationResult = {
  patch: string;
  metaFetchedAt: string;
  recommendations: Recommendation[];
  provenance?: RecommendationProvenance | undefined;
};

export type RankRequest = {
  draft: DraftInput;
  snapshot: MetaSnapshot;
};
