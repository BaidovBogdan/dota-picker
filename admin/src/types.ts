export type Plan = 'free' | 'pro';
export type AccountKind = 'guest' | 'user';
export type AnalysisStatus = 'completed' | 'failed' | 'processing';
export type AnalysisSource = 'photo' | 'manual';
export type PageId = 'overview' | 'users' | 'analyses' | 'reviews' | 'meta' | 'system';
export type ActivityTone = 'neutral' | 'positive' | 'warning' | 'negative';

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
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAnalysesResponse = {
  items: AdminAnalysis[];
  pagination: Pagination;
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
    patch: string;
    recommendations: AdminReviewHero[];
  };
  account: {
    id: string;
    kind: AccountKind;
    email: string | null;
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
