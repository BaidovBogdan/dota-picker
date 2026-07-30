export type ThemeMode = 'system' | 'light' | 'dark';
export type Language = 'ru' | 'en';
export type Position = 1 | 2 | 3 | 4 | 5;
export type Plan = 'free' | 'pro';
export type AnalysisSource = 'desktop' | 'manual' | 'photo';
export type Confidence = 'low' | 'medium' | 'high';

export type Quota = {
  plan: Plan;
  remaining: number;
  limit: number;
  nextRefillAt: string | null;
  planExpiresAt: string | null;
};

export type Account = {
  id: string;
  kind: 'guest' | 'user';
  email: string | null;
  revenueCatAppUserId?: string;
  quota: Quota;
};

export type SessionState = {
  authenticated: boolean;
  account: Account | null;
};

export type OtpPurpose =
  | 'login'
  | 'register'
  | 'password_reset'
  | 'password_change';

export type OtpChallenge = {
  challengeId: string;
  purpose: OtpPurpose;
  expiresAt: string;
  retryAfterSeconds: number;
};

export type EnginePhase =
  | 'off'
  | 'starting'
  | 'waiting_for_dota'
  | 'watching_draft'
  | 'recognizing'
  | 'analyzing'
  | 'ready'
  | 'quota'
  | 'error';

export type EngineState = {
  enabled: boolean;
  phase: EnginePhase;
  message: string | null;
  latestAnalysisId: string | null;
  lastSeenAt: string | null;
  dotaDetected: boolean;
  recognition?: {
    quality: 'clear' | 'partial' | 'not_dota' | 'too_blurry';
    recognized: {
      side: 'ally' | 'enemy' | 'unknown';
      slot: number;
      heroId: number | null;
      heroName: string;
      localizedName: string | null;
      confidence: number;
      needsReview: boolean;
    }[];
  } | null;
};

export type Preferences = {
  theme: ThemeMode;
  language: Language;
  position: Position;
  rank: number | null;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  wishlist: number[];
  assistantEnabled: boolean;
  captureConsent: {
    accepted: boolean;
    acceptedAt: string | null;
  };
};

export type HeroAttribute = 'str' | 'agi' | 'int' | 'all';

export type Hero = {
  id: number;
  name: string;
  localizedName: string | null;
  primaryAttribute?: HeroAttribute;
  imageUrl?: string;
  iconUrl?: string;
  roles?: string[];
  picks?: number;
  wins?: number;
  winRate?: number;
};

