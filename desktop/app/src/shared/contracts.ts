import { z } from 'zod';

export const positionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const rankSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  language: z.enum(['ru', 'en']),
  position: positionSchema,
  rank: rankSchema.nullable(),
  startWithWindows: z.boolean(),
  minimizeToTray: z.boolean(),
  wishlist: z.array(z.number().int().positive()).max(200),
  assistantEnabled: z.boolean(),
  captureConsent: z.object({
    accepted: z.boolean(),
    acceptedAt: z.string().datetime().nullable(),
  }),
});

export const preferencesPatchSchema = preferencesSchema.partial();

export const otpRequestSchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('register'),
    email: z.string().trim().email(),
  }),
  z.object({
    purpose: z.literal('login'),
    email: z.string().trim().email(),
    password: z.string().min(10).max(128),
  }),
  z.object({
    purpose: z.literal('password_reset'),
    email: z.string().trim().email(),
  }),
  z.object({
    purpose: z.literal('password_change'),
  }),
]);

export const verifiedCredentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(10).max(128),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/),
});

export const passwordResetSchema = z.object({
  email: z.string().trim().email(),
  newPassword: z.string().min(10).max(128),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(10).max(128),
  newPassword: z.string().min(10).max(128),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/),
});

export const paginationSchema = z.object({
  cursor: z.string().trim().min(1).max(256).nullish(),
  limit: z.number().int().min(1).max(50).optional(),
}).optional();

export const idSchema = z.string().uuid();
export const heroIdSchema = z.number().int().positive();

export const metaQuerySchema = z.object({
  position: positionSchema.optional(),
  rank: rankSchema.nullish(),
}).optional();

export const reviewsQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).nullish(),
  limit: z.number().int().min(1).max(50).optional(),
  analysisId: z.string().uuid().optional(),
}).optional();

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  selectedHeroIds: z.array(z.number().int().positive()).max(3),
  comment: z.string().trim().max(500).optional(),
});

export const externalUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'https:' || protocol === 'mailto:';
});

export const enginePhaseSchema = z.enum([
  'off',
  'starting',
  'waiting_for_dota',
  'watching_draft',
  'recognizing',
  'analyzing',
  'ready',
  'quota',
  'error',
]);

export type Position = z.infer<typeof positionSchema>;
export type Rank = z.infer<typeof rankSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;
export type EnginePhase = z.infer<typeof enginePhaseSchema>;

export type Quota = {
  plan: 'free' | 'pro';
  remaining: number;
  limit: number;
  nextRefillAt: string | null;
  planExpiresAt: string | null;
};

export type Account = {
  id: string;
  kind: 'guest' | 'user';
  email: string | null;
  createdAt?: string;
  revenueCatAppUserId: string;
  quota: Quota;
};

export type SessionState = {
  authenticated: boolean;
  account: Account | null;
};

export type OtpChallenge = {
  challengeId: string;
  purpose: 'register' | 'login' | 'password_reset' | 'password_change';
  expiresAt: string;
  retryAfterSeconds: number;
};

export type Hero = {
  id: number;
  name: string;
  localizedName: string | null;
  primaryAttribute?: 'str' | 'agi' | 'int' | 'all';
  attackType?: 'Melee' | 'Ranged';
  imageUrl?: string;
  iconUrl?: string;
  roles?: string[];
  picks?: number;
  wins?: number;
  winRate?: number;
};

export type Analysis = {
  id: string;
  source: 'desktop' | 'manual' | 'photo';
  input: {
    source: 'desktop' | 'manual' | 'photo';
    position: Position;
    allyHeroIds: number[];
    enemyHeroIds: number[];
    bannedHeroIds?: number[];
    rank?: Rank;
  };
  result: {
    patch: string;
    metaFetchedAt: string;
    recommendations: Array<Record<string, unknown> & {
      hero: Hero;
      score: number;
      confidence: 'low' | 'medium' | 'high';
      reasons: string[];
    }>;
    provenance?: Record<string, unknown>;
  };
  createdAt: string;
};

export type HistoryPage = {
  items: Analysis[];
  nextCursor: string | null;
};

export type EngineState = {
  enabled: boolean;
  phase: EnginePhase;
  message: string | null;
  latestAnalysisId: string | null;
  lastSeenAt: string | null;
  dotaDetected: boolean;
  recognition?: {
    quality: 'clear' | 'partial' | 'not_dota' | 'too_blurry';
    recognized: Array<{
      side: 'ally' | 'enemy' | 'unknown';
      slot: number;
      heroId: number | null;
      heroName: string;
      localizedName: string | null;
      confidence: number;
      needsReview: boolean;
    }>;
  } | null;
};

export type AppInfo = {
  version: string;
  platform: NodeJS.Platform;
};

export type BillingStatus = {
  plan: 'free' | 'pro';
  active: boolean;
  expiresAt: string | null;
};

export type DesktopBridge = {
  session: {
    bootstrap: () => Promise<SessionState>;
    requestOtp: (input: z.infer<typeof otpRequestSchema>) => Promise<OtpChallenge>;
    login: (input: z.infer<typeof verifiedCredentialsSchema>) => Promise<{ account: Account }>;
    register: (input: z.infer<typeof verifiedCredentialsSchema>) => Promise<{ account: Account }>;
    reset: (input: z.infer<typeof passwordResetSchema>) => Promise<{ account: Account }>;
    change: (input: z.infer<typeof passwordChangeSchema>) => Promise<{ account: Account }>;
    logout: () => Promise<void>;
    getMe: () => Promise<{ account: Account }>;
    getQuota: () => Promise<{ quota: Quota }>;
    deleteAccount: () => Promise<void>;
  };
  data: {
    history: (input?: z.infer<typeof paginationSchema>) => Promise<HistoryPage>;
    analysis: (id: string) => Promise<{ analysis: Analysis }>;
    heroes: () => Promise<{ heroes: Hero[]; patch?: string; fetchedAt?: string }>;
    meta: (input?: z.infer<typeof metaQuerySchema>) => Promise<Record<string, unknown>>;
    hero: (id: number) => Promise<Record<string, unknown>>;
    reviews: (input?: z.infer<typeof reviewsQuerySchema>) => Promise<Record<string, unknown>>;
    upsertReview: (analysisId: string, input: z.infer<typeof reviewInputSchema>) => Promise<Record<string, unknown>>;
    deleteReview: (id: string) => Promise<void>;
  };
  billing: {
    status: () => Promise<BillingStatus>;
  };
  engine: {
    getState: () => Promise<EngineState>;
    setEnabled: (enabled: boolean) => Promise<EngineState>;
    retry: () => Promise<EngineState>;
    onState: (listener: (state: EngineState) => void) => () => void;
  };
  preferences: {
    get: () => Promise<Preferences>;
    update: (input: PreferencesPatch) => Promise<Preferences>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximized: (listener: (maximized: boolean) => void) => () => void;
  };
  app: {
    openExternal: (url: string) => Promise<void>;
    getInfo: () => Promise<AppInfo>;
  };
};

export type IpcSuccess<T> = { ok: true; value: T };
export type IpcFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    status: number | null;
    details?: unknown;
  };
};
export type IpcResult<T> = IpcSuccess<T> | IpcFailure;
