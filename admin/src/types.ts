export type Plan = 'free' | 'pro';
export type AccountKind = 'guest' | 'user';
export type AnalysisStatus = 'completed' | 'failed' | 'processing';
export type AnalysisSource = 'photo' | 'manual' | 'overwolf';
export type PageId = 'overview' | 'users' | 'analyses' | 'reviews' | 'meta' | 'system';
export type ActivityTone = 'neutral' | 'positive' | 'warning' | 'negative';
export type RankBracket = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type HeroPosition = 1 | 2 | 3 | 4 | 5;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type Pagination = {
  limit: number;
  offset: number;
  total: number;
};

export type AdminSession = {
  token: string;
  expiresAt: string;
};

export type DailyMetric = {
  date: string;
  analyses: number;
  activeUsers: number;
  failed: number;
};

export type ActivityEvent = {
  id: string;
  type: 'user' | 'analysis' | 'billing' | 'system';
  title: string;
  detail: string;
  createdAt: string;
  tone: ActivityTone;
};

export type AdminOverview = {
  generatedAt: string;
  range: {
    days: 7 | 30;
    from: string;
    to: string;
  };
  totals: {
    users: number;
    registered: number;
    guests: number;
    pro: number;
    analyses: number;
    completed: number;
    failed: number;
    processing: number;
    reviews: number;
  };
  daily: DailyMetric[];
  recentActivity: ActivityEvent[];
};

export type AdminUser = {
  id: string;
  kind: AccountKind;
  email: string | null;
  deviceId: string | null;
  plan: Plan;
  complimentaryPro: boolean;
  planProductId: string | null;
  planExpiresAt: string | null;
  quotaBalance: number;
  quotaRefreshedAt: string;
  billingUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  analysesCount: number;
  completedCount: number;
  failedCount: number;
  processingCount: number;
  reviewsCount: number;
  successRate: number | null;
  lastAnalysisAt: string | null;
};

export type AdminUsersResponse = {
  items: AdminUser[];
  pagination: Pagination;
};

export type AdminUsersQuery = {
  limit: number;
  offset: number;
  q?: string;
  kind?: AccountKind;
  plan?: Plan;
};

export type AdminAnalysisRecommendation = {
  hero: {
    id: number;
    name: string;
    localizedName: string;
    imageUrl: string;
    iconUrl: string;
    roles: string[];
  };
  score: number;
  confidence: 'low' | 'medium' | 'high';
  metrics: {
    roleFit: number;
    counter: number;
    meta: number;
    synergy: number;
    reliability?: number;
    coverage?: number;
    worstMatchup?: number;
  };
  scoreBreakdown?: {
    role: number;
    matchup: number;
    meta: number;
    teamFit: number;
    reliability: number;
    advisor: number;
    diversity: number;
    total: number;
  };
  evidence?: {
    matchups: {
      source: string;
      opponentsCovered: number;
      opponentsTotal: number;
      games: number;
      minimumGames: number;
      weightedWinRate: number | null;
      expectedWinRate: number;
      availability?: 'ready' | 'unavailable';
      isStale?: boolean;
    };
    synergy?: {
      source: string;
      alliesCovered: number;
      alliesTotal: number;
      games: number;
      availability: 'ready' | 'unavailable';
      isStale: boolean;
    };
    meta: {
      source: string;
      games: number;
      wins: number;
      winRate: number;
      rankScoped: boolean;
      position: 1 | 2 | 3 | 4 | 5;
      positionApproximate: boolean | null;
      isStale: boolean;
    };
  };
  reasons: string[];
};

export type AdminRecommendationResult = {
  patch: string;
  metaFetchedAt: string;
  recommendations: AdminAnalysisRecommendation[];
  provenance?: {
    engineVersion: 'hybrid-v2' | 'deterministic-v3';
    scoringVersion: 'data-first-v2' | 'draft-pairs-v3';
    aiAssisted: boolean;
    model?: string;
    promptVersion?: string;
    fallbackReason?: 'not_configured' | 'insufficient_candidates' | 'timeout' | 'invalid_response' | 'provider_error';
  };
};

