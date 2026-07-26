import type { HeroMeta, MetaSnapshot, RankBracket } from '../heroes/heroes.types.js';

export type Position = 1 | 2 | 3 | 4 | 5;

export type DraftInput = {
  source: 'manual' | 'photo';
  position: Position;
  allyHeroIds: number[];
  enemyHeroIds: number[];
  rank?: RankBracket | undefined;
};

export type RecommendationReason =
  | 'strong_counter'
  | 'good_role_fit'
  | 'meta_favorite'
  | 'fills_team_need'
  | 'limited_matchup_data';

export type Recommendation = {
  hero: Pick<HeroMeta, 'id' | 'name' | 'localizedName' | 'imageUrl' | 'iconUrl' | 'roles'>;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  metrics: {
    roleFit: number;
    counter: number;
    meta: number;
    synergy: number;
  };
  reasons: RecommendationReason[];
};

export type RecommendationResult = {
  patch: string;
  metaFetchedAt: string;
  recommendations: Recommendation[];
};

export type RankRequest = {
  draft: DraftInput;
  snapshot: MetaSnapshot;
};
