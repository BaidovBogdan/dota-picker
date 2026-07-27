import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

import type {
  AnalysisResult,
  Attempts,
  Draft,
  DraftTeam,
  Hero,
  LanguageMode,
  Position,
  Recommendation,
  Session,
  ThemeMode,
} from '@/types/domain';
import { createId } from '@/utils/id';

const HISTORY_LIMIT = 50;
const HISTORY_TOMBSTONE_LIMIT = 200;
const ATTEMPT_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type PendingOfflineAnalysis = {
  localResultId: string;
  ownerScope: string;
  idempotencyKey: string;
  draft: Draft;
  createdAt: string;
  firstReplayAt?: string;
};

type PendingRegistration = {
  ownerScope: string;
  email: string;
};

export const getSessionScope = (session: Session | null, guestId: string | null) => {
  if (!session) return guestId ? `guest:${guestId}` : null;
  if (session.kind === 'registered') return `user:${session.userId}`;
  return `guest:${guestId ?? session.userId}`;
};

const createDraft = (): Draft => ({
  allies: [],
  enemies: [],
  position: null,
  rank: null,
  source: 'manual',
  photoUri: null,
  updatedAt: new Date().toISOString(),
});

const createAttempts = (): Attempts => ({
  remaining: 3,
  maximum: 3,
  nextRefreshAt: new Date(Date.now() + ATTEMPT_REFRESH_INTERVAL_MS).toISOString(),
});

const refreshAttemptsAfterDeadline = (attempts: Attempts, now = Date.now()) => {
  const nextRefreshAt = Date.parse(attempts.nextRefreshAt);
  if (!Number.isFinite(nextRefreshAt) || nextRefreshAt > now) return null;
  const elapsedPeriods = Math.floor((now - nextRefreshAt) / ATTEMPT_REFRESH_INTERVAL_MS) + 1;
  return {
    ...attempts,
    remaining: attempts.maximum,
    nextRefreshAt: new Date(
      nextRefreshAt + elapsedPeriods * ATTEMPT_REFRESH_INTERVAL_MS,
    ).toISOString(),
  };
};

type AppState = {
  hasHydrated: boolean;
  isRemoteBootstrapPending: boolean;
  themeMode: ThemeMode;
  languageMode: LanguageMode;
  guestId: string | null;
  session: Session | null;
  draft: Draft;
  attempts: Attempts;
  serverAttempts: Attempts | null;
  serverAttemptsOwnerScope: string | null;
  pendingRegistration: PendingRegistration | null;
  pendingAccountDeletionScope: string | null;
  pendingOfflineAnalyses: PendingOfflineAnalysis[];
  history: AnalysisResult[];
  deletedHistoryIds: string[];
  deletedOfflineResultIds: string[];
  wishlistByOwnerScope: Record<string, number[]>;
  heroes: Hero[];
  bootstrapGuest: () => void;
  setGuestId: (guestId: string) => void;
  refreshFreeAttempts: () => void;
  setPosition: (position: Position) => void;
  setRank: (rank: number | null) => void;
  setPhoto: (photoUri: string | null) => void;
  clearPhotoUri: () => void;
  replaceTeam: (team: DraftTeam, heroIds: number[]) => void;
  replaceTeams: (allies: number[], enemies: number[]) => void;
  addHero: (team: DraftTeam, heroId: number) => void;
  replaceHero: (team: DraftTeam, currentHeroId: number, nextHeroId: number) => void;
  removeHero: (team: DraftTeam, heroId: number) => void;
  resetDraft: () => void;
  saveAnalysis: (result: AnalysisResult, idempotencyKey?: string) => void;
  setOfflineAnalysisReplay: (localResultId: string, replayedAt: string | null) => void;
  resolveOfflineAnalysis: (localResultId: string, result: AnalysisResult) => void;
  rejectOfflineAnalysis: (localResultId: string) => void;
  discardOwnerScope: (ownerScope: string) => void;
  removeHistory: (id: string) => void;
  replaceHistory: (history: AnalysisResult[]) => void;
  mergeHistory: (history: AnalysisResult[]) => void;
  clearHistory: (rememberServerDeletions?: boolean) => void;
  setSession: (session: Session | null) => void;
  commitServerSession: (session: Session, attempts: Attempts, ownerScope: string) => void;
  setPendingRegistration: (pendingRegistration: PendingRegistration | null) => void;
  setPendingAccountDeletionScope: (ownerScope: string | null) => void;
  setAttempts: (attempts: Attempts) => void;
  setServerAttempts: (attempts: Attempts, ownerScope: string) => void;
  toggleWishlist: (heroId: number) => void;
  removeFromWishlist: (heroIds: number[]) => void;
  setHeroes: (heroes: Hero[]) => void;
  setHydrated: (hydrated: boolean) => void;
  setRemoteBootstrapPending: (pending: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguageMode: (mode: LanguageMode) => void;
};

type PersistedAppState = {
  guestId: string | null;
  session: Session | null;
  draft: Draft;
  attempts: Attempts;
  serverAttempts: Attempts | null;
  serverAttemptsOwnerScope: string | null;
  pendingRegistration: PendingRegistration | null;
  pendingAccountDeletionScope: string | null;
  pendingOfflineAnalyses: PendingOfflineAnalysis[];
  history: AnalysisResult[];
  deletedHistoryIds: string[];
  deletedOfflineResultIds: string[];
  wishlistByOwnerScope: Record<string, number[]>;
  themeMode: ThemeMode;
  languageMode: LanguageMode;
};

type PendingPersistenceWrite = {
  value: StorageValue<PersistedAppState>;
  resolve: (() => void)[];
  reject: ((reason: unknown) => void)[];
};

let persistenceTail: Promise<void> = Promise.resolve();
let latestPersistenceOperation: Promise<void> = persistenceTail;
let persistenceSchedule: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
const pendingPersistenceWrites = new Map<string, PendingPersistenceWrite>();

const enqueuePersistenceOperation = (operation: () => Promise<void>) => {
  const queued = persistenceTail.then(operation);
  latestPersistenceOperation = queued;
  persistenceTail = queued.catch(() => undefined);
  return queued;
};

const flushPendingPersistenceBatch = () => {
  if (pendingPersistenceWrites.size === 0) return latestPersistenceOperation;
  const batch = [...pendingPersistenceWrites.entries()];
  pendingPersistenceWrites.clear();
  const operation = enqueuePersistenceOperation(async () => {
    for (const [name, pending] of batch) {
      await AsyncStorage.setItem(name, JSON.stringify(pending.value));
    }
  });
  void operation.then(
    () => {
      batch.forEach(([, pending]) => pending.resolve.forEach((resolve) => resolve()));
    },
    (error: unknown) => {
      batch.forEach(([, pending]) => pending.reject.forEach((reject) => reject(error)));
    },
  );
  return operation;
};

const schedulePersistenceBatch = () => {
  if (persistenceSchedule || pendingPersistenceWrites.size === 0) return;
  persistenceSchedule = InteractionManager.runAfterInteractions(() => {
    persistenceSchedule = null;
    void flushPendingPersistenceBatch();
  });
};

const appStorage: PersistStorage<PersistedAppState> = {
  getItem: async (name) => {
    const value = await AsyncStorage.getItem(name);
    return value ? (JSON.parse(value) as StorageValue<PersistedAppState>) : null;
  },
  setItem: (name, value) =>
    new Promise<void>((resolve, reject) => {
      const pending = pendingPersistenceWrites.get(name);
      if (pending) {
        pending.value = value;
        pending.resolve.push(resolve);
        pending.reject.push(reject);
      } else {
        pendingPersistenceWrites.set(name, {
          value,
          resolve: [resolve],
          reject: [reject],
        });
      }
      schedulePersistenceBatch();
    }),
  removeItem: (name) => {
    const pending = pendingPersistenceWrites.get(name);
    if (pending) {
      pendingPersistenceWrites.delete(name);
      pending.resolve.forEach((resolve) => resolve());
    }
    if (pendingPersistenceWrites.size === 0) {
      persistenceSchedule?.cancel();
      persistenceSchedule = null;
    }
    return enqueuePersistenceOperation(() => AsyncStorage.removeItem(name));
  },
};

export const flushAppPersistence = () => {
  persistenceSchedule?.cancel();
  persistenceSchedule = null;
  return flushPendingPersistenceBatch();
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isPosition = (value: unknown): value is Position =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;

const normalizeHeroIds = (value: unknown, limit: number) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((heroId): heroId is number => Number.isInteger(heroId) && heroId > 0)),
  ).slice(0, limit);
};