export type AdminAnalysis = {
  id: string;
  accountId: string;
  account: {
    id: string;
    kind: AccountKind;
    email: string | null;
  };
  status: AnalysisStatus;
  source: AnalysisSource;
  patch: string | null;
  errorCode: string | null;
  input: {
    source: AnalysisSource;
    position: 1 | 2 | 3 | 4 | 5;
    allyHeroIds: number[];
    enemyHeroIds: number[];
    bannedHeroIds: number[];
    rank?: RankBracket;
  } | null;
  result: AdminRecommendationResult | null;
  rawInput: JsonValue;
  rawResult: JsonValue;
  dataQuality: {
    input: 'valid' | 'legacy_invalid';
    result: 'valid' | 'absent' | 'legacy_invalid';
    issues: string[];
  };
  revision: number;
  durationMs: number | null;
  durationKind: 'initial_terminal_state' | 'session_to_latest_revision' | 'in_progress';
  quotaEvents: Array<{
    id: string;
    delta: number;
    reason: 'analysis' | 'refund';
    createdAt: string;
  }>;
  sourceImage: {
    stored: false;
    status: 'not_stored' | 'not_applicable';
    detail: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminAnalysesResponse = {
  items: AdminAnalysis[];
  pagination: Pagination;
};

export type AdminAnalysesQuery = {
  limit: number;
  offset: number;
  q?: string;
  id?: string;
  accountId?: string;
  status?: AnalysisStatus;
  source?: AnalysisSource;
};

export type AdminReviewHero = {
  id: number;
  localizedName: string;
  imageUrl: string;
  iconUrl: string;
};

export type AdminReview = {
  id: string;
  analysisId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  selectedHeroIds: number[];
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  analysis: {
    source: AnalysisSource;
    patch: string | null;
    recommendations: AdminReviewHero[];
    rawResult: JsonValue;
    dataQuality: {
      result: 'valid' | 'absent' | 'legacy_invalid';
      issues: string[];
    };
  };
  account: {
    id: string;
    kind: AccountKind;
    email: string | null;
    plan: Plan;
  };
};

export type AdminReviewsResponse = {
  summary: {
    count: number;
    averageRating: number | null;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  };
  items: AdminReview[];
  pagination: Pagination;
};

export type AdminReviewsQuery = {
  limit: number;
  offset: number;
  q?: string;
  accountId?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  hasComment?: 'true' | 'false';
};

export type AdminHeroMeta = {
  id: number;
  name: string;
  localizedName: string;
  primaryAttribute: 'str' | 'agi' | 'int' | 'all';
  attackType: 'Melee' | 'Ranged';
  roles: string[];
  imageUrl: string;
  iconUrl: string;
  picks: number;
  wins: number;
  winRate: number;
};

export type HeroCatalogResponse = {
  heroes: AdminHeroMeta[];
  patch: string;
  fetchedAt: string;
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

export type AdminMeta = {
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

export type AdminSystemItem = {
  id: string;
  name: string;
  status: 'connected' | 'connectable' | 'blocked';
  detail: string;
  reason: string | null;
  missing: string[];
};

export type AdminSystem = {
  generatedAt: string;
  summary: {
    api: {
      status: 'connected';
    };
    database: {
      status: 'connected' | 'blocked';
      latencyMs: number;
    };
    connected: number;
    connectable: number;
    blocked: number;
  };
  groups: {
    connected: AdminSystemItem[];
    connectable: AdminSystemItem[];
    blocked: AdminSystemItem[];
  };
};

export type AdminGrantResult = {
  marker: 'admin-grant-all-2026-08-02';
  alreadyApplied: boolean;
  totalAccounts: number;
  eligibleAccounts: number;
  grantedAccounts: number;
  quotaBalance: number;
  appliedAt: string;
};
