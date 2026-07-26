import { onlineManager } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { z } from 'zod';

import { fallbackHeroes, heroById } from '@/data/heroes';
import { translate } from '@/i18n';
import { bootstrapGuestSession } from '@/services/api/auth';
import { ApiError, apiRequest } from '@/services/api/client';
import { refreshNetworkState } from '@/services/network';
import { analyzeOffline } from '@/services/offline-engine';
import { resetToLocalGuest } from '@/services/session';
import { flushAppPersistence, getSessionScope, useAppStore } from '@/store/app-store';
import type { AnalysisResult, Draft, Hero, Position, RecognizedDraft } from '@/types/domain';

const positionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const backendHeroSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  localizedName: z.string().min(1).nullable().optional(),
  primaryAttribute: z.enum(['str', 'agi', 'int', 'all']).optional(),
  imageUrl: z.string().min(1).optional(),
  iconUrl: z.string().min(1).optional(),
  roles: z.array(z.string()).optional(),
  picks: z.number().nonnegative().optional(),
  wins: z.number().nonnegative().optional(),
  winRate: z.number().min(0).max(1).optional(),
});

const backendQuotaSchema = z.object({
  plan: z.enum(['free', 'pro']),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  nextRefillAt: z.string().min(1).nullable(),
  planExpiresAt: z.string().min(1).nullable(),
});

const backendRecognizedPickSchema = z.object({
  side: z.enum(['ally', 'enemy', 'unknown']),
  slot: z.number().int().nonnegative(),
  heroId: z.number().int().positive().nullable(),
  heroName: z.string(),
  localizedName: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
});

const backendRecommendationSchema = z.object({
  hero: backendHeroSchema,
  score: z.number().finite(),
  confidence: z.enum(['low', 'medium', 'high']),
  reasons: z.array(z.string()),
});

const backendAnalysisSchema = z.object({
  id: z.uuid(),
  source: z.enum(['manual', 'photo']),
  input: z.object({
    source: z.enum(['manual', 'photo']),
    position: positionSchema,
    allyHeroIds: z.array(z.number().int().positive()).max(4),
    enemyHeroIds: z.array(z.number().int().positive()).min(1).max(5),
    rank: z.number().int().optional(),
  }),
  result: z.object({
    patch: z.string().min(1),
    metaFetchedAt: z.string().min(1),
    recommendations: z.array(backendRecommendationSchema).min(1),
  }),
  createdAt: z.string().min(1),
});

const heroesResponseSchema = z.object({
  heroes: z.array(backendHeroSchema),
  patch: z.string().optional(),
  fetchedAt: z.string().optional(),
});
const photoResponseSchema = z.object({
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  recognized: z.array(backendRecognizedPickSchema).max(10),
});
const analysisResponseSchema = z.object({
  analysis: backendAnalysisSchema,
  quota: backendQuotaSchema,
});
const historyResponseSchema = z.object({
  items: z.array(backendAnalysisSchema),
  nextCursor: z.string().nullable(),
});
const quotaResponseSchema = z.object({ quota: backendQuotaSchema });

type BackendHero = z.infer<typeof backendHeroSchema>;
type BackendQuota = z.infer<typeof backendQuotaSchema>;
type BackendRecognizedPick = z.infer<typeof backendRecognizedPickSchema>;
type BackendAnalysis = z.infer<typeof backendAnalysisSchema>;

const applyServerQuota = (quota: BackendQuota) => {
  const store = useAppStore.getState();
  const ownerScope = getSessionScope(store.session, store.guestId);
  if (!ownerScope) return;
  store.setServerAttempts(
    {
      remaining: quota.remaining,
      maximum: quota.limit,
      nextRefreshAt: quota.nextRefillAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      planExpiresAt: quota.planExpiresAt,
    },
    ownerScope,
  );
};

const getQueuedOfflineResult = (idempotencyKey: string) => {
  const store = useAppStore.getState();
  const ownerScope = getSessionScope(store.session, store.guestId);
  if (!ownerScope) return undefined;
  const pending = store.pendingOfflineAnalyses.find(
    (item) => item.ownerScope === ownerScope && item.idempotencyKey === idempotencyKey,
  );
  return pending ? store.history.find((item) => item.id === pending.localResultId) : undefined;
};

