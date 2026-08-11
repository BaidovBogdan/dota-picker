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

export const assistantModeSchema = z.enum(['vision', 'overwolf']);
export const draftAllyGroupSchema = z.enum(['left', 'right']);
export const overlayVisibleSlotSchema = z.object({
  slot: z.number().int().min(0).max(4),
  side: z.enum(['ally', 'enemy']),
  heroId: z.number().int().positive(),
}).strict();
export const overlayVisibleSlotsSchema = z.array(overlayVisibleSlotSchema).max(10).superRefine((slots, context) => {
  const identities = slots.map((slot) => `${slot.side}:${slot.slot}`);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: 'custom', message: 'Overlay slots must be unique' });
  }
});

const acceleratorModifiers = new Map<string, string>([
  ['command', 'Command'],
  ['cmd', 'Command'],
  ['control', 'Control'],
  ['ctrl', 'Control'],
  ['commandorcontrol', 'CommandOrControl'],
  ['cmdorctrl', 'CommandOrControl'],
  ['alt', 'Alt'],
  ['option', 'Alt'],
  ['altgr', 'AltGr'],
  ['shift', 'Shift'],
  ['super', 'Super'],
  ['meta', 'Super'],
]);

const acceleratorKeys = new Map<string, string>([
  ['plus', 'Plus'],
  ['space', 'Space'],
  ['tab', 'Tab'],
  ['capslock', 'Capslock'],
  ['numlock', 'Numlock'],
  ['scrolllock', 'Scrolllock'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['insert', 'Insert'],
  ['return', 'Return'],
  ['enter', 'Return'],
  ['up', 'Up'],
  ['arrowup', 'Up'],
  ['down', 'Down'],
  ['arrowdown', 'Down'],
  ['left', 'Left'],
  ['arrowleft', 'Left'],
  ['right', 'Right'],
  ['arrowright', 'Right'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pgup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['pgdown', 'PageDown'],
  ['pgdn', 'PageDown'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['volumeup', 'VolumeUp'],
  ['volumedown', 'VolumeDown'],
  ['volumemute', 'VolumeMute'],
  ['medianexttrack', 'MediaNextTrack'],
  ['mediaprevioustrack', 'MediaPreviousTrack'],
  ['mediastop', 'MediaStop'],
  ['mediaplaypause', 'MediaPlayPause'],
  ['printscreen', 'PrintScreen'],
]);

const acceleratorModifierOrder = [
  'CommandOrControl',
  'Command',
  'Control',
  'Alt',
  'AltGr',
  'Shift',
  'Super',
];

const acceleratorPunctuation = new Set([
  ')',
  '!',
  '@',
  '#',
  '$',
  '%',
  '^',
  '&',
  '*',
  '(',
  ':',
  ';',
  '=',
  '<',
  ',',
  '_',
  '-',
  '>',
  '.',
  '?',
  '/',
  '~',
  '`',
  '{',
  ']',
  '[',
  '|',
  '\\',
  '}',
  '"',
]);

export function normalizeOverlayShortcut(value: string): string | null {
  const parts = value.trim().split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 5) return null;
  const keyInput = parts.at(-1);
  if (!keyInput) return null;
  const modifiers = parts.slice(0, -1).map((part) => acceleratorModifiers.get(part.toLowerCase()));
  if (modifiers.some((modifier) => !modifier)) return null;
  const uniqueModifiers = new Set(modifiers as string[]);
  if (uniqueModifiers.size !== modifiers.length) return null;
  const upperKey = keyInput.toUpperCase();
  const functionKeyMatch = /^F([1-9]|1\d|2[0-4])$/.exec(upperKey);
  const numpadKeyMatch = /^(num[0-9]|numdec|numadd|numsub|nummult|numdiv)$/i.exec(keyInput);
  const key = /^[A-Z0-9]$/.test(upperKey)
    ? upperKey
    : functionKeyMatch?.[0]
      ?? numpadKeyMatch?.[0].toLowerCase()
      ?? (acceleratorPunctuation.has(keyInput) ? keyInput : acceleratorKeys.get(keyInput.toLowerCase()));
  if (!key || acceleratorModifiers.has(keyInput.toLowerCase())) return null;
  const orderedModifiers = acceleratorModifierOrder.filter((modifier) => uniqueModifiers.has(modifier));
  return [...orderedModifiers, key].join('+');
}

export const overlayShortcutSchema = z.string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => normalizeOverlayShortcut(value) !== null, 'Unsupported Electron accelerator')
  .transform((value) => normalizeOverlayShortcut(value) as string);

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  language: z.enum(['ru', 'en']),
  position: positionSchema,
  rank: rankSchema.nullable(),
  startWithWindows: z.boolean(),
  minimizeToTray: z.boolean(),
  overlayShortcut: overlayShortcutSchema.catch('PageUp').default('PageUp'),
  wishlist: z.array(z.number().int().positive()).max(200),
  assistantEnabled: z.boolean(),
  assistantMode: assistantModeSchema.default('vision'),
  captureConsent: z.object({
    accepted: z.boolean(),
    acceptedAt: z.string().datetime().nullable(),
  }),
  overwolfConsent: z.object({
    accepted: z.boolean(),
    acceptedAt: z.string().datetime().nullable(),
  }).default({ accepted: false, acceptedAt: null }),
  diagnosticsConsent: z.discriminatedUnion('accepted', [
    z.object({
      accepted: z.literal(true),
      acceptedAt: z.string().datetime(),
      version: z.literal(1),
    }),
    z.object({
      accepted: z.literal(false),
      acceptedAt: z.null(),
      version: z.null(),
    }),
  ]).default({ accepted: false, acceptedAt: null, version: null }),
});

export const preferencesPatchSchema = preferencesSchema.omit({ overlayShortcut: true }).partial();

