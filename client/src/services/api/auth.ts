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

const otpChallengeResponseSchema = z.object({
  challengeId: z.uuid(),
  purpose: z.enum(['register', 'login', 'upgrade_guest', 'password_reset', 'password_change']),
  expiresAt: z.iso.datetime(),
  retryAfterSeconds: z.number().int().nonnegative(),
});

const accountResponseSchema = z.union([
  backendAccountSchema,
  z.object({ account: backendAccountSchema }),
]);

type BackendQuota = z.infer<typeof backendQuotaSchema>;
type BackendAccount = z.infer<typeof backendAccountSchema>;
type AuthResponse = z.infer<typeof authResponseSchema>;
type OtpChallengeResponse = z.infer<typeof otpChallengeResponseSchema>;

export type AuthenticationOtpChallenge = OtpChallengeResponse & {
  flow: 'login' | 'register' | 'upgrade_guest';
  email: string;
  password: string;
  generation: number;
  previousScope: string | null;
};

export type PasswordResetOtpChallenge = OtpChallengeResponse & {
  purpose: 'password_reset';
  email: string;
  generation: number;
};

export type PasswordChangeOtpChallenge = OtpChallengeResponse & {
  purpose: 'password_change';
  generation: number;
};

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

export async function requestAuthenticationOtp(input: {
  mode: 'login' | 'register';
  email: string;
  password: string;
}): Promise<AuthenticationOtpChallenge> {
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
  const flow = canUpgradeGuest ? 'upgrade_guest' : input.mode;
  const path = canUpgradeGuest ? '/auth/otp/request-authenticated' : '/auth/otp/request';
  const body =
    flow === 'upgrade_guest'
      ? { purpose: flow, email }
      : flow === 'login'
        ? { purpose: flow, email, password: input.password }
        : { purpose: flow, email };
  const response = await apiRequest<OtpChallengeResponse>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    schema: otpChallengeResponseSchema,
  });
  if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
  if (response.purpose !== flow) {
    throw new ApiError(translate('errors.incompatibleResponse'), 502, 'API_CONTRACT_ERROR');
  }
  return {
    ...response,
    flow,
    email,
    password: input.password,
    generation,
    previousScope,
  };
}

export async function completeAuthenticationOtp(
  challenge: AuthenticationOtpChallenge,
  code: string,
) {
  if (!isAuthGenerationCurrent(challenge.generation)) throw staleAuthError();
  if (challenge.flow !== 'login' && challenge.previousScope) {
    useAppStore.getState().setPendingRegistration({
      ownerScope: challenge.previousScope,
      email: challenge.email,
    });
    try {
      await flushAppPersistence();
    } catch {
      useAppStore.getState().setPendingRegistration(null);
      throw new ApiError(translate('errors.storage'), 0, 'STORAGE_ERROR');
    }
  }
  if (!isAuthGenerationCurrent(challenge.generation)) throw staleAuthError();
  const path =
    challenge.flow === 'upgrade_guest' ? '/auth/upgrade-guest' : `/auth/${challenge.flow}`;
  let response: AuthResponse;
  try {
    response = await apiRequest<AuthResponse>(path, {
      method: 'POST',
      body: JSON.stringify({
        email: challenge.email,
        password: challenge.password,
        challengeId: challenge.challengeId,
        code,
      }),
      schema: authResponseSchema,
    });
  } catch (error) {
    if (
      challenge.flow !== 'login' &&
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      useAppStore.getState().pendingRegistration?.ownerScope === challenge.previousScope &&
      useAppStore.getState().pendingRegistration?.email === challenge.email
    ) {
      useAppStore.getState().setPendingRegistration(null);
    }
    throw error;
  }
  return acceptAuth(response, challenge.generation);
}

export async function requestPasswordResetOtp(
  rawEmail: string,
): Promise<PasswordResetOtpChallenge> {
  const email = rawEmail.trim().toLowerCase();
  const generation = beginAuthTransition();
  const response = await apiRequest<OtpChallengeResponse>('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ purpose: 'password_reset', email }),
    schema: otpChallengeResponseSchema,
  });
  if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
  if (response.purpose !== 'password_reset') {
    throw new ApiError(translate('errors.incompatibleResponse'), 502, 'API_CONTRACT_ERROR');
  }
  return { ...response, purpose: 'password_reset', email, generation };
}

export async function completePasswordReset(
  challenge: PasswordResetOtpChallenge,
  input: { code: string; newPassword: string },
) {
  if (!isAuthGenerationCurrent(challenge.generation)) throw staleAuthError();
  const response = await apiRequest<AuthResponse>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      email: challenge.email,
      newPassword: input.newPassword,
      challengeId: challenge.challengeId,
      code: input.code,
    }),
    schema: authResponseSchema,
  });
  return acceptAuth(response, challenge.generation);
}

export async function requestPasswordChangeOtp(): Promise<PasswordChangeOtpChallenge> {
  const initialStore = useAppStore.getState();
  if (initialStore.session?.kind !== 'registered') {
    throw new ApiError(translate('errors.authRequired'), 401, 'AUTH_REQUIRED');
  }
  const generation = beginAuthTransition();
  const response = await apiRequest<OtpChallengeResponse>('/auth/otp/request-authenticated', {
    method: 'POST',
    body: JSON.stringify({ purpose: 'password_change' }),
    schema: otpChallengeResponseSchema,
  });
  if (!isAuthGenerationCurrent(generation)) throw staleAuthError();
  if (response.purpose !== 'password_change') {
    throw new ApiError(translate('errors.incompatibleResponse'), 502, 'API_CONTRACT_ERROR');
  }
  return { ...response, purpose: 'password_change', generation };
}

export async function completePasswordChange(
  challenge: PasswordChangeOtpChallenge,
  input: { code: string; currentPassword: string; newPassword: string },
) {
  if (!isAuthGenerationCurrent(challenge.generation)) throw staleAuthError();
  const response = await apiRequest<AuthResponse>('/auth/password/change', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      challengeId: challenge.challengeId,
      code: input.code,
    }),
    schema: authResponseSchema,
  });
  return acceptAuth(response, challenge.generation);
}

export function cancelOtpChallenge(
  challenge:
    AuthenticationOtpChallenge | PasswordResetOtpChallenge | PasswordChangeOtpChallenge | null,
) {
  if (!challenge || !isAuthGenerationCurrent(challenge.generation)) return;
  beginAuthTransition();
  if (
    'flow' in challenge &&
    challenge.flow !== 'login' &&
    challenge.previousScope &&
    useAppStore.getState().pendingRegistration?.ownerScope === challenge.previousScope &&
    useAppStore.getState().pendingRegistration?.email === challenge.email
  ) {
    useAppStore.getState().setPendingRegistration(null);
    void flushAppPersistence().catch(() => {});
  }
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