const assertOfflinePlanActive = () => {
  const store = useAppStore.getState();
  const expiresAt = store.attempts.planExpiresAt;
  if (store.session?.plan === 'pro' && expiresAt && Date.parse(expiresAt) <= Date.now()) {
    store.refreshFreeAttempts();
    throw new ApiError(translate('errors.quotaExhausted'), 402, 'QUOTA_EXHAUSTED');
  }
};

const positionsFromRoles = (roles: string[] = []): Position[] => {
  const normalized = roles.map((role) => role.toLowerCase());
  const result = new Set<Position>();
  if (normalized.some((role) => role.includes('carry'))) result.add(1);
  if (normalized.some((role) => role.includes('nuker'))) result.add(2);
  if (normalized.some((role) => role.includes('durable') || role.includes('initiator')))
    result.add(3);
  if (normalized.some((role) => role.includes('support') || role.includes('disabler'))) {
    result.add(4);
    result.add(5);
  }
  return result.size ? [...result] : [1, 2, 3, 4, 5];
};

const mapHero = (item: BackendHero): Hero => {
  const local = heroById.get(item.id);
  const attributes = {
    str: 'strength',
    agi: 'agility',
    int: 'intelligence',
    all: 'universal',
  } as const;
  return {
    id: item.id,
    slug: local?.slug ?? item.name.replace('npc_dota_hero_', ''),
    name: item.localizedName ?? local?.name ?? item.name,
    attribute: item.primaryAttribute
      ? attributes[item.primaryAttribute]
      : (local?.attribute ?? 'universal'),
    positions: local?.positions ?? positionsFromRoles(item.roles),
    imageUrl: item.imageUrl ?? local?.imageUrl ?? '',
    ...(item.iconUrl ? { iconUrl: item.iconUrl } : {}),
    ...(typeof item.picks === 'number' ? { picks: item.picks } : {}),
    ...(typeof item.wins === 'number' ? { wins: item.wins } : {}),
    ...(typeof item.winRate === 'number' ? { winRate: item.winRate } : {}),
  };
};

const reasonKeys: Record<string, string> = {
  strong_counter: 'recommendation.reason.strongCounter',
  good_role_fit: 'recommendation.reason.roleFit',
  meta_favorite: 'recommendation.reason.meta',
  fills_team_need: 'recommendation.reason.teamNeed',
  limited_matchup_data: 'recommendation.reason.limitedData',
};

const mapAnalysis = (analysis: BackendAnalysis): AnalysisResult => ({
  id: analysis.id,
  draft: {
    allies: analysis.input.allyHeroIds,
    enemies: analysis.input.enemyHeroIds,
    position: analysis.input.position,
    rank: analysis.input.rank ?? null,
    source: analysis.input.source,
    photoUri: null,
    updatedAt: analysis.createdAt,
  },
  recommendations: analysis.result.recommendations.slice(0, 3).map((item, index) => ({
    hero: mapHero(item.hero),
    score: item.score,
    label: index === 0 ? 'best' : index === 1 ? 'reliable' : 'fallback',
    reasons: item.reasons.map((reason) =>
      reasonKeys[reason] ? `i18n:${reasonKeys[reason]}` : reason,
    ),
    risks: ['i18n:recommendation.risk.comfort'],
    laneFit: analysis.input.rank
      ? `i18n:recommendation.lane.rank|${analysis.input.rank}`
      : 'i18n:recommendation.lane.general',
  })),
  patch: analysis.result.patch,
  confidence: analysis.result.recommendations[0]?.confidence ?? 'low',
  dataUpdatedAt: analysis.result.metaFetchedAt,
  createdAt: analysis.createdAt,
  source: 'server',
});

export async function getHeroes(): Promise<Hero[]> {
  try {
    const payload = await apiRequest<z.infer<typeof heroesResponseSchema>>('/heroes', {
      timeoutMs: 6_000,
      schema: heroesResponseSchema,
    });
    const heroes = payload.heroes.map(mapHero);
    if (!heroes.length)
      throw new ApiError(translate('errors.emptyHeroes'), 502, 'EMPTY_HERO_CATALOG');
    useAppStore.getState().setHeroes(heroes);
    return heroes;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
    useAppStore.getState().setHeroes(fallbackHeroes);
    return fallbackHeroes;
  }
}

