export type Plan = 'free' | 'pro';
export type AccountKind = 'guest' | 'user';
export type UserStatus = 'active' | 'suspended';
export type AnalysisStatus = 'completed' | 'failed' | 'processing';
export type AnalysisSource = 'photo' | 'manual';

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
  position: number;
  detectedHeroes: string[];
  confidence: number | null;
  durationMs: number | null;
  patch: string;
  costUsd: number;
  errorCode: string | null;
  createdAt: string;
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

export type PageId = 'overview' | 'users' | 'analyses' | 'system';
