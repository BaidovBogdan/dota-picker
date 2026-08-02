import { z } from 'zod';
import type {
  Account,
  Analysis,
  BillingStatus,
  HistoryPage,
  Hero,
  OtpChallenge,
  Position,
  Quota,
  Rank,
  SessionState,
} from '../shared/contracts.js';
import { rankSchema } from '../shared/contracts.js';
import {
  accountSchema,
  analysisSchema,
  apiErrorSchema,
  authResponseSchema,
  billingResponseSchema,
  desktopAnalysisResponseSchema,
  heroSchema,
  historyResponseSchema,
  otpChallengeSchema,
  quotaSchema,
} from './api-schemas.js';
import { DesktopError } from './errors.js';
import type { TokenVault } from './token-vault.js';

const emptyResponseSchema = z.object({ success: z.literal(true) });

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: BodyInit;
  headers?: Record<string, string>;
  authenticated?: boolean;
  timeoutMs?: number;
  retryAuthentication?: boolean;
  allowDuringAuthenticationBlock?: boolean;
  allowDuringAuthenticatedAuth?: boolean;
};

type AuthPayload = z.infer<typeof authResponseSchema>;
export type DesktopAnalysisResponse = z.infer<typeof desktopAnalysisResponseSchema>;

export class ApiClient {
  private accessToken: string | null = null;
  private sessionAuthenticated = false;
  private authenticationBlocked = false;
  private authGeneration = 0;
  private authMutationQueue: Promise<void> = Promise.resolve();
  private authenticatedAuthQueue: Promise<void> = Promise.resolve();
  private refreshPromise: { generation: number; promise: Promise<AuthPayload> } | null = null;
  private authenticationListener: ((authenticated: boolean) => void | Promise<void>) | null = null;
  private readonly authenticatedRequests = new Set<AbortController>();
  private readonly baseUrl: URL;

  constructor(baseUrl: string, private readonly tokenVault: TokenVault) {
    this.baseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (this.baseUrl.protocol !== 'https:' && this.baseUrl.hostname !== 'localhost' && this.baseUrl.hostname !== '127.0.0.1') {
      throw new Error('API URL must use HTTPS outside localhost');
    }
  }

  isAuthenticated(): boolean {
    return this.sessionAuthenticated;
  }

  setAuthenticationListener(
    listener: (authenticated: boolean) => void | Promise<void>,
  ): void {
    this.authenticationListener = listener;
  }

  async bootstrap(): Promise<SessionState> {
    const generation = this.authGeneration;
    const refreshToken = await this.tokenVault.read();
    if (!refreshToken) return { authenticated: false, account: null };
    try {
      const auth = await this.refresh(refreshToken);
      return { authenticated: true, account: auth.account };
    } catch (error) {
      if (
        error instanceof DesktopError
        && (error.status === 401 || error.status === 403)
        && generation === this.authGeneration
      ) {
        await this.clearSession();
        return { authenticated: false, account: null };
      }
      throw error;
    }
  }

  async requestOtp(input: {
    purpose: 'register' | 'login' | 'password_reset' | 'password_change';
    email?: string;
    password?: string;
  }): Promise<OtpChallenge> {
    const authenticated = input.purpose === 'password_change';
    const endpoint = authenticated ? 'auth/otp/request-authenticated' : 'auth/otp/request';
    const payload = await this.request(endpoint, otpChallengeSchema, {
      method: 'POST',
      authenticated,
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
    });
    return payload as OtpChallenge;
  }

  async login(input: Record<string, string>): Promise<{ account: Account }> {
    const auth = await this.authenticate('auth/login', input);
    return { account: auth.account };
  }

  async register(input: Record<string, string>): Promise<{ account: Account }> {
    const auth = await this.authenticate('auth/register', input);
    return { account: auth.account };
  }

  async resetPassword(input: Record<string, string>): Promise<{ account: Account }> {
    const auth = await this.authenticate('auth/password/reset', input);
    return { account: auth.account };
  }

  async changePassword(input: Record<string, string>): Promise<{ account: Account }> {
    const auth = await this.authenticate('auth/password/change', input, true);
    return { account: auth.account };
  }

  async logout(): Promise<void> {
    const refreshToken = await this.tokenVault.read();
    await this.clearSession();
    try {
      if (refreshToken) {
        await this.request('auth/logout', emptyResponseSchema, {
          method: 'POST',
          authenticated: false,
          body: JSON.stringify({ refreshToken }),
          headers: { 'content-type': 'application/json' },
          retryAuthentication: false,
        });
      }
    } catch {
      return;
    }
  }

  async getMe(): Promise<{ account: Account }> {
    return this.request('me', z.object({ account: accountSchema })) as Promise<{ account: Account }>;
  }

  async getQuota(): Promise<{ quota: Quota }> {
    return this.request('quota', z.object({ quota: quotaSchema })) as Promise<{ quota: Quota }>;
  }