export type MetaSnapshot = {
  hero: Hero | null;
  patch: string;
  fetchedAt: string;
};

export async function getMetaSnapshot(rank?: number | null): Promise<MetaSnapshot> {
  try {
    const suffix = rank ? `?rank=${rank}` : '';
    const payload = await apiRequest<z.infer<typeof heroesResponseSchema>>(`/heroes${suffix}`, {
      timeoutMs: 6_000,
      schema: heroesResponseSchema,
    });
    const heroes = payload.heroes.map(mapHero);
    if (heroes.length) useAppStore.getState().setHeroes(heroes);
    const hero =
      heroes
        .filter((item) => (item.picks ?? 0) > 0 && typeof item.winRate === 'number')
        .sort((left, right) => {
          const winRateDelta = (right.winRate ?? 0) - (left.winRate ?? 0);
          return winRateDelta || (right.picks ?? 0) - (left.picks ?? 0);
        })[0] ?? null;
    return {
      hero,
      patch: payload.patch ?? 'unknown',
      fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
    const heroes = useAppStore.getState().heroes;
    const hero =
      heroes
        .filter((item) => (item.picks ?? 0) > 0 && typeof item.winRate === 'number')
        .sort((left, right) => (right.winRate ?? 0) - (left.winRate ?? 0))[0] ?? null;
    return {
      hero,
      patch: useAppStore.getState().history[0]?.patch ?? 'unknown',
      fetchedAt: new Date().toISOString(),
    };
  }
}

export async function recognizePhoto(input: {
  uri: string;
  idempotencyKey: string;
  expectedUserId?: string;
  signal?: AbortSignal;
}): Promise<RecognizedDraft> {
  const expectedUserId = input.expectedUserId ?? useAppStore.getState().session?.userId;
  const form = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(input.uri, input.signal ? { signal: input.signal } : undefined);
    if (!response.ok) throw new ApiError(translate('errors.photoRead'), 0, 'PHOTO_READ_ERROR');
    const sourceBlob = await response.blob();
    const inferredType = input.uri.startsWith('data:image/png')
      ? 'image/png'
      : input.uri.startsWith('data:image/webp')
        ? 'image/webp'
        : 'image/jpeg';
    const type = ['image/jpeg', 'image/png', 'image/webp'].includes(sourceBlob.type)
      ? sourceBlob.type
      : inferredType;
    const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const uploadBlob = sourceBlob.type === type ? sourceBlob : new Blob([sourceBlob], { type });
    form.append('image', uploadBlob, `draft.${extension}`);
  } else {
    form.append('image', {
      uri: input.uri,
      name: 'draft.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
  }
  const payload = await apiRequest<z.infer<typeof photoResponseSchema>>(
    '/analyses/photo/recognize',
    {
      method: 'POST',
      body: form,
      headers: { 'Idempotency-Key': input.idempotencyKey },
      ...(input.signal ? { signal: input.signal } : {}),
      timeoutMs: 25_000,
      schema: photoResponseSchema,
    },
  );
  if (!expectedUserId || useAppStore.getState().session?.userId !== expectedUserId) {
    throw new ApiError(translate('errors.authChanged'), 0, 'AUTH_OPERATION_STALE');
  }

  const assigned = payload.recognized.filter(
    (item): item is BackendRecognizedPick & { heroId: number; side: 'ally' | 'enemy' } =>
      item.heroId !== null && item.side !== 'unknown' && !item.needsReview,
  );
  const neutralPicks = payload.recognized
    .filter((item) => item.side === 'unknown' || item.heroId === null || item.needsReview)
    .map((item) => ({
      heroId: item.heroId,
      name: item.localizedName ?? item.heroName,
      slot: item.slot,
      confidence: item.confidence,
      needsReview: item.needsReview,
    }));
  return {
    allies: assigned.filter((item) => item.side === 'ally').map((item) => item.heroId),
    enemies: assigned.filter((item) => item.side === 'enemy').map((item) => item.heroId),
    neutralPicks,
    confidence: payload.recognized.length
      ? payload.recognized.reduce((sum, item) => sum + item.confidence, 0) /
        payload.recognized.length
      : 0,
    warnings: [
      ...(payload.quality === 'partial' ? [translate('photo.warning.partial')] : []),
      ...(payload.quality === 'too_blurry' ? [translate('photo.warning.blurry')] : []),
      ...(payload.quality === 'not_dota' ? [translate('photo.warning.notDota')] : []),
      ...(neutralPicks.length > 0 ? [translate('photo.warning.reviewSides')] : []),
    ],
  };
}

export async function analyzeDraft(
  draft: Draft,
  idempotencyKey: string,
  options: { expectedUserId?: string; signal?: AbortSignal; applyQuota?: boolean } = {},
): Promise<AnalysisResult> {
  const expectedUserId = options.expectedUserId ?? useAppStore.getState().session?.userId;
  if (!draft.position || draft.enemies.length === 0) {
    throw new ApiError(translate('errors.validationDraft'), 422, 'VALIDATION_ERROR');
  }
  if (!(await refreshNetworkState())) {
    assertOfflinePlanActive();
    return getQueuedOfflineResult(idempotencyKey) ?? analyzeOffline(draft);
  }

  try {
    const payload = await apiRequest<z.infer<typeof analysisResponseSchema>>('/analyses/manual', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        source: draft.source,
        position: draft.position,
        allyHeroIds: draft.allies,
        enemyHeroIds: draft.enemies,
        ...(draft.rank ? { rank: draft.rank } : {}),
      }),
      ...(options.signal ? { signal: options.signal } : {}),
      timeoutMs: 25_000,
      schema: analysisResponseSchema,
    });
    if (!expectedUserId || useAppStore.getState().session?.userId !== expectedUserId) {
      throw new ApiError(translate('errors.staleSession'), 0, 'AUTH_OPERATION_STALE');
    }
    if (options.applyQuota !== false) {
      applyServerQuota(payload.quota);
      const session = useAppStore.getState().session;
      if (session && session.plan !== payload.quota.plan) {
        useAppStore.getState().setSession({ ...session, plan: payload.quota.plan });
      }
    }
    return mapAnalysis(payload.analysis);
  } catch (error) {
    if (
      expectedUserId &&
      useAppStore.getState().session?.userId === expectedUserId &&
      error instanceof ApiError &&
      (error.code === 'QUOTA_EXHAUSTED' || error.status === 402)
    ) {
      const store = useAppStore.getState();
      const attempts = store.serverAttempts ?? store.attempts;
      const details =
        error.details && typeof error.details === 'object'
          ? (error.details as { nextRefillAt?: unknown })
          : null;
      const ownerScope = getSessionScope(store.session, store.guestId);
      const nextAttempts = {
        ...attempts,
        remaining: 0,
        nextRefreshAt:
          typeof details?.nextRefillAt === 'string' ? details.nextRefillAt : attempts.nextRefreshAt,
      };
      if (ownerScope) store.setServerAttempts(nextAttempts, ownerScope);
      else store.setAttempts(nextAttempts);
    }
    if (
      error instanceof ApiError &&
      (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') &&
      (!expectedUserId || useAppStore.getState().session?.userId === expectedUserId)
    ) {
      assertOfflinePlanActive();
      return getQueuedOfflineResult(idempotencyKey) ?? analyzeOffline(draft);
    }
    throw error;
  }
}

