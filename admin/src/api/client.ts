import type {
  AdminAnalysesResponse,
  AdminAnalysis,
  AdminAnalysesQuery,
  AdminGrantResult,
  AdminDiagnosticSessionQuery,
  AdminDiagnosticSessionResponse,
  AdminDiagnosticSessionsQuery,
  AdminDiagnosticSessionsResponse,
  AdminMeta,
  AdminOverview,
  AdminReviewsResponse,
  AdminReviewsQuery,
  AdminSession,
  AdminSystem,
  AdminUsersResponse,
  AdminUsersQuery,
  HeroCatalogResponse,
  RankBracket,
} from '../types';

const sessionKey = 'counterpick.admin.session';
const requestTimeoutMs = 15_000;

type ResponseGuard<T> = (payload: unknown) => payload is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPagination(value: unknown): boolean {
  return isRecord(value)
    && isNumber(value.limit)
    && isNumber(value.offset)
    && isNumber(value.total);
}

function isSessionResponse(value: unknown): value is AdminSession {
  return isRecord(value) && isString(value.token) && isString(value.expiresAt);
}

function isOverviewResponse(value: unknown): value is AdminOverview {
  return isRecord(value)
    && isRecord(value.totals)
    && Array.isArray(value.daily)
    && Array.isArray(value.recentActivity)
    && isString(value.generatedAt);
}

function isUsersResponse(value: unknown): value is AdminUsersResponse {
  return isRecord(value)
    && isPagination(value.pagination)
    && Array.isArray(value.items)
    && value.items.every((item) => isRecord(item) && isString(item.id) && isString(item.kind));
}

function isAnalysisSummary(value: unknown): boolean {
  return isRecord(value)
    && isString(value.id)
    && isString(value.accountId)
    && isRecord(value.account)
    && isString(value.account.id)
    && isString(value.status)
    && isString(value.source)
    && Array.isArray(value.recommendationHeroIds)
    && value.recommendationHeroIds.every(isNumber)
    && typeof value.hasResult === 'boolean';
}

function isAnalysesResponse(value: unknown): value is AdminAnalysesResponse {
  return isRecord(value)
    && isPagination(value.pagination)
    && Array.isArray(value.items)
    && value.items.every(isAnalysisSummary);
}

function isAnalysisDetail(value: unknown): value is AdminAnalysis {
  return isRecord(value)
    && isString(value.id)
    && isString(value.accountId)
    && isRecord(value.account)
    && isString(value.account.id)
    && isString(value.status)
    && isString(value.source)
    && isRecord(value.dataQuality)
    && Array.isArray(value.quotaEvents);
}

function isAnalysisDetailResponse(value: unknown): value is { analysis: AdminAnalysis } {
  return isRecord(value) && isAnalysisDetail(value.analysis);
}

function isDiagnosticSessionsResponse(value: unknown): value is AdminDiagnosticSessionsResponse {
  return isRecord(value)
    && isPagination(value.pagination)
    && isRecord(value.summary)
    && Array.isArray(value.items);
}

function isDiagnosticSessionResponse(value: unknown): value is AdminDiagnosticSessionResponse {
  return isRecord(value)
    && isRecord(value.session)
    && Array.isArray(value.events)
    && isRecord(value.pagination);
}

function isHeroCatalogResponse(value: unknown): value is HeroCatalogResponse {
  return isRecord(value)
    && isString(value.patch)
    && isString(value.fetchedAt)
    && Array.isArray(value.heroes)
    && value.heroes.every((hero) => isRecord(hero) && isNumber(hero.id) && isString(hero.name));
}

function isReviewsResponse(value: unknown): value is AdminReviewsResponse {
  return isRecord(value)
    && isRecord(value.summary)
    && isPagination(value.pagination)
    && Array.isArray(value.items);
}

function isMetaResponse(value: unknown): value is AdminMeta {
  return isRecord(value)
    && isString(value.patch)
    && Array.isArray(value.heroes)
    && Array.isArray(value.positionStats);
}

function isSystemResponse(value: unknown): value is AdminSystem {
  return isRecord(value)
    && isString(value.generatedAt)
    && isRecord(value.summary)
    && isRecord(value.groups);
}

function isGrantResponse(value: unknown): value is AdminGrantResult {
  return isRecord(value)
    && isString(value.marker)
    && typeof value.alreadyApplied === 'boolean'
    && isNumber(value.grantedAccounts);
}

