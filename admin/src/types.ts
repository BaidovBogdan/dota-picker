export type Plan = 'free' | 'pro';
export type AccountKind = 'guest' | 'user';
export type UserStatus = 'active' | 'suspended';
export type AnalysisStatus = 'completed' | 'failed' | 'processing';
export type AnalysisSource = 'photo' | 'manual';
export type RankBracket = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type HeroPosition = 1 | 2 | 3 | 4 | 5;

export type AdminUser = {
  id: string;
  displayName: string;
  email: string | null;
  kind: AccountKind;
  plan: Plan;
  status: UserStatus;
  quotaBalance: number;
  analysesCount: number;
  successRate: number;
  country: string;
  device: string;
  createdAt: string;
  lastActiveAt: string;
  planExpiresAt: string | null;
};

export type AdminAnalysis = {
  id: string;
  userId: string;
  status: AnalysisStatus;
  source: AnalysisSource;
  imageUrl: string | null;
  recommendation: string | null;
  recommendations: string[];
  position: HeroPosition;
  rank: RankBracket | null;
  allyHeroes: string[];
  enemyHeroes: string[];
  confidence: number | null;
  durationMs: number | null;
  patch: string;
  costUsd: number;
  errorCode: string | null;
  createdAt: string;
};

export type AdminReviewHero = {
  id: number;
  name: string;
  imageUrl: string;
};

export type AdminReview = {
  id: string;
  userId: string;
  analysisId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  selectedHeroes: AdminReviewHero[];
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminHeroMeta = {
  id: number;
  name: string;
  localizedName: string;
  imageUrl: string;
  roles: string[];
  picks: number;
  wins: number;
  winRate: number;
};

export type AdminHeroPositionStat = {
  heroId: number;
  position: HeroPosition;
  picks: number;
  wins: number;
  winRate: number;
  isApproximate: boolean;
  method: 'lane_role' | 'lane_role_farm_priority';
};

export type AdminMetaSnapshot = {
  heroes: AdminHeroMeta[];
  patch: string;
  rank: RankBracket | null;
  rankFilter: 'average_match_rank' | 'all_ranks';
  window: 'current_patch_30d';
  minimumGames: number;
  fetchedAt: string;
  isStale: boolean;
  availability: 'ready' | 'collecting';
  positionStats: AdminHeroPositionStat[];
};

export type AdminHeroDetail = {
  heroId: number;
  generatedAt: string;
  isStale: boolean;
  rankWinRates: Array<{
    rank: RankBracket;
    games: number;
    wins: number;
    winRate: number | null;
    window: 'rolling_7d';
  }>;
  builds: Array<{
    id: string;
    games: number;
    wins: number;
    winRate: number;
    itemNames: string[];
  }>;
  buildSampleSize: number;
  availability: {
    builds: 'ready' | 'collecting' | 'unavailable';
  };
};

export type DailyMetric = {
  date: string;
  checks: number;
  users: number;
  failures: number;
};

export type ActivityEvent = {
  id: string;
  type: 'user' | 'analysis' | 'billing' | 'system';
  title: string;
  detail: string;
  createdAt: string;
  tone: 'neutral' | 'positive' | 'warning' | 'negative';
};

export type PageId = 'overview' | 'users' | 'analyses' | 'reviews' | 'meta' | 'system';
