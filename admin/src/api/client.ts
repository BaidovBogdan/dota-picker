import type {
  AdminAnalysesResponse,
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

async function parseResponse<T>(response: Response): Promise<T> {
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

  return payload as T;
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
  const response = await fetch('/v1/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
    signal,
  });
  return parseResponse<AdminSession>(response);
}

async function request<T>(token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`/v1/admin${path}`, { ...init, headers });
  return parseResponse<T>(response);
}

async function publicRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, init);
  return parseResponse<T>(response);
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
    request<AdminOverview>(token, `/overview?days=${days}`, { signal }),
  users: (token: string, query: AdminUsersQuery, signal?: AbortSignal) =>
    request<AdminUsersResponse>(token, `/users${queryString(query)}`, { signal }),
  analyses: (token: string, query: AdminAnalysesQuery, signal?: AbortSignal) =>
    request<AdminAnalysesResponse>(token, `/analyses${queryString(query)}`, { signal }),
  diagnosticSessions: (token: string, query: AdminDiagnosticSessionsQuery, signal?: AbortSignal) =>
    request<AdminDiagnosticSessionsResponse>(token, `/diagnostics/sessions${queryString(query)}`, { signal }),
  diagnosticSession: (token: string, sessionId: string, query: AdminDiagnosticSessionQuery, signal?: AbortSignal) =>
    request<AdminDiagnosticSessionResponse>(token, `/diagnostics/sessions/${encodeURIComponent(sessionId)}${queryString(query)}`, { signal }),
  heroCatalog: (signal?: AbortSignal) =>
    publicRequest<HeroCatalogResponse>('/v1/heroes', { signal }),
  reviews: (token: string, query: AdminReviewsQuery, signal?: AbortSignal) =>
    request<AdminReviewsResponse>(token, `/reviews${queryString(query)}`, { signal }),
  meta: (token: string, rank: RankBracket | null, signal?: AbortSignal) =>
    request<AdminMeta>(token, `/meta${queryString({ rank: rank ?? undefined })}`, { signal }),
  system: (token: string, signal?: AbortSignal) =>
    request<AdminSystem>(token, '/system', { signal }),
  deleteReview: (token: string, reviewId: string) =>
    request<{ success: true }>(token, `/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' }),
  grantProAll: (token: string) =>
    request<AdminGrantResult>(token, '/grants/pro-all', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'GRANT_PRO_ALL' }),
    }),
};
