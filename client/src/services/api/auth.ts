import { z } from 'zod';

import { translate } from '@/i18n';
import {
  ApiError,
  apiRequest,
  beginAuthTransition,
  clearTokensForGeneration,
  hasAuthCredentials,
  isAuthGenerationCurrent,
  saveTokensForGeneration,
  takeRefreshTokenAndClear,
} from '@/services/api/client';
import { flushAppPersistence, getSessionScope, useAppStore } from '@/store/app-store';
import type { Attempts, Session } from '@/types/domain';

const backendQuotaSchema = z.object({
  plan: z.enum(['free', 'pro']),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  nextRefillAt: z.string().min(1).nullable(),
  planExpiresAt: z.string().min(1).nullable(),
});

const backendAccountSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['guest', 'user']),
  email: z.email().nullable(),
  revenueCatAppUserId: z.uuid(),
  quota: backendQuotaSchema,
});

const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  account: backendAccountSchema,
});

const accountResponseSchema = z.union([
  backendAccountSchema,
  z.object({ account: backendAccountSchema }),
]);

type BackendQuota = z.infer<typeof backendQuotaSchema>;
type BackendAccount = z.infer<typeof backendAccountSchema>;
type AuthResponse = z.infer<typeof authResponseSchema>;

const mapQuota = (quota: BackendQuota): Attempts => ({
  remaining: quota.remaining,
  maximum: quota.limit,
  nextRefreshAt: quota.nextRefillAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  planExpiresAt: quota.planExpiresAt,
});

const mapSession = (account: BackendAccount): Session => ({
  userId: account.id,
  kind: account.kind === 'user' ? 'registered' : 'guest',
  email: account.email,
  displayName: account.email?.split('@')[0] ?? translate('profile.guest'),
  plan: account.quota.plan,
  revenueCatAppUserId: account.revenueCatAppUserId,
});

const staleAuthError = () =>
  new ApiError(translate('errors.authChanged'), 0, 'AUTH_OPERATION_STALE');

const commitAccount = (account: BackendAccount, generation: number) => {
  if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
  const session = mapSession(account);
  const store = useAppStore.getState();
  const ownerScope = getSessionScope(session, store.guestId);
  if (!ownerScope) throw staleAuthError();
  store.commitServerSession(session, mapQuota(account.quota), ownerScope);
  return session;
};

const acceptAuth = async (response: AuthResponse, generation: number) => {
  const saved = await saveTokensForGeneration(
    response.accessToken,
    response.refreshToken,
    generation,
  );
  if (!saved) throw staleAuthError();
  return commitAccount(response.account, generation);
};

export const hasStoredSession = hasAuthCredentials;

export async function bootstrapGuestSession(deviceId: string) {
  const generation = beginAuthTransition();
  if (await hasAuthCredentials()) {
    if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
    try {
      const payload = await apiRequest<z.infer<typeof accountResponseSchema>>('/me', {
        schema: accountResponseSchema,
      });
      const account = 'account' in payload ? payload.account : payload;
      return commitAccount(account, generation);
    } catch (error) {
      if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await clearTokensForGeneration(generation);
      } else {
        throw error;
      }
    }
  }

  const response = await apiRequest<AuthResponse>('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
    schema: authResponseSchema,
  });
  return acceptAuth(response, generation);
}

export async function authenticate(input: {
  mode: 'login' | 'register';
  email: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const generation = beginAuthTransition();
  const initialStore = useAppStore.getState();
  const session = initialStore.session;
  const previousScope = getSessionScope(session, initialStore.guestId);
  if (session?.kind === 'registered') {
    throw new ApiError(translate('errors.alreadyAuthenticated'), 409, 'ALREADY_AUTHENTICATED');
  }
  const canUpgradeGuest =
    input.mode === 'register' && session?.kind === 'guest' && (await hasAuthCredentials());
  if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
  const path = canUpgradeGuest ? '/auth/upgrade-guest' : `/auth/${input.mode}`;
  if (input.mode === 'register' && previousScope) {
    useAppStore.getState().setPendingRegistration({ ownerScope: previousScope, email });
    try {
      await flushAppPersistence();
    } catch {
      useAppStore.getState().setPendingRegistration(null);
      throw new ApiError(translate('errors.storage'), 0, 'STORAGE_ERROR');
    }
  }
  let response: AuthResponse;
  try {
    response = await apiRequest<AuthResponse>(path, {
      method: 'POST',
      body: JSON.stringify({ email, password: input.password }),
      schema: authResponseSchema,
    });
  } catch (error) {
    const store = useAppStore.getState();
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      store.pendingRegistration?.ownerScope === previousScope &&
      store.pendingRegistration.email === email
    ) {
      store.setPendingRegistration(null);
    }
    throw error;
  }
  return acceptAuth(response, generation);
}

export async function logout() {
  const generation = beginAuthTransition();
  const refreshToken = await takeRefreshTokenAndClear(generation);
  try {
    if (refreshToken) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        timeoutMs: 4_000,
      });
    }
  } finally {
    await clearTokensForGeneration(generation);
  }
}

export async function deleteAccount() {
  const generation = beginAuthTransition();
  const initialStore = useAppStore.getState();
  const ownerScope = getSessionScope(initialStore.session, initialStore.guestId);
  if (!ownerScope || initialStore.session?.kind !== 'registered') {
    throw new ApiError(translate('errors.authRequired'), 401, 'AUTH_REQUIRED');
  }
  initialStore.setPendingAccountDeletionScope(ownerScope);
  try {
    await flushAppPersistence();
  } catch {
    useAppStore.getState().setPendingAccountDeletionScope(null);
    throw new ApiError(translate('errors.storage'), 0, 'STORAGE_ERROR');
  }
  try {
    await apiRequest<{ success: true }>('/me', {
      method: 'DELETE',
      schema: z.object({ success: z.literal(true) }),
    });
  } catch (error) {
    useAppStore.getState().setPendingAccountDeletionScope(null);
    throw error;
  }
  if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
  useAppStore.getState().discardOwnerScope(ownerScope);
  await flushAppPersistence();
  const clearGeneration = beginAuthTransition();
  await clearTokensForGeneration(clearGeneration);
}