  async deleteAccount(): Promise<void> {
    if (this.sessionAuthenticated && !this.accessToken) await this.refresh();
    const restoreAuthentication = this.sessionAuthenticated;
    this.authenticationBlocked = true;
    const generation = ++this.authGeneration;
    if (restoreAuthentication) {
      this.sessionAuthenticated = false;
      for (const controller of this.authenticatedRequests) controller.abort();
      this.authenticatedRequests.clear();
      this.notifyAuthenticationChanged(false);
    }
    try {
      await this.request('me', emptyResponseSchema, {
        method: 'DELETE',
        retryAuthentication: false,
        allowDuringAuthenticationBlock: true,
      });
      await this.clearSession();
    } catch (error) {
      if (restoreAuthentication && this.accessToken && this.authGeneration === generation) {
        this.authenticationBlocked = false;
        this.sessionAuthenticated = true;
        this.notifyAuthenticationChanged(true);
      }
      throw error;
    }
  }

  async history(input?: { cursor?: string | null; limit?: number }): Promise<HistoryPage> {
    const query = new URLSearchParams();
    if (input?.cursor) query.set('cursor', input.cursor);
    if (input?.limit) query.set('limit', String(input.limit));
    const suffix = query.size ? `?${query}` : '';
    return this.request(`analyses/history${suffix}`, historyResponseSchema) as Promise<HistoryPage>;
  }

  async analysis(id: string): Promise<{ analysis: Analysis }> {
    return this.request(`analyses/history/${encodeURIComponent(id)}`, z.object({
      analysis: analysisSchema,
    })) as Promise<{ analysis: Analysis }>;
  }

  async heroes(): Promise<{ heroes: Hero[]; patch?: string; fetchedAt?: string }> {
    return this.request('heroes', z.object({
      heroes: z.array(heroSchema),
      patch: z.string().optional(),
      fetchedAt: z.string().datetime().optional(),
    }).loose()) as Promise<{ heroes: Hero[]; patch?: string; fetchedAt?: string }>;
  }

  async meta(rank?: Rank | null): Promise<Record<string, unknown>> {
    const suffix = rank ? `?rank=${rank}` : '';
    return this.request(`heroes/meta-positions${suffix}`, z.object({
      heroes: z.array(heroSchema),
      patch: z.string(),
      rank: rankSchema.nullable(),
      positionStats: z.array(z.record(z.string(), z.unknown())),
    }).loose());
  }

  async hero(id: number): Promise<Record<string, unknown>> {
    return this.request(`heroes/${id}/detail`, z.object({
      hero: heroSchema,
      patch: z.object({ id: z.number(), name: z.string(), releasedAt: z.string().nullable() }),
      rankWinRates: z.array(z.record(z.string(), z.unknown())),
      builds: z.array(z.record(z.string(), z.unknown())),
    }).loose());
  }

  async reviews(input?: {
    cursor?: string | null;
    limit?: number;
    analysisId?: string;
  }): Promise<Record<string, unknown>> {
    const query = new URLSearchParams();
    if (input?.cursor) query.set('cursor', input.cursor);
    if (input?.limit) query.set('limit', String(input.limit));
    if (input?.analysisId) query.set('analysisId', input.analysisId);
    const suffix = query.size ? `?${query}` : '';
    return this.request(`account/reviews${suffix}`, z.object({
      items: z.array(z.record(z.string(), z.unknown())),
      nextCursor: z.string().nullable(),
      total: z.number().int().nonnegative(),
    }).loose());
  }

  async upsertReview(analysisId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request(`analyses/${encodeURIComponent(analysisId)}/review`, z.object({
      review: z.record(z.string(), z.unknown()),
    }), {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
    });
  }

  async deleteReview(id: string): Promise<void> {
    await this.request(`account/reviews/${encodeURIComponent(id)}`, emptyResponseSchema, {
      method: 'DELETE',
    });
  }

  async billingStatus(): Promise<BillingStatus> {
    const payload = await this.request('billing/status', billingResponseSchema);
    return {
      plan: payload.plan,
      active: payload.entitlement.active,
      expiresAt: payload.entitlement.expiresAt,
    };
  }

