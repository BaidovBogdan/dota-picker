import { z } from 'zod';
import type {
  Account,
  Analysis,
  BillingStatus,
  HistoryPage,
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
};

type AuthPayload = z.infer<typeof authResponseSchema>;
export type DesktopAnalysisResponse = z.infer<typeof desktopAnalysisResponseSchema>;

export class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<AuthPayload> | null = null;
  private readonly baseUrl: URL;

  constructor(baseUrl: string, private readonly tokenVault: TokenVault) {
    this.baseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (this.baseUrl.protocol !== 'https:' && this.baseUrl.hostname !== 'localhost' && this.baseUrl.hostname !== '127.0.0.1') {
      throw new Error('API URL must use HTTPS outside localhost');
    }
  }

  async bootstrap(): Promise<SessionState> {
    const refreshToken = await this.tokenVault.read();
    if (!refreshToken) return { authenticated: false, account: null };
    try {
      const auth = await this.refresh(refreshToken);
      return { authenticated: true, account: auth.account };
    } catch (error) {
      if (error instanceof DesktopError && (error.status === 401 || error.status === 403)) {
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
    } finally {
      await this.clearSession();
    }
  }

  async getMe(): Promise<{ account: Account }> {
    return this.request('me', z.object({ account: accountSchema })) as Promise<{ account: Account }>;
  }

  async getQuota(): Promise<{ quota: Quota }> {
    return this.request('quota', z.object({ quota: quotaSchema })) as Promise<{ quota: Quota }>;
  }

  async deleteAccount(): Promise<void> {
    await this.request('me', emptyResponseSchema, { method: 'DELETE' });
    await this.clearSession();
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

  async heroes(): Promise<Record<string, unknown>> {
    return this.request('heroes', z.object({
      heroes: z.array(heroSchema),
      patch: z.string().optional(),
      fetchedAt: z.string().datetime().optional(),
    }).loose());
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
  ): Promise<DesktopAnalysisResponse> {
    const query = new URLSearchParams({
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
    const auth = await this.request(endpoint, authResponseSchema, {
      method: 'POST',
      authenticated,
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
    });
    await this.acceptAuth(auth);
    return auth;
  }

  private async refresh(refreshToken?: string): Promise<AuthPayload> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const token = refreshToken ?? await this.tokenVault.read();
      if (!token) throw new DesktopError('AUTH_REQUIRED', 'Требуется вход в аккаунт', 401);
      const auth = await this.request('auth/refresh', authResponseSchema, {
        method: 'POST',
        authenticated: false,
        retryAuthentication: false,
        body: JSON.stringify({ refreshToken: token }),
        headers: { 'content-type': 'application/json' },
      });
      await this.acceptAuth(auth);
      return auth;
    })();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async acceptAuth(auth: AuthPayload): Promise<void> {
    await this.tokenVault.write(auth.refreshToken);
    this.accessToken = auth.accessToken;
  }

  private async clearSession(): Promise<void> {
    this.accessToken = null;
    await this.tokenVault.clear();
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    const authenticated = options.authenticated ?? true;
    if (authenticated && !this.accessToken) {
      await this.refresh();
    }
    const controller = new AbortController();
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
    }

    if (response.status === 401 && authenticated && options.retryAuthentication !== false) {
      this.accessToken = null;
      await this.refresh();
      return this.request(path, schema, { ...options, retryAuthentication: false });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      if (response.status === 401) await this.clearSession();
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
