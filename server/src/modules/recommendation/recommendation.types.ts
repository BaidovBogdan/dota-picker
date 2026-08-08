import type { HeroMeta, MetaSnapshot, RankBracket } from '../heroes/heroes.types.js';

export type Position = 1 | 2 | 3 | 4 | 5;

export type DraftInput = {
  source: 'manual' | 'photo' | 'overwolf';
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
  | 'strong_synergy'
  | 'stable_across_draft'
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
    source:
      | 'opendota_rolling_all_ranks'
      | 'opendota_current_patch_rank_pairs'
      | 'opendota_current_patch_all_ranks_pairs';
    opponentsCovered: number;
    opponentsTotal: number;
    games: number;
    minimumGames: number;
    weightedWinRate: number | null;
    expectedWinRate: number;
    patch?: string | undefined;
    rank?: RankBracket | null | undefined;
    rankScoped?: boolean | undefined;
    rankOpponentsCovered?: number | undefined;
    rankGames?: number | undefined;
    patchGames?: number | undefined;
    minimumPatchGames?: number | undefined;
    isStale?: boolean | undefined;
    availability?: 'ready' | 'unavailable' | undefined;
    byOpponent?: RecommendationPairEvidence[] | undefined;
  };
  synergy?: {
    source:
      | 'opendota_current_patch_rank_pairs'
      | 'opendota_current_patch_all_ranks_pairs'
      | 'team_composition_only';
    alliesCovered: number;
    alliesTotal: number;
    rankAlliesCovered: number;
    games: number;
    rankGames: number;
    patchGames: number;
    minimumGames: number;
    weightedWinRate: number | null;
    expectedWinRate: number | null;
    pairScore: number;
    compositionScore: number;
    reliability: number;
    patch: string | null;
    rank: RankBracket | null;
    rankScoped: boolean;
    isStale: boolean;
    availability: 'ready' | 'unavailable';
    byAlly: RecommendationPairEvidence[];
  } | undefined;
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

export type RecommendationPairEvidence = {
  heroId: number;
  rankGames: number;
  rankWins: number;
  patchGames: number;
  patchWins: number;
  winRate: number;
  expectedWinRate: number;
  advantage: number;
  reliability: number;
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
  engineVersion: 'hybrid-v2' | 'deterministic-v3';
  scoringVersion: 'data-first-v2' | 'draft-pairs-v3';
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