  async analyzeDesktop(
    image: Buffer,
    position: Position,
    rank: Rank | null,
    sessionId: string,
    revision: number,
    idempotencyKey: string,
    autoPosition: boolean,
  ): Promise<DesktopAnalysisResponse> {
    const query = new URLSearchParams({
      autoPosition: String(autoPosition),
      position: String(position),
      revision: String(revision),
      sessionId,
    });
    if (rank) query.set('rank', String(rank));
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'draft.png');
    return this.request(`analyses/desktop?${query}`, desktopAnalysisResponseSchema, {
      method: 'POST',
      body: form,
      headers: { 'idempotency-key': idempotencyKey },
      timeoutMs: 45_000,
    });
  }

  private async authenticate(
    endpoint: string,
    input: Record<string, string>,
    authenticated = false,
  ): Promise<AuthPayload> {
    if (authenticated) {
      return this.enqueueAuthenticatedAuth(() => this.performAuthentication(endpoint, input, true));
    }
    return this.performAuthentication(endpoint, input, false);
  }

  private async performAuthentication(
    endpoint: string,
    input: Record<string, string>,
    authenticated: boolean,
  ): Promise<AuthPayload> {
    if (authenticated && this.refreshPromise) {
      await this.refreshPromise.promise;
    }
    if (!authenticated) this.authenticationBlocked = false;
    const generation = ++this.authGeneration;
    const auth = await this.request(endpoint, authResponseSchema, {
      method: 'POST',
      authenticated,
      allowDuringAuthenticatedAuth: authenticated,
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
    });
    await this.acceptAuth(auth, generation);
    return auth;
  }

  private async refresh(refreshToken?: string): Promise<AuthPayload> {
    if (this.authenticationBlocked) {
      throw new DesktopError('AUTH_REQUIRED', 'Требуется вход в аккаунт', 401);
    }
    const generation = this.authGeneration;
    if (this.refreshPromise?.generation === generation) return this.refreshPromise.promise;
    const promise = (async () => {
      const token = refreshToken ?? await this.tokenVault.read();
      if (!token) throw new DesktopError('AUTH_REQUIRED', 'Требуется вход в аккаунт', 401);
      const auth = await this.request('auth/refresh', authResponseSchema, {
        method: 'POST',
        authenticated: false,
        retryAuthentication: false,
        body: JSON.stringify({ refreshToken: token }),
        headers: { 'content-type': 'application/json' },
      });
      await this.acceptAuth(auth, generation);
      return auth;
    })();
    this.refreshPromise = { generation, promise };
    try {
      return await promise;
    } finally {
      if (this.refreshPromise?.promise === promise) this.refreshPromise = null;
    }
  }

  private async acceptAuth(auth: AuthPayload, generation: number): Promise<void> {
    await this.enqueueAuthMutation(async () => {
      if (generation !== this.authGeneration) {
        throw new DesktopError('AUTH_STATE_CHANGED', 'Состояние сессии изменилось');
      }
      await this.tokenVault.write(auth.refreshToken);
      if (generation !== this.authGeneration) {
        throw new DesktopError('AUTH_STATE_CHANGED', 'Состояние сессии изменилось');
      }
      this.accessToken = auth.accessToken;
      if (!this.sessionAuthenticated) {
        this.sessionAuthenticated = true;
        this.notifyAuthenticationChanged(true);
      }
    });
  }

  private async clearSession(): Promise<void> {
    const notify = this.sessionAuthenticated;
    this.authenticationBlocked = true;
    this.authGeneration += 1;
    this.accessToken = null;
    this.sessionAuthenticated = false;
    for (const controller of this.authenticatedRequests) controller.abort();
    this.authenticatedRequests.clear();
    if (notify) this.notifyAuthenticationChanged(false);
    await this.enqueueAuthMutation(() => this.tokenVault.clear());
  }

  private enqueueAuthMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.authMutationQueue.then(operation);
    this.authMutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private enqueueAuthenticatedAuth<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.authenticatedAuthQueue.then(operation);
    this.authenticatedAuthQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private notifyAuthenticationChanged(authenticated: boolean): void {
    try {
      const result = this.authenticationListener?.(authenticated);
      if (result) void Promise.resolve(result).catch(() => undefined);
    } catch {
      return;
    }
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    const authenticated = options.authenticated ?? true;
    if (authenticated && !options.allowDuringAuthenticatedAuth) {
      await this.authenticatedAuthQueue;
    }
    const requestGeneration = this.authGeneration;
    if (authenticated && this.authenticationBlocked && !options.allowDuringAuthenticationBlock) {
      throw new DesktopError('AUTH_REQUIRED', 'Требуется вход в аккаунт', 401);
    }
    if (authenticated && !this.accessToken) {
      await this.refresh();
    }
    const controller = new AbortController();
    if (authenticated) this.authenticatedRequests.add(controller);
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: options.method ?? 'GET',
        body: options.body,
        headers: {
          accept: 'application/json',
          ...(authenticated && this.accessToken
            ? { authorization: `Bearer ${this.accessToken}` }
            : {}),
          ...options.headers,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DesktopError('TIMEOUT', 'Сервер не ответил вовремя');
      }
      throw new DesktopError('NETWORK_ERROR', 'Нет соединения с сервером');
    } finally {
      clearTimeout(timeout);
      this.authenticatedRequests.delete(controller);
    }

    if (
      response.status === 401
      && authenticated
      && options.retryAuthentication !== false
      && requestGeneration === this.authGeneration
    ) {
      this.accessToken = null;
      await this.refresh();
      return this.request(path, schema, { ...options, retryAuthentication: false });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      if (response.status === 401 && requestGeneration === this.authGeneration) {
        await this.clearSession();
      }
      throw new DesktopError(
        parsed.success ? parsed.data.error.code : 'HTTP_ERROR',
        parsed.success ? parsed.data.error.message : `HTTP ${response.status}`,
        response.status,
        parsed.success ? parsed.data.error.details : undefined,
      );
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new DesktopError('INVALID_API_RESPONSE', 'Сервер вернул несовместимый ответ', 502, parsed.error.issues);
    }
    return parsed.data;
  }
}