function isSuccessResponse(value: unknown): value is { success: true } {
  return isRecord(value) && value.success === true;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const candidate = payload as { message?: unknown; error?: { message?: unknown; code?: unknown }; code?: unknown };
  if (typeof candidate.message === 'string') return candidate.message;
  if (typeof candidate.error?.message === 'string') return candidate.error.message;
  return fallback;
}

function errorCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as { error?: { code?: unknown }; code?: unknown };
  const value = candidate.error?.code ?? candidate.code;
  return typeof value === 'string' ? value : null;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal ?? undefined;
  const timeoutReason = new Error('Admin API request timed out');
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = globalThis.setTimeout(() => controller.abort(timeoutReason), requestTimeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.reason === timeoutReason) {
      throw new ApiError('Сервер не ответил вовремя. Повторите запрос.', 504, 'REQUEST_TIMEOUT');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function parseResponse<T>(response: Response, guard: ResponseGuard<T>): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload, `Запрос завершился с кодом ${response.status}`),
      response.status,
      errorCode(payload),
    );
  }

  if (!guard(payload)) {
    throw new ApiError('Сервер вернул ответ в неожиданном формате.', 502, 'INVALID_RESPONSE');
  }
  return payload;
}

export function readSession(): AdminSession | null {
  try {
    const value = sessionStorage.getItem(sessionKey);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<AdminSession>;
    if (typeof session.token !== 'string' || typeof session.expiresAt !== 'string') return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(sessionKey);
      return null;
    }
    return { token: session.token, expiresAt: session.expiresAt };
  } catch {
    sessionStorage.removeItem(sessionKey);
    return null;
  }
}

export function saveSession(session: AdminSession) {
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(sessionKey);
}

export async function createSession(key: string, signal?: AbortSignal) {
  const response = await fetchWithTimeout('/v1/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
    signal,
  });
  return parseResponse(response, isSessionResponse);
}

async function request<T>(
  token: string,
  path: string,
  guard: ResponseGuard<T>,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetchWithTimeout(`/v1/admin${path}`, { ...init, headers });
  return parseResponse(response, guard);
}

async function publicRequest<T>(path: string, guard: ResponseGuard<T>, init: RequestInit = {}) {
  const response = await fetchWithTimeout(path, init);
  return parseResponse(response, guard);
}

function queryString(values: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : '';
}

export const adminApi = {
  overview: (token: string, days: 7 | 30, signal?: AbortSignal) =>
    request(token, `/overview?days=${days}`, isOverviewResponse, { signal }),
  users: (token: string, query: AdminUsersQuery, signal?: AbortSignal) =>
    request(token, `/users${queryString(query)}`, isUsersResponse, { signal }),
  analyses: (token: string, query: AdminAnalysesQuery, signal?: AbortSignal) =>
    request(token, `/analyses${queryString(query)}`, isAnalysesResponse, { signal }),
  analysis: async (token: string, analysisId: string, signal?: AbortSignal) => {
    const payload = await request(
      token,
      `/analyses/${encodeURIComponent(analysisId)}`,
      isAnalysisDetailResponse,
      { signal },
    );
    return payload.analysis;
  },
  diagnosticSessions: (token: string, query: AdminDiagnosticSessionsQuery, signal?: AbortSignal) =>
    request(token, `/diagnostics/sessions${queryString(query)}`, isDiagnosticSessionsResponse, { signal }),
  diagnosticSession: (token: string, sessionId: string, query: AdminDiagnosticSessionQuery, signal?: AbortSignal) =>
    request(token, `/diagnostics/sessions/${encodeURIComponent(sessionId)}${queryString(query)}`, isDiagnosticSessionResponse, { signal }),
  heroCatalog: (signal?: AbortSignal) =>
    publicRequest('/v1/heroes', isHeroCatalogResponse, { signal }),
  reviews: (token: string, query: AdminReviewsQuery, signal?: AbortSignal) =>
    request(token, `/reviews${queryString(query)}`, isReviewsResponse, { signal }),
  meta: (token: string, rank: RankBracket | null, signal?: AbortSignal) =>
    request(token, `/meta${queryString({ rank: rank ?? undefined })}`, isMetaResponse, { signal }),
  system: (token: string, signal?: AbortSignal) =>
    request(token, '/system', isSystemResponse, { signal }),
  deleteReview: (token: string, reviewId: string) =>
    request(token, `/reviews/${encodeURIComponent(reviewId)}`, isSuccessResponse, { method: 'DELETE' }),
  grantProAll: (token: string) =>
    request(token, '/grants/pro-all', isGrantResponse, {
      method: 'POST',
      body: JSON.stringify({ confirm: 'GRANT_PRO_ALL' }),
    }),
};