export async function getServerHistory() {
  const payload = await apiRequest<z.infer<typeof historyResponseSchema>>(
    '/analyses/history?limit=50',
    { schema: historyResponseSchema },
  );
  return payload.items.map(mapAnalysis);
}

let pendingSync: Promise<void> | null = null;
let pendingSyncRequested = false;
const IDEMPOTENCY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

const refreshAuthoritativeQuota = async (expectedUserId: string) => {
  const payload = await apiRequest<z.infer<typeof quotaResponseSchema>>('/quota', {
    schema: quotaResponseSchema,
  });
  const store = useAppStore.getState();
  if (store.session?.userId !== expectedUserId) return;
  applyServerQuota(payload.quota);
  if (store.session.plan !== payload.quota.plan) {
    store.setSession({ ...store.session, plan: payload.quota.plan });
  }
};

const syncPendingOfflineAnalyses = () => {
  if (pendingSync) {
    pendingSyncRequested = true;
    return pendingSync;
  }
  const task = (async () => {
    const initial = useAppStore.getState();
    const expectedUserId = initial.session?.userId;
    const ownerScope = getSessionScope(initial.session, initial.guestId);
    if (!expectedUserId || !ownerScope || !onlineManager.isOnline()) return;
    const initialPending = initial.pendingOfflineAnalyses.filter(
      (item) => item.ownerScope === ownerScope,
    );
    if (initialPending.length === 0) return;
    let changedServerState = false;

    while (onlineManager.isOnline()) {
      const store = useAppStore.getState();
      if (store.session?.userId !== expectedUserId) return;
      const scopedPending = store.pendingOfflineAnalyses.filter(
        (item) => item.ownerScope === ownerScope,
      );
      const pending = scopedPending[0];
      if (!pending) {
        if (changedServerState) {
          await refreshAuthoritativeQuota(expectedUserId).catch(() => {});
        }
        return;
      }
      const firstReplayAt = pending.firstReplayAt ? Date.parse(pending.firstReplayAt) : Number.NaN;
      if (
        Number.isFinite(firstReplayAt) &&
        Date.now() - firstReplayAt >= IDEMPOTENCY_RETRY_WINDOW_MS
      ) {
        store.rejectOfflineAnalysis(pending.localResultId);
        continue;
      }
      if (!pending.firstReplayAt || !Number.isFinite(firstReplayAt)) {
        const replayedAt = new Date().toISOString();
        store.setOfflineAnalysisReplay(pending.localResultId, replayedAt);
        try {
          await flushAppPersistence();
        } catch {
          useAppStore.getState().setOfflineAnalysisReplay(pending.localResultId, null);
          return;
        }
        const latest = useAppStore.getState();
        if (latest.session?.userId !== expectedUserId || !onlineManager.isOnline()) {
          return;
        }
      }
      try {
        const result = await analyzeDraft(pending.draft, pending.idempotencyKey, {
          expectedUserId,
          applyQuota: false,
        });
        if (result.source !== 'server') return;
        const latest = useAppStore.getState();
        if (latest.session?.userId !== expectedUserId) return;
        if (latest.serverAttempts && latest.serverAttemptsOwnerScope === ownerScope) {
          latest.setServerAttempts(
            {
              ...latest.serverAttempts,
              remaining: Math.max(0, latest.serverAttempts.remaining - 1),
            },
            ownerScope,
          );
        }
        latest.resolveOfflineAnalysis(pending.localResultId, result);
        changedServerState = true;
      } catch (error) {
        if (
          error instanceof ApiError &&
          [
            'HERO_NOT_FOUND',
            'INVALID_DRAFT',
            'VALIDATION_ERROR',
            'IDEMPOTENCY_KEY_REUSED',
          ].includes(error.code)
        ) {
          useAppStore.getState().rejectOfflineAnalysis(pending.localResultId);
          continue;
        }
        return;
      }
    }
  })();
  pendingSync = task.finally(() => {
    pendingSync = null;
    if (pendingSyncRequested) {
      pendingSyncRequested = false;
      void syncPendingOfflineAnalyses();
    }
  });
  return pendingSync;
};

export async function syncQuota(): Promise<BackendQuota | undefined> {
  const expectedSession = useAppStore.getState().session;
  const expectedUserId = expectedSession?.userId;
  let payload;
  try {
    payload = await apiRequest<z.infer<typeof quotaResponseSchema>>('/quota', {
      schema: quotaResponseSchema,
    });
  } catch (error) {
    const store = useAppStore.getState();
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      store.session?.userId === expectedUserId &&
      store.guestId
    ) {
      if (expectedSession?.kind === 'registered') resetToLocalGuest(true);
      const session = await bootstrapGuestSession(store.guestId);
      const recoveredSession = useAppStore.getState().session;
      if (recoveredSession?.userId !== session.userId) return undefined;
      return syncQuota();
    }
    throw error;
  }
  if (useAppStore.getState().session?.userId !== expectedUserId) return undefined;
  applyServerQuota(payload.quota);
  const session = useAppStore.getState().session;
  if (session && session.plan !== payload.quota.plan) {
    if (useAppStore.getState().session?.userId !== expectedUserId) return undefined;
    useAppStore.getState().setSession({ ...session, plan: payload.quota.plan });
  }
  void syncPendingOfflineAnalyses();
  return payload.quota;
}