export const startupDiagnosticSchema = z.object({
  phase: z.enum(['preferences', 'session', 'route', 'hero']),
  detail: z.string().trim().min(1).max(80).optional(),
  durationMs: z.number().finite().nonnegative().max(120_000),
  outcome: z.enum(['success', 'error']),
});

export type StartupDiagnostic = z.infer<typeof startupDiagnosticSchema>;

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
export type AssistantMode = z.infer<typeof assistantModeSchema>;
export type DraftAllyGroup = z.infer<typeof draftAllyGroupSchema>;
export type OverlayVisibleSlot = z.infer<typeof overlayVisibleSlotSchema>;
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
  source: 'desktop' | 'manual' | 'photo' | 'overwolf';
  input: {
    source: 'desktop' | 'manual' | 'photo' | 'overwolf';
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

export type HistorySummary = {
  id: string;
  source: 'manual' | 'photo' | 'overwolf';
  input: {
    position: Position | null;
    rank?: Rank | null;
    enemyHeroIds: number[];
  } | null;
  result: {
    patch: string | null;
    recommendations: Array<{
      hero: Hero;
      score: number;
      confidence: 'low' | 'medium' | 'high';
    }>;
  } | null;
  createdAt: string;
};

export type HistorySummaryPage = {
  view: 'summary';
  items: HistorySummary[];
  nextCursor: string | null;
};

export type EngineState = {
  enabled: boolean;
  phase: EnginePhase;
  message: string | null;
  latestAnalysisId: string | null;
  latestAnalysis: Analysis | null;
  lastSeenAt: string | null;
  dotaDetected: boolean;
  draftActive: boolean;
  refreshPending: boolean;
  draftOrientation?: {
    allyGroup: DraftAllyGroup;
    source: 'gsi_player_hero' | 'manual_confirmation';
  } | null;
  recognition?: {
    quality: 'clear' | 'partial' | 'not_dota' | 'too_blurry';
    detectedPosition: Position | null;
    recognized: Array<{
      side: 'ally' | 'enemy' | 'unknown';
      visualGroup?: 'left' | 'right';
      slot: number;
      heroId: number | null;
      heroName: string;
      localizedName: string | null;
      confidence: number;
      needsReview: boolean;
    }>;
  } | null;
};

export type OverlayPick = {
  side: 'ally' | 'enemy';
  slot: number;
  heroId: number | null;
  heroName: string;
  localizedName: string | null;
  imageUrl: string | null;
  confidence: number;
};

export type OverlayRecommendation = {
  heroId: number;
  heroName: string;
  imageUrl: string | null;
  score: number;
  confidence: 'low' | 'medium' | 'high';
};

export type OverlayState = {
  language: Preferences['language'];
  available: boolean;
  enabled: boolean;
  phase: EnginePhase;
  message: string;
  dotaDetected: boolean;
  draftActive: boolean;
  position: Position;
  positionSource: 'detected' | 'manual';
  picks: OverlayPick[];
  recommendations: OverlayRecommendation[];
  latestAnalysisId: string | null;
  analysisPosition: Position | null;
  shortcut: string;
  shortcutAvailable: boolean;
  refreshing: boolean;
  draftOrientation: {
    required: boolean;
    allyGroup: DraftAllyGroup | null;
    source: 'gsi_player_hero' | 'manual_confirmation' | 'overwolf' | null;
  };
};

export type OverlayShortcutStatus = {
  shortcut: string;
  available: boolean;
};

export type AppInfo = {
  version: string;
  platform: NodeJS.Platform;
};

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export type UpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type UpdateState = {
  supported: boolean;
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  progress: UpdateProgress | null;
  error: string | null;
};

export type BillingStatus = {
  plan: 'free' | 'pro';
  active: boolean;
  expiresAt: string | null;
};

export type OverwolfBridgePhase =
  | 'stopped'
  | 'listening'
  | 'pairing'
  | 'connected'
  | 'stale'
  | 'error';

export type OverwolfBridgeState = {
  phase: OverwolfBridgePhase;
  configured: boolean;
  protocolVersion: number;
  port: number | null;
  connectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  companionVersion: string | null;
  gameDetected: boolean;
  draftActive: boolean;
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
    history: (input?: z.infer<typeof paginationSchema>) => Promise<HistorySummaryPage>;
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
  shortcuts: {
    getOverlay: () => Promise<OverlayShortcutStatus>;
    setOverlay: (shortcut: string) => Promise<OverlayShortcutStatus>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximized: (listener: (maximized: boolean) => void) => () => void;
  };
  updates: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    downloadAndInstall: () => Promise<UpdateState>;
    onState: (listener: (state: UpdateState) => void) => () => void;
  };
  overwolf: {
    getState: () => Promise<OverwolfBridgeState>;
    connect: () => Promise<OverwolfBridgeState>;
    openInstaller: () => Promise<void>;
    onState: (listener: (state: OverwolfBridgeState) => void) => () => void;
  };
  app: {
    openExternal: (url: string) => Promise<void>;
    openLocalLogs: () => Promise<void>;
    getInfo: () => Promise<AppInfo>;
    reportStartup: (input: StartupDiagnostic) => Promise<void>;
  };
};

export type OverlayBridge = {
  getState: () => Promise<OverlayState>;
  refresh: () => Promise<OverlayState>;
  setPosition: (position: Position) => Promise<OverlayState>;
  setDraftAllyGroup: (allyGroup: DraftAllyGroup) => Promise<OverlayState>;
  hide: () => Promise<void>;
  presented: (presentationId: number, visibleSlots: OverlayVisibleSlot[]) => Promise<void>;
  onState: (listener: (state: OverlayState, presentationId?: number) => void) => () => void;
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