export type PairEvidence = {
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

export type RecommendationMetrics = {
  roleFit: number;
  counter: number;
  meta: number;
  synergy: number;
  reliability?: number;
  coverage?: number;
  worstMatchup?: number;
};

export type ScoreBreakdown = {
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
    byOpponent?: PairEvidence[];
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
    byAlly: PairEvidence[];
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

export type Recommendation = {
  hero: Hero;
  score: number;
  confidence: Confidence;
  metrics?: RecommendationMetrics;
  scoreBreakdown?: ScoreBreakdown;
  evidence?: RecommendationEvidence;
  reasons: string[];
  risks?: string[];
};

export type Provenance = {
  engineVersion: string;
  scoringVersion: string;
  aiAssisted: boolean;
  model?: string;
  promptVersion?: string;
  fallbackReason?: string;
};

export type Analysis = {
  id: string;
  source: AnalysisSource;
  input: {
    source: AnalysisSource;
    position: Position;
    allyHeroIds: number[];
    enemyHeroIds: number[];
    rank?: number;
  };
  result: {
    patch: string;
    metaFetchedAt: string;
    recommendations: Recommendation[];
    provenance?: Provenance;
  };
  createdAt: string;
};

export type HistoryPage = {
  items: Analysis[];
  nextCursor: string | null;
};

export type PositionStat = {
  heroId: number;
  position: Position;
  picks: number;
  wins: number;
  winRate: number;
  isApproximate: boolean;
  method: 'lane_role' | 'lane_role_farm_priority';
};

export type MetaResponse = {
  heroes: Hero[];
  patch: string;
  rank: number | null;
  rankFilter: 'average_match_rank' | 'all_ranks';
  window: string;
  minimumGames: number;
  fetchedAt: string;
  isStale: boolean;
  availability: 'ready' | 'collecting';
  positionStats: PositionStat[];
};

export type HeroBuildItem = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  order: number;
  medianPurchaseSec: number;
  p25PurchaseSec: number;
  p75PurchaseSec: number;
};

export type HeroDetail = {
  hero: Hero;
  patch: {
    id: number;
    name: string;
    releasedAt: string | null;
  };
  generatedAt: string;
  isStale: boolean;
  rankWinRates: {
    rank: number;
    games: number;
    wins: number;
    winRate: number | null;
    window: string;
  }[];
  builds: {
    id: string;
    games: number;
    wins: number;
    winRate: number;
    items: HeroBuildItem[];
    source: string;
  }[];
  buildSampleSize: number;
  availability: {
    builds: 'ready' | 'collecting' | 'unavailable';
  };
};

export type Review = {
  id: string;
  analysisId: string;
  rating: number;
  selectedHeroIds: number[];
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  analysis?: {
    source: AnalysisSource;
    patch: string;
    recommendations: Hero[];
  };
};

export type ReviewsPage = {
  items: Review[];
  nextCursor: string | null;
  total: number;
};

export type AppInfo = {
  version: string;
  platform: string;
};

export type BillingStatus = {
  plan: Plan;
  active: boolean;
  expiresAt: string | null;
};

export type NativeBridge = {
  session: {
    bootstrap: () => Promise<SessionState | Account | { account: Account } | null>;
    requestOtp: (input: {
      purpose: OtpPurpose;
      email?: string;
      password?: string;
    }) => Promise<OtpChallenge>;
    login: (input: {
      email: string;
      password: string;
      challengeId: string;
      code: string;
    }) => Promise<SessionState | Account | { account: Account }>;
    register: (input: {
      email: string;
      password: string;
      challengeId: string;
      code: string;
    }) => Promise<SessionState | Account | { account: Account }>;
    reset: (input: {
      email: string;
      newPassword: string;
      challengeId: string;
      code: string;
    }) => Promise<SessionState | Account | { account: Account }>;
    change: (input: {
      currentPassword: string;
      newPassword: string;
      challengeId: string;
      code: string;
    }) => Promise<SessionState | Account | { account: Account }>;
    logout: () => Promise<void>;
    getMe: () => Promise<Account | { account: Account }>;
    getQuota: () => Promise<Quota | { quota: Quota }>;
    deleteAccount: () => Promise<void>;
  };
  data: {
    history: (input?: {
      cursor?: string | null;
      limit?: number;
    }) => Promise<HistoryPage | { items: Analysis[]; nextCursor?: string | null }>;
    analysis: (id: string) => Promise<Analysis | { analysis: Analysis }>;
    heroes: () => Promise<Hero[] | { heroes: Hero[] }>;
    meta: (input: { position: Position; rank?: number | null }) => Promise<MetaResponse>;
    hero: (id: number) => Promise<HeroDetail>;
    reviews: (input?: {
      cursor?: string | null;
      limit?: number;
      analysisId?: string;
    }) => Promise<ReviewsPage | { reviews: Review[] }>;
    upsertReview: (
      analysisId: string,
      input: { rating: number; selectedHeroIds: number[]; comment?: string },
    ) => Promise<Review | { review: Review }>;
    deleteReview: (id: string) => Promise<void>;
  };
  billing: {
    status: () => Promise<BillingStatus>;
  };
  engine: {
    getState: () => Promise<EngineState>;
    setEnabled: (enabled: boolean) => Promise<EngineState>;
    retry: () => Promise<EngineState>;
    onState: (listener: (state: EngineState) => void) => (() => void) | void;
  };
  preferences: {
    get: () => Promise<Preferences>;
    update: (input: Partial<Preferences>) => Promise<Preferences>;
  };
  window: {
    minimize: () => Promise<void> | void;
    maximize: () => Promise<void> | void;
    close: () => Promise<void> | void;
    isMaximized: () => Promise<boolean>;
    onMaximized: (listener: (maximized: boolean) => void) => (() => void) | void;
  };
  app: {
    openExternal: (url: string) => Promise<void> | void;
    getInfo: () => Promise<AppInfo>;
  };
};