const normalizeStringArray = (value: unknown, limit = 50) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, limit);
};

const normalizeDraft = (value: unknown, fallback: Draft, resetPhoto = false): Draft => {
  if (!isRecord(value))
    return {
      ...fallback,
      allies: [...fallback.allies],
      enemies: [...fallback.enemies],
      ...(resetPhoto ? { source: 'manual', photoUri: null } : {}),
    };
  const allies = normalizeHeroIds(value.allies, 4);
  const allySet = new Set(allies);
  const enemies = normalizeHeroIds(value.enemies, 5).filter((heroId) => !allySet.has(heroId));
  const position = isPosition(value.position) ? value.position : null;
  const rank =
    Number.isInteger(value.rank) && Number(value.rank) >= 1 && Number(value.rank) <= 8
      ? Number(value.rank)
      : null;
  const source =
    resetPhoto || (value.source !== 'manual' && value.source !== 'photo') ? 'manual' : value.source;
  return {
    allies,
    enemies,
    position,
    rank,
    source,
    photoUri: resetPhoto ? null : typeof value.photoUri === 'string' ? value.photoUri : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt,
  };
};

const normalizeAttempts = (value: unknown, fallback: Attempts): Attempts => {
  if (!isRecord(value)) return { ...fallback };
  const maximum =
    typeof value.maximum === 'number' && Number.isFinite(value.maximum) && value.maximum >= 0
      ? Math.floor(value.maximum)
      : fallback.maximum;
  const remaining =
    typeof value.remaining === 'number' && Number.isFinite(value.remaining)
      ? Math.min(maximum, Math.max(0, Math.floor(value.remaining)))
      : Math.min(maximum, fallback.remaining);
  const planExpiresAt =
    value.planExpiresAt === null || typeof value.planExpiresAt === 'string'
      ? value.planExpiresAt
      : fallback.planExpiresAt;
  return {
    remaining,
    maximum,
    nextRefreshAt:
      typeof value.nextRefreshAt === 'string' ? value.nextRefreshAt : fallback.nextRefreshAt,
    ...(planExpiresAt === undefined ? {} : { planExpiresAt }),
  };
};

const normalizeServerAttempts = (value: unknown): Attempts | null => {
  if (
    !isRecord(value) ||
    typeof value.remaining !== 'number' ||
    !Number.isFinite(value.remaining) ||
    typeof value.maximum !== 'number' ||
    !Number.isFinite(value.maximum) ||
    typeof value.nextRefreshAt !== 'string'
  ) {
    return null;
  }
  return normalizeAttempts(value, createAttempts());
};

