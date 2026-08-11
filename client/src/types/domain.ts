export type HeroAttribute = 'strength' | 'agility' | 'intelligence' | 'universal';
export type Position = 1 | 2 | 3 | 4 | 5;
export type DraftTeam = 'allies' | 'enemies';
export type DraftSource = 'manual' | 'photo' | 'overwolf';
export type PlanId = 'free' | 'pro';

export type Hero = {
  id: number;
  slug: string;
  name: string;
  attribute: HeroAttribute;
  positions: Position[];
  imageUrl: string;
  iconUrl?: string;
  picks?: number;
  wins?: number;
  winRate?: number;
};

export type Draft = {
  allies: number[];
  enemies: number[];
  position: Position | null;
  rank: number | null;
  source: DraftSource;
  photoUri: string | null;
  updatedAt: string;
};

export type RecommendationMetrics = {
  roleFit: number;
  counter: number;
  meta: number;
  synergy: number;
  reliability?: number;
  coverage?: number;
  worstMatchup?: number;
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

export type RecommendationEvidence = {
  matchups: {
    source: string;
    opponentsCovered: number;
    opponentsTotal: number;
    games: number;
    minimumGames: number;
    weightedWinRate: number | null;
    expectedWinRate: number;
    patch?: string;
    rank?: number | null;
    rankScoped?: boolean;
    rankOpponentsCovered?: number;
    rankGames?: number;
    patchGames?: number;
    minimumPatchGames?: number;
    isStale?: boolean;
    availability?: 'ready' | 'unavailable';
    byOpponent?: RecommendationPairEvidence[];
  };
  synergy?: {
    source: string;
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
    rank: number | null;
    rankScoped: boolean;
    isStale: boolean;
    availability: 'ready' | 'unavailable';
    byAlly: RecommendationPairEvidence[];
  };
  meta: {
    source: string;
    games: number;
    wins: number;
    winRate: number;
    rankScoped: boolean;
    position: Position;
    positionApproximate: boolean | null;
    isStale: boolean;
  };
};

export type RecommendationProvenance = {
  engineVersion: string;
  scoringVersion: string;
  aiAssisted: boolean;
  model?: string;
  promptVersion?: string;
  fallbackReason?: string;
};

export type Recommendation = {
  hero: Hero;
  score: number;
  label: 'best' | 'reliable' | 'fallback' | 'Лучший ответ' | 'Надёжный выбор' | 'Запасной план';
  confidence?: 'high' | 'medium' | 'low';
  metrics?: RecommendationMetrics;
  scoreBreakdown?: RecommendationScoreBreakdown;
  evidence?: RecommendationEvidence;
  reasons: string[];
  risks: string[];
  laneFit: string;
};

export type AnalysisResult = {
  id: string;
  serverId?: string;
  ownerScope?: string;
  detailLevel?: 'summary';
  draft: Draft;
  recommendations: Recommendation[];
  patch: string;
  confidence: 'high' | 'medium' | 'low';
  dataUpdatedAt: string;
  createdAt: string;
  source: 'server' | 'offline';
  provenance?: RecommendationProvenance;
};

export type HistoryRecord = AnalysisResult;

export type AnalysisReview = {
  id: string;
  analysisId: string;
  rating: number;
  selectedHeroIds: number[];
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  analysis?: {
    source: DraftSource;
    patch: string;
    recommendations: Hero[];
  };
};

export type Session = {
  userId: string;
  kind: 'guest' | 'registered';
  email: string | null;
  displayName: string;
  plan: PlanId;
  revenueCatAppUserId: string;
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type Language = 'ru' | 'en';
export type LanguageMode = 'system' | Language;

export type Attempts = {
  remaining: number;
  maximum: number;
  nextRefreshAt: string;
  planExpiresAt?: string | null;
};

export type NeutralRecognizedPick = {
  heroId: number | null;
  name: string;
  visualGroup?: 'left' | 'right';
  slot: number;
  confidence: number;
  needsReview: boolean;
};

export type RecognizedDraft = {
  allies: number[];
  enemies: number[];
  neutralPicks: NeutralRecognizedPick[];
  confidence: number;
  warnings: string[];
};

export type BillingPlan = {
  packageId: string;
  productId: string;
  title: string;
  price: string;
  period: 'monthly' | 'annual' | 'unknown';
};