const normalizeSession = (value: unknown): Session | null => {
  if (
    !isRecord(value) ||
    typeof value.userId !== 'string' ||
    (value.kind !== 'guest' && value.kind !== 'registered')
  ) {
    return null;
  }
  const email = typeof value.email === 'string' ? value.email : null;
  return {
    userId: value.userId,
    kind: value.kind,
    email,
    displayName:
      typeof value.displayName === 'string' ? value.displayName : (email ?? value.userId),
    plan: value.plan === 'pro' ? 'pro' : 'free',
    revenueCatAppUserId:
      typeof value.revenueCatAppUserId === 'string' ? value.revenueCatAppUserId : value.userId,
  };
};

const heroAttributes: Hero['attribute'][] = ['strength', 'agility', 'intelligence', 'universal'];

const normalizeHero = (value: unknown): Hero | null => {
  if (!isRecord(value) || !Number.isInteger(value.id) || Number(value.id) <= 0) return null;
  const id = Number(value.id);
  const attribute = heroAttributes.includes(value.attribute as Hero['attribute'])
    ? (value.attribute as Hero['attribute'])
    : 'universal';
  const positions = Array.isArray(value.positions)
    ? value.positions
        .filter(isPosition)
        .filter((position, index, all) => all.indexOf(position) === index)
    : [];
  return {
    id,
    slug: typeof value.slug === 'string' ? value.slug : String(id),
    name: typeof value.name === 'string' ? value.name : `#${id}`,
    attribute,
    positions,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : '',
    ...(typeof value.iconUrl === 'string' ? { iconUrl: value.iconUrl } : {}),
    ...(typeof value.picks === 'number' && Number.isFinite(value.picks)
      ? { picks: value.picks }
      : {}),
    ...(typeof value.wins === 'number' && Number.isFinite(value.wins) ? { wins: value.wins } : {}),
    ...(typeof value.winRate === 'number' && Number.isFinite(value.winRate)
      ? { winRate: value.winRate }
      : {}),
  };
};

const normalizeRecommendation = (value: unknown, index: number): Recommendation | null => {
  if (!isRecord(value)) return null;
  const hero = normalizeHero(value.hero);
  if (!hero) return null;
  const fallbackLabels = ['best', 'reliable', 'fallback'] as const;
  return {
    hero,
    score: typeof value.score === 'number' && Number.isFinite(value.score) ? value.score : 0,
    label:
      typeof value.label === 'string'
        ? (value.label as Recommendation['label'])
        : (fallbackLabels[Math.min(index, fallbackLabels.length - 1)] ?? 'fallback'),
    reasons: normalizeStringArray(value.reasons),
    risks: normalizeStringArray(value.risks),
    laneFit: typeof value.laneFit === 'string' ? value.laneFit : '',
  };
};

const normalizeAnalysisResult = (value: unknown): AnalysisResult | null => {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const draftFallback = createDraft();
  const draft = normalizeDraft(value.draft, draftFallback);
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : draft.updatedAt;
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations
        .map(normalizeRecommendation)
        .filter((item): item is Recommendation => item !== null)
    : [];
  const source =
    value.source === 'server' || value.source === 'offline'
      ? value.source
      : typeof value.serverId === 'string'
        ? 'server'
        : 'offline';
  return {
    id: value.id,
    ...(typeof value.serverId === 'string' ? { serverId: value.serverId } : {}),
    ...(typeof value.ownerScope === 'string' ? { ownerScope: value.ownerScope } : {}),
    draft,
    recommendations,
    patch: typeof value.patch === 'string' ? value.patch : '',
    confidence:
      value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low'
        ? value.confidence
        : 'low',
    dataUpdatedAt: typeof value.dataUpdatedAt === 'string' ? value.dataUpdatedAt : createdAt,
    createdAt,
    source,
  };
};

const normalizeHistory = (value: unknown, fallback: AnalysisResult[]) => {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const history: AnalysisResult[] = [];
  for (const item of value) {
    const normalized = normalizeAnalysisResult(item);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    history.push(normalized);
    if (history.length === HISTORY_LIMIT) break;
  }
  return history;
};

const normalizePendingOfflineAnalyses = (value: unknown, fallback: PendingOfflineAnalysis[]) => {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const pending: PendingOfflineAnalysis[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.localResultId !== 'string' ||
      typeof item.ownerScope !== 'string' ||
      typeof item.idempotencyKey !== 'string' ||
      typeof item.createdAt !== 'string' ||
      !isRecord(item.draft) ||
      seen.has(item.localResultId)
    ) {
      continue;
    }
    seen.add(item.localResultId);
    pending.push({
      localResultId: item.localResultId,
      ownerScope: item.ownerScope,
      idempotencyKey: item.idempotencyKey,
      draft: normalizeDraft(item.draft, createDraft()),
      createdAt: item.createdAt,
      ...(typeof item.firstReplayAt === 'string' ? { firstReplayAt: item.firstReplayAt } : {}),
    });
    if (pending.length === HISTORY_LIMIT) break;
  }
  return pending;
};

const normalizeStringIds = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return [...fallback];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string')),
  ).slice(0, HISTORY_TOMBSTONE_LIMIT);
};

const normalizeWishlistByOwnerScope = (value: unknown, fallback: Record<string, number[]>) => {
  if (!isRecord(value)) {
    return Object.fromEntries(
      Object.entries(fallback).map(([scope, heroIds]) => [scope, [...heroIds]]),
    );
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([scope, heroIds]) => {
      if (!scope.trim()) return [];
      const normalized = normalizeHeroIds(heroIds, 200);
      return normalized.length ? [[scope, normalized]] : [];
    }),
  );
};

const createPersistedDefaults = (): PersistedAppState => ({
  guestId: null,
  session: null,
  draft: createDraft(),
  attempts: createAttempts(),
  serverAttempts: null,
  serverAttemptsOwnerScope: null,
  pendingRegistration: null,
  pendingAccountDeletionScope: null,
  pendingOfflineAnalyses: [],
  history: [],
  deletedHistoryIds: [],
  deletedOfflineResultIds: [],
  wishlistByOwnerScope: {},
  themeMode: 'system',
  languageMode: 'system',
});

const persistedDefaultsFromState = (state: AppState): PersistedAppState => ({
  guestId: state.guestId,
  session: state.session,
  draft: state.draft,
  attempts: state.attempts,
  serverAttempts: state.serverAttempts,
  serverAttemptsOwnerScope: state.serverAttemptsOwnerScope,
  pendingRegistration: state.pendingRegistration,
  pendingAccountDeletionScope: state.pendingAccountDeletionScope,
  pendingOfflineAnalyses: state.pendingOfflineAnalyses,
  history: state.history,
  deletedHistoryIds: state.deletedHistoryIds,
  deletedOfflineResultIds: state.deletedOfflineResultIds,
  wishlistByOwnerScope: state.wishlistByOwnerScope,
  themeMode: state.themeMode,
  languageMode: state.languageMode,
});

const normalizePersistedState = (
  value: unknown,
  fallback: PersistedAppState,
): PersistedAppState => {
  const persisted = isRecord(value) ? value : {};
  const session =
    persisted.session === undefined
      ? fallback.session
      : persisted.session === null
        ? null
        : normalizeSession(persisted.session);
  const guestId =
    persisted.guestId === null
      ? null
      : typeof persisted.guestId === 'string'
        ? persisted.guestId
        : fallback.guestId;
  const serverAttempts =
    persisted.serverAttempts === undefined
      ? fallback.serverAttempts
      : persisted.serverAttempts === null
        ? null
        : normalizeServerAttempts(persisted.serverAttempts);
  const serverAttemptsOwnerScope =
    persisted.serverAttemptsOwnerScope === null
      ? null
      : typeof persisted.serverAttemptsOwnerScope === 'string'
        ? persisted.serverAttemptsOwnerScope
        : fallback.serverAttemptsOwnerScope;
  const pendingRegistration =
    persisted.pendingRegistration === undefined
      ? fallback.pendingRegistration
      : isRecord(persisted.pendingRegistration) &&
          typeof persisted.pendingRegistration.ownerScope === 'string' &&
          typeof persisted.pendingRegistration.email === 'string'
        ? {
            ownerScope: persisted.pendingRegistration.ownerScope,
            email: normalizeEmail(persisted.pendingRegistration.email),
          }
        : null;
  const pendingAccountDeletionScope =
    persisted.pendingAccountDeletionScope === null
      ? null
      : typeof persisted.pendingAccountDeletionScope === 'string'
        ? persisted.pendingAccountDeletionScope
        : fallback.pendingAccountDeletionScope;
  const themeMode =
    persisted.themeMode === 'light' ||
    persisted.themeMode === 'dark' ||
    persisted.themeMode === 'system'
      ? persisted.themeMode
      : fallback.themeMode;
  const languageMode =
    persisted.languageMode === 'ru' ||
    persisted.languageMode === 'en' ||
    persisted.languageMode === 'system'
      ? persisted.languageMode
      : fallback.languageMode;
  return {
    guestId,
    session,
    draft: normalizeDraft(persisted.draft, fallback.draft, true),
    attempts: normalizeAttempts(persisted.attempts, fallback.attempts),
    serverAttempts,
    serverAttemptsOwnerScope,
    pendingRegistration,
    pendingAccountDeletionScope,
    pendingOfflineAnalyses: normalizePendingOfflineAnalyses(
      persisted.pendingOfflineAnalyses,
      fallback.pendingOfflineAnalyses,
    ),
    history: normalizeHistory(persisted.history, fallback.history),
    deletedHistoryIds: normalizeStringIds(persisted.deletedHistoryIds, fallback.deletedHistoryIds),
    deletedOfflineResultIds: normalizeStringIds(
      persisted.deletedOfflineResultIds,
      fallback.deletedOfflineResultIds,
    ),
    wishlistByOwnerScope: normalizeWishlistByOwnerScope(
      persisted.wishlistByOwnerScope,
      fallback.wishlistByOwnerScope,
    ),
    themeMode,
    languageMode,
  };
};

const touch = (draft: Draft): Draft => ({ ...draft, updatedAt: new Date().toISOString() });
const sameNumbers = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameHeroes = (left: Hero[], right: Hero[]) =>
  left.length === right.length &&
  left.every((hero, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      hero.id === candidate.id &&
      hero.slug === candidate.slug &&
      hero.name === candidate.name &&
      hero.attribute === candidate.attribute &&
      hero.imageUrl === candidate.imageUrl &&
      hero.iconUrl === candidate.iconUrl &&
      hero.picks === candidate.picks &&
      hero.wins === candidate.wins &&
      hero.winRate === candidate.winRate &&
      sameNumbers(hero.positions, candidate.positions)
    );
  });

const combineHistory = (
  incoming: AnalysisResult[],
  existing: AnalysisResult[],
  deletedHistoryIds: string[],
) => {
  const deleted = new Set(deletedHistoryIds);
  const canonicalId = (item: AnalysisResult) => item.serverId ?? item.id;
  return [...incoming, ...existing]
    .filter((item) => !deleted.has(canonicalId(item)))
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => canonicalId(candidate) === canonicalId(item)) === index,
    )
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, HISTORY_LIMIT);
};

const effectiveAttempts = (
  serverAttempts: Attempts,
  pending: PendingOfflineAnalysis[],
  ownerScope: string,
): Attempts => ({
  ...serverAttempts,
  remaining: Math.max(
    0,
    serverAttempts.remaining - pending.filter((item) => item.ownerScope === ownerScope).length,
  ),
});

const attemptsAfterPendingChange = (
  state: AppState,
  pendingOfflineAnalyses: PendingOfflineAnalysis[],
) => {
  const ownerScope = getSessionScope(state.session, state.guestId);
  if (!ownerScope) return state.attempts;
  if (state.serverAttempts && state.serverAttemptsOwnerScope === ownerScope) {
    return effectiveAttempts(state.serverAttempts, pendingOfflineAnalyses, ownerScope);
  }
  const previousCount = state.pendingOfflineAnalyses.filter(
    (item) => item.ownerScope === ownerScope,
  ).length;
  const nextCount = pendingOfflineAnalyses.filter((item) => item.ownerScope === ownerScope).length;
  const released = Math.max(0, previousCount - nextCount);
  return released > 0
    ? {
        ...state.attempts,
        remaining: Math.min(state.attempts.maximum, state.attempts.remaining + released),
      }
    : state.attempts;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      isRemoteBootstrapPending: true,
      themeMode: 'system',
      languageMode: 'system',
      guestId: null,
      session: null,
      draft: createDraft(),
      attempts: createAttempts(),
      serverAttempts: null,
      serverAttemptsOwnerScope: null,
      pendingRegistration: null,
      pendingAccountDeletionScope: null,
      pendingOfflineAnalyses: [],
      history: [],
      deletedHistoryIds: [],
      deletedOfflineResultIds: [],
      wishlistByOwnerScope: {},
      heroes: [],
      bootstrapGuest: () => {
        if (!get().guestId) set({ guestId: createId('guest') });
        get().refreshFreeAttempts();
      },
      setGuestId: (guestId) =>
        set((state) => {
          const ownerScope = getSessionScope(state.session, guestId);
          return {
            guestId,
            attempts:
              state.serverAttempts && ownerScope && state.serverAttemptsOwnerScope === ownerScope
                ? effectiveAttempts(state.serverAttempts, state.pendingOfflineAnalyses, ownerScope)
                : state.attempts,
          };
        }),
      refreshFreeAttempts: () => {
        const state = get();
        const expiresAt = state.attempts.planExpiresAt;
        if (state.session?.plan === 'pro') {
          if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
            const freeAttempts = createAttempts();
            state.setSession({ ...state.session, plan: 'free' });
            state.setAttempts({ ...freeAttempts, remaining: 0 });
            return;
          }
        }
        const refreshedAttempts = refreshAttemptsAfterDeadline(state.attempts);
        if (refreshedAttempts) state.setAttempts(refreshedAttempts);
      },
      setPosition: (position) => {
        if (get().draft.position === position) return;
        set(({ draft }) => ({ draft: touch({ ...draft, position }) }));
      },
      setRank: (rank) => {
        if (get().draft.rank === rank) return;
        set(({ draft }) => ({ draft: touch({ ...draft, rank }) }));
      },
      setPhoto: (photoUri) => {
        const current = get().draft;
        const source = photoUri ? 'photo' : 'manual';
        if (current.photoUri === photoUri && current.source === source) return;
        set(({ draft }) => ({
          draft: touch({
            ...draft,
            photoUri,
            source,
            ...(photoUri ? { allies: [], enemies: [] } : {}),
          }),
        }));
      },
      clearPhotoUri: () => {
        if (get().draft.photoUri === null) return;
        set(({ draft }) => ({ draft: { ...draft, photoUri: null } }));
      },
      replaceTeam: (team, heroIds) =>
        set(({ draft }) => {
          const opposite = new Set(team === 'allies' ? draft.enemies : draft.allies);
          const sanitized = Array.from(
            new Set(
              heroIds.filter(
                (heroId) => Number.isInteger(heroId) && heroId > 0 && !opposite.has(heroId),
              ),
            ),
          ).slice(0, team === 'allies' ? 4 : 5);
          return { draft: touch({ ...draft, [team]: sanitized }) };
        }),
      replaceTeams: (allies, enemies) =>
        set(({ draft }) => {
          const nextAllies = Array.from(
            new Set(allies.filter((heroId) => Number.isInteger(heroId) && heroId > 0)),
          ).slice(0, 4);
          const allySet = new Set(nextAllies);
          const nextEnemies = Array.from(
            new Set(
              enemies.filter(
                (heroId) => Number.isInteger(heroId) && heroId > 0 && !allySet.has(heroId),
              ),
            ),
          ).slice(0, 5);
          return {
            draft: touch({ ...draft, allies: nextAllies, enemies: nextEnemies }),
          };
        }),
      addHero: (team, heroId) => {
        const draft = get().draft;
        const current = draft[team];
        const opposite = team === 'allies' ? draft.enemies : draft.allies;
        if (
          current.length >= (team === 'allies' ? 4 : 5) ||
          current.includes(heroId) ||
          opposite.includes(heroId)
        ) {
          return;
        }
        set({ draft: touch({ ...draft, [team]: [...current, heroId] }) });
      },
      replaceHero: (team, currentHeroId, nextHeroId) => {
        const draft = get().draft;
        const current = draft[team];
        const opposite = team === 'allies' ? draft.enemies : draft.allies;
        const index = current.indexOf(currentHeroId);
        if (
          index < 0 ||
          nextHeroId <= 0 ||
          opposite.includes(nextHeroId) ||
          currentHeroId === nextHeroId ||
          current.includes(nextHeroId)
        ) {
          return;
        }
        const next = [...current];
        next[index] = nextHeroId;
        set({ draft: touch({ ...draft, [team]: next }) });
      },
      removeHero: (team, heroId) => {
        if (!get().draft[team].includes(heroId)) return;
        set(({ draft }) => ({
          draft: touch({ ...draft, [team]: draft[team].filter((id) => id !== heroId) }),
        }));
      },
      resetDraft: () => set({ draft: createDraft() }),
      saveAnalysis: (result, idempotencyKey) =>
        set((state) => {
          const alreadySaved = state.history.some((item) => item.id === result.id);
          const ownerScope = getSessionScope(state.session, state.guestId);
          const matchingPending = idempotencyKey
            ? state.pendingOfflineAnalyses.find(
                (item) => item.ownerScope === ownerScope && item.idempotencyKey === idempotencyKey,
              )
            : undefined;
          const shouldQueue =
            !alreadySaved &&
            result.source === 'offline' &&
            Boolean(ownerScope && idempotencyKey) &&
            !matchingPending &&
            !state.pendingOfflineAnalyses.some((item) => item.localResultId === result.id);
          const shouldRelink =
            !alreadySaved &&
            result.source === 'offline' &&
            Boolean(matchingPending) &&
            !state.history.some((item) => item.id === matchingPending?.localResultId);
          const pendingOfflineAnalyses = shouldQueue
            ? [
                ...state.pendingOfflineAnalyses,
                {
                  localResultId: result.id,
                  ownerScope: ownerScope as string,
                  idempotencyKey: idempotencyKey as string,
                  draft: {
                    ...result.draft,
                    allies: [...result.draft.allies],
                    enemies: [...result.draft.enemies],
                    photoUri: null,
                  },
                  createdAt: result.createdAt,
                },
              ]
            : shouldRelink
              ? state.pendingOfflineAnalyses.map((item) =>
                  item === matchingPending ? { ...item, localResultId: result.id } : item,
                )
              : state.pendingOfflineAnalyses;
          const ownedResult = ownerScope ? { ...result, ownerScope } : result;
          const attempts =
            shouldQueue &&
            state.serverAttempts &&
            ownerScope &&
            state.serverAttemptsOwnerScope === ownerScope
              ? effectiveAttempts(state.serverAttempts, pendingOfflineAnalyses, ownerScope)
              : !alreadySaved && result.source === 'offline' && !matchingPending
                ? {
                    ...state.attempts,
                    remaining: Math.max(0, state.attempts.remaining - 1),
                  }
                : state.attempts;
          return {
            history: [ownedResult, ...state.history.filter((item) => item.id !== result.id)].slice(
              0,
              HISTORY_LIMIT,
            ),
            deletedHistoryIds: state.deletedHistoryIds.filter(
              (id) => id !== (result.serverId ?? result.id),
            ),
            pendingOfflineAnalyses,
            deletedOfflineResultIds: shouldRelink
              ? state.deletedOfflineResultIds.filter((id) => id !== matchingPending?.localResultId)
              : state.deletedOfflineResultIds,
            attempts,
          };
        }),
      setOfflineAnalysisReplay: (localResultId, replayedAt) =>
        set((state) => ({
          pendingOfflineAnalyses: state.pendingOfflineAnalyses.map((item) =>
            item.localResultId !== localResultId
              ? item
              : replayedAt
                ? { ...item, firstReplayAt: replayedAt }
                : (({ firstReplayAt: _firstReplayAt, ...rest }) => rest)(item),
          ),
        })),
      resolveOfflineAnalysis: (localResultId, result) =>
        set((state) => {
          const pendingOfflineAnalyses = state.pendingOfflineAnalyses.filter(
            (item) => item.localResultId !== localResultId,
          );
          const ownerScope = getSessionScope(state.session, state.guestId);
          const deduplicatedHistory = state.history.filter(
            (item) => item.id === localResultId || (item.serverId ?? item.id) !== result.id,
          );
          const visible = deduplicatedHistory.some((item) => item.id === localResultId);
          const explicitlyDeleted = state.deletedOfflineResultIds.includes(localResultId);
          const resolvedResult = {
            ...result,
            id: localResultId,
            serverId: result.id,
            ...(ownerScope ? { ownerScope } : {}),
          };
          const history = visible
            ? deduplicatedHistory.map((item) => (item.id === localResultId ? resolvedResult : item))
            : explicitlyDeleted
              ? deduplicatedHistory
              : [resolvedResult, ...deduplicatedHistory].slice(0, HISTORY_LIMIT);
          return {
            pendingOfflineAnalyses,
            history,
            deletedHistoryIds: explicitlyDeleted
              ? [result.id, ...state.deletedHistoryIds.filter((id) => id !== result.id)].slice(
                  0,
                  HISTORY_TOMBSTONE_LIMIT,
                )
              : state.deletedHistoryIds,
            deletedOfflineResultIds: state.deletedOfflineResultIds.filter(
              (id) => id !== localResultId,
            ),
            attempts:
              state.serverAttempts && ownerScope && state.serverAttemptsOwnerScope === ownerScope
                ? effectiveAttempts(state.serverAttempts, pendingOfflineAnalyses, ownerScope)
                : state.attempts,
          };
        }),
      rejectOfflineAnalysis: (localResultId) =>
        set((state) => {
          const pendingOfflineAnalyses = state.pendingOfflineAnalyses.filter(
            (item) => item.localResultId !== localResultId,
          );
          return {
            pendingOfflineAnalyses,
            attempts: attemptsAfterPendingChange(state, pendingOfflineAnalyses),
          };
        }),
      discardOwnerScope: (ownerScope) =>
        set((state) => {
          const wishlistByOwnerScope = { ...state.wishlistByOwnerScope };
          delete wishlistByOwnerScope[ownerScope];
          return {
            history: state.history.filter((item) => item.ownerScope !== ownerScope),
            pendingOfflineAnalyses: state.pendingOfflineAnalyses.filter(
              (item) => item.ownerScope !== ownerScope,
            ),
            wishlistByOwnerScope,
            pendingAccountDeletionScope:
              state.pendingAccountDeletionScope === ownerScope
                ? null
                : state.pendingAccountDeletionScope,
            ...(state.serverAttemptsOwnerScope === ownerScope
              ? {
                  attempts: { ...state.attempts, remaining: 0 },
                  serverAttempts: null,
                  serverAttemptsOwnerScope: null,
                }
              : {}),
          };
        }),
      removeHistory: (id) =>
        set((state) => {
          const removed = state.history.find((item) => item.id === id);
          return {
            history: state.history.filter((item) => item.id !== id),
            deletedHistoryIds:
              removed?.source === 'server'
                ? [
                    removed.serverId ?? id,
                    ...state.deletedHistoryIds.filter(
                      (deletedId) => deletedId !== (removed.serverId ?? id),
                    ),
                  ].slice(0, HISTORY_TOMBSTONE_LIMIT)
                : state.deletedHistoryIds,
            deletedOfflineResultIds:
              removed?.source === 'offline'
                ? [
                    id,
                    ...state.deletedOfflineResultIds.filter((deletedId) => deletedId !== id),
                  ].slice(0, HISTORY_TOMBSTONE_LIMIT)
                : state.deletedOfflineResultIds,
          };
        }),
      replaceHistory: (incoming) =>
        set((state) => {
          const ownerScope = getSessionScope(state.session, state.guestId);
          const scopedIncoming = incoming.map((item) =>
            ownerScope ? { ...item, ownerScope } : item,
          );
          return {
            history: combineHistory(
              scopedIncoming,
              state.history.filter(
                (item) => item.source === 'offline' && item.ownerScope === ownerScope,
              ),
              state.deletedHistoryIds,
            ),
          };
        }),
      mergeHistory: (incoming) =>
        set((state) => {
          const ownerScope = getSessionScope(state.session, state.guestId);
          const scopedIncoming = incoming.map((item) =>
            ownerScope ? { ...item, ownerScope } : item,
          );
          return {
            history: combineHistory(
              scopedIncoming,
              state.history.filter((item) => !item.ownerScope || item.ownerScope === ownerScope),
              state.deletedHistoryIds,
            ),
          };
        }),
      clearHistory: (rememberServerDeletions = false) =>
        set((state) => {
          const offlineIds = rememberServerDeletions
            ? new Set(
                state.history.filter((item) => item.source === 'offline').map((item) => item.id),
              )
            : new Set<string>();
          return {
            history: [],
            deletedHistoryIds: rememberServerDeletions
              ? [
                  ...state.history
                    .filter((item) => item.source === 'server')
                    .map((item) => item.serverId ?? item.id),
                  ...state.deletedHistoryIds,
                ]
                  .filter((id, index, all) => all.indexOf(id) === index)
                  .slice(0, HISTORY_TOMBSTONE_LIMIT)
              : state.deletedHistoryIds,
            deletedOfflineResultIds: rememberServerDeletions
              ? [...offlineIds, ...state.deletedOfflineResultIds]
                  .filter((id, index, all) => all.indexOf(id) === index)
                  .slice(0, HISTORY_TOMBSTONE_LIMIT)
              : state.deletedOfflineResultIds,
          };
        }),
      setSession: (session) =>
        set((state) => {
          const ownerScope = getSessionScope(session, state.guestId);
          if (
            state.serverAttempts &&
            state.serverAttemptsOwnerScope &&
            ownerScope !== state.serverAttemptsOwnerScope
          ) {
            return {
              session,
              attempts: { ...state.attempts, remaining: 0 },
              serverAttempts: null,
              serverAttemptsOwnerScope: null,
            };
          }
          return { session };
        }),
      commitServerSession: (session, serverAttempts, ownerScope) =>
        set((state) => {
          const deletionScope = state.pendingAccountDeletionScope;
          const shouldDiscardDeletedScope = Boolean(deletionScope && deletionScope !== ownerScope);
          const retainedPendingOfflineAnalyses = shouldDiscardDeletedScope
            ? state.pendingOfflineAnalyses.filter((item) => item.ownerScope !== deletionScope)
            : state.pendingOfflineAnalyses;
          const retainedHistory = shouldDiscardDeletedScope
            ? state.history.filter((item) => item.ownerScope !== deletionScope)
            : state.history;
          const migrationScope =
            session.kind === 'registered' &&
            session.email &&
            state.pendingRegistration &&
            normalizeEmail(session.email) === state.pendingRegistration.email
              ? state.pendingRegistration.ownerScope
              : null;
          const pendingOfflineAnalyses =
            migrationScope && migrationScope !== ownerScope
              ? retainedPendingOfflineAnalyses.map((item) =>
                  item.ownerScope === migrationScope ? { ...item, ownerScope } : item,
                )
              : retainedPendingOfflineAnalyses;
          const history =
            migrationScope && migrationScope !== ownerScope
              ? retainedHistory.map((item) =>
                  item.ownerScope === migrationScope ? { ...item, ownerScope } : item,
                )
              : retainedHistory;
          const wishlistByOwnerScope = { ...state.wishlistByOwnerScope };
          if (shouldDiscardDeletedScope && deletionScope) {
            delete wishlistByOwnerScope[deletionScope];
          }
          if (migrationScope && migrationScope !== ownerScope) {
            wishlistByOwnerScope[ownerScope] = Array.from(
              new Set([
                ...(wishlistByOwnerScope[ownerScope] ?? []),
                ...(wishlistByOwnerScope[migrationScope] ?? []),
              ]),
            ).slice(0, 200);
            delete wishlistByOwnerScope[migrationScope];
          }
          return {
            session,
            history,
            pendingOfflineAnalyses,
            wishlistByOwnerScope,
            serverAttempts,
            serverAttemptsOwnerScope: ownerScope,
            attempts: effectiveAttempts(serverAttempts, pendingOfflineAnalyses, ownerScope),
            pendingRegistration: null,
            pendingAccountDeletionScope: null,
          };
        }),
      setPendingRegistration: (pendingRegistration) => set({ pendingRegistration }),
      setPendingAccountDeletionScope: (pendingAccountDeletionScope) =>
        set({ pendingAccountDeletionScope }),
      setAttempts: (attempts) =>
        set((state) => {
          const ownerScope = getSessionScope(state.session, state.guestId);
          return {
            attempts: ownerScope
              ? effectiveAttempts(attempts, state.pendingOfflineAnalyses, ownerScope)
              : attempts,
            serverAttempts: null,
            serverAttemptsOwnerScope: null,
          };
        }),
      setServerAttempts: (serverAttempts, ownerScope) =>
        set(({ pendingOfflineAnalyses }) => ({
          serverAttempts,
          serverAttemptsOwnerScope: ownerScope,
          attempts: effectiveAttempts(serverAttempts, pendingOfflineAnalyses, ownerScope),
        })),
      toggleWishlist: (heroId) => {
        if (!Number.isInteger(heroId) || heroId <= 0) return;
        const currentState = get();
        const ownerScope = getSessionScope(currentState.session, currentState.guestId);
        if (!ownerScope) return;
        set((state) => {
          const current = state.wishlistByOwnerScope[ownerScope] ?? [];
          return {
            wishlistByOwnerScope: {
              ...state.wishlistByOwnerScope,
              [ownerScope]: current.includes(heroId)
                ? current.filter((id) => id !== heroId)
                : [...current, heroId].slice(0, 200),
            },
          };
        });
      },
      removeFromWishlist: (heroIds) => {
        const currentState = get();
        const ownerScope = getSessionScope(currentState.session, currentState.guestId);
        if (!ownerScope) return;
        const removed = new Set(normalizeHeroIds(heroIds, 200));
        if (!removed.size) return;
        const current = currentState.wishlistByOwnerScope[ownerScope] ?? [];
        if (!current.some((heroId) => removed.has(heroId))) return;
        set((state) => {
          return {
            wishlistByOwnerScope: {
              ...state.wishlistByOwnerScope,
              [ownerScope]: (state.wishlistByOwnerScope[ownerScope] ?? []).filter(
                (heroId) => !removed.has(heroId),
              ),
            },
          };
        });
      },
      setHeroes: (heroes) => {
        if (sameHeroes(get().heroes, heroes)) return;
        set({ heroes });
      },
      setHydrated: (hasHydrated) => {
        if (get().hasHydrated === hasHydrated) return;
        set({ hasHydrated });
      },
      setRemoteBootstrapPending: (isRemoteBootstrapPending) => {
        if (get().isRemoteBootstrapPending === isRemoteBootstrapPending) return;
        set({ isRemoteBootstrapPending });
      },
      setThemeMode: (themeMode) => {
        if (get().themeMode === themeMode) return;
        set({ themeMode });
      },
      setLanguageMode: (languageMode) => {
        if (get().languageMode === languageMode) return;
        set({ languageMode });
      },
    }),
    {
      name: 'counterpick.app.v1',
      storage: appStorage,
      version: 6,
      migrate: (persistedState) =>
        normalizePersistedState(persistedState, createPersistedDefaults()),
      partialize: ({
        guestId,
        session,
        draft,
        attempts,
        serverAttempts,
        serverAttemptsOwnerScope,
        pendingRegistration,
        pendingAccountDeletionScope,
        pendingOfflineAnalyses,
        history,
        deletedHistoryIds,
        deletedOfflineResultIds,
        wishlistByOwnerScope,
        themeMode,
        languageMode,
      }) => ({
        guestId,
        session,
        draft: { ...draft, photoUri: null, source: 'manual' as const },
        attempts,
        serverAttempts,
        serverAttemptsOwnerScope,
        pendingRegistration,
        pendingAccountDeletionScope,
        pendingOfflineAnalyses,
        history,
        deletedHistoryIds,
        deletedOfflineResultIds,
        wishlistByOwnerScope,
        themeMode,
        languageMode,
      }),
      merge: (persistedState, currentState) => {
        const persisted = normalizePersistedState(
          persistedState,
          persistedDefaultsFromState(currentState),
        );
        const ownerScope = getSessionScope(persisted.session, persisted.guestId);
        const serverAttempts =
          persisted.serverAttemptsOwnerScope === ownerScope ? persisted.serverAttempts : null;
        const attempts =
          serverAttempts && ownerScope
            ? effectiveAttempts(serverAttempts, persisted.pendingOfflineAnalyses, ownerScope)
            : persisted.serverAttempts
              ? { ...persisted.attempts, remaining: 0 }
              : persisted.attempts;
        return {
          ...currentState,
          ...persisted,
          attempts,
          serverAttempts,
          serverAttemptsOwnerScope:
            persisted.serverAttemptsOwnerScope === ownerScope
              ? persisted.serverAttemptsOwnerScope
              : null,
        };
      },
      onRehydrateStorage: () => () => useAppStore.setState({ hasHydrated: true }),
    },
  ),
);
