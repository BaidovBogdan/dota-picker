import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { z, type ZodType } from 'zod';

import { translate } from '@/i18n';
import { deleteCredential, getCredential, setCredential } from '@/services/credential-storage';

const configuredUrl = Constants.expoConfig?.extra?.apiUrl;
export const apiUrl =
  typeof configuredUrl === 'string' ? configuredUrl.replace(/\/$/, '') : 'http://localhost:4000/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(
    message: string,
    status = 0,
    code = 'NETWORK_ERROR',
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

type RequestOptions<T> = RequestInit & { timeoutMs?: number; schema?: ZodType<T> };

const apiErrorKeys: Record<string, string> = {
  AUTH_REQUIRED: 'errors.authRequired',
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  ACCOUNT_EXISTS: 'errors.accountExists',
  ACCOUNT_CONFLICT: 'errors.accountConflict',
  OTP_INVALID: 'errors.invalidOtp',
  OTP_EXPIRED: 'errors.expiredOtp',
  OTP_ATTEMPTS_EXHAUSTED: 'errors.otpAttemptsExhausted',
  RATE_LIMITED: 'errors.rateLimited',
  TOKEN_INVALID: 'errors.authRequired',
  TOKEN_REUSED: 'errors.authRequired',
  QUOTA_EXHAUSTED: 'errors.quotaExhausted',
  ANALYSIS_ALREADY_RESERVED: 'errors.requestInProgress',
  HERO_NOT_FOUND: 'errors.heroNotFound',
  INVALID_DRAFT: 'errors.invalidDraft',
  IDEMPOTENCY_REQUIRED: 'errors.requestInProgress',
  IDEMPOTENCY_KEY_REUSED: 'errors.requestInProgress',
  REQUEST_IN_PROGRESS: 'errors.requestInProgress',
  EXTERNAL_SERVICE_UNAVAILABLE: 'errors.externalService',
  IMAGE_RECOGNITION_FAILED: 'errors.imageRecognition',
  NOT_FOUND: 'errors.notFound',
  VALIDATION_ERROR: 'errors.validation',
  INTERNAL_ERROR: 'errors.internal',
};

const ACCESS_TOKEN_KEY = 'counterpick.access-token';
const REFRESH_TOKEN_KEY = 'counterpick.refresh-token';
const REFRESH_EXCLUDED_PATHS = new Set([
  '/auth/guest',
  '/auth/login',
  '/auth/logout',
  '/auth/otp/request',
  '/auth/password/reset',
  '/auth/refresh',
  '/auth/register',
]);

let authGeneration = 0;
let tokenOperationQueue: Promise<void> = Promise.resolve();

function enqueueTokenOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = tokenOperationQueue.then(operation, operation);
  tokenOperationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function beginAuthTransition() {
  authGeneration += 1;
  return authGeneration;
}

export const getAuthGeneration = () => authGeneration;

export const isAuthGenerationCurrent = (generation: number) => generation === authGeneration;

async function readToken(key: string, generation?: number) {
  return enqueueTokenOperation(async () => {
    if (generation !== undefined && !isAuthGenerationCurrent(generation)) return null;
    const token = await getCredential(key);
    if (generation !== undefined && !isAuthGenerationCurrent(generation)) return null;
    return token;
  });
}

export function saveTokensForGeneration(
  accessToken: string,
  refreshToken: string,
  generation: number,
) {
  return enqueueTokenOperation(async () => {
    if (!isAuthGenerationCurrent(generation)) return false;
    await Promise.all([
      setCredential(ACCESS_TOKEN_KEY, accessToken),
      setCredential(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    return isAuthGenerationCurrent(generation);
  });
}

export function clearTokensForGeneration(generation: number) {
  return enqueueTokenOperation(async () => {
    if (!isAuthGenerationCurrent(generation)) return false;
    await Promise.all([deleteCredential(ACCESS_TOKEN_KEY), deleteCredential(REFRESH_TOKEN_KEY)]);
    return true;
  });
}

export function takeRefreshTokenAndClear(generation: number) {
  if (!isAuthGenerationCurrent(generation)) return Promise.resolve(null);
  return enqueueTokenOperation(async () => {
    const refreshToken = await getCredential(REFRESH_TOKEN_KEY);
    await Promise.all([deleteCredential(ACCESS_TOKEN_KEY), deleteCredential(REFRESH_TOKEN_KEY)]);
    return refreshToken;
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; message?: string; code?: string; error?: { message?: string; code?: string } }
    | T
    | null;

  if (!response.ok) {
    const errorPayload = payload as {
      message?: string;
      code?: string;
      error?: { message?: string; code?: string; details?: unknown; requestId?: string };
    } | null;
    const code = errorPayload?.error?.code ?? errorPayload?.code ?? 'API_ERROR';
    const localizedMessage = apiErrorKeys[code]
      ? translate(apiErrorKeys[code])
      : translate('errors.server');
    throw new ApiError(
      localizedMessage,
      response.status,
      code,
      errorPayload?.error?.details,
      errorPayload?.error?.requestId,
    );
  }

  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data;
  }

  return payload as T;
}

async function readResponseErrorCode(response: Response) {
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as { code?: unknown; error?: { code?: unknown } } | null;
  const code = payload?.error?.code ?? payload?.code;
  return typeof code === 'string' ? code : null;
}

function validatePayload<T>(payload: unknown, schema: ZodType<T>) {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw new ApiError(
    translate('errors.incompatibleResponse'),
    502,
    'API_CONTRACT_ERROR',
    result.error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.join('.'),
    })),
  );
}

const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
});

let refreshState: { generation: number; promise: Promise<string | null> } | null = null;

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;
  if (externalSignal?.aborted) {
    throw new ApiError(translate('errors.cancelled'), 0, 'REQUEST_CANCELLED');
  }
  let rejectInterruption: (error: ApiError) => void = () => {};
  const interruption = new Promise<never>((_, reject) => {
    rejectInterruption = reject;
  });
  const abortFromCaller = () => {
    controller.abort();
    rejectInterruption(new ApiError(translate('errors.cancelled'), 0, 'REQUEST_CANCELLED'));
  };
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectInterruption(new ApiError(translate('errors.timeout'), 0, 'TIMEOUT'));
  }, timeoutMs);

  try {
    return await Promise.race([
      expoFetch(input, { ...init, signal: controller.signal }),
      interruption,
    ]);
  } catch (error) {
    if (timedOut) throw new ApiError(translate('errors.timeout'), 0, 'TIMEOUT');
    if (externalSignal?.aborted)
      throw new ApiError(translate('errors.cancelled'), 0, 'REQUEST_CANCELLED');
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function performRefresh(generation: number) {
  const refreshToken = await readToken(REFRESH_TOKEN_KEY, generation);
  if (!refreshToken) return null;
  const response = await fetchWithTimeout(
    `${apiUrl}/auth/refresh`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    },
    8_000,
  );
  const payload = validatePayload(await parseResponse<unknown>(response), refreshResponseSchema);
  const saved = await saveTokensForGeneration(
    payload.accessToken,
    payload.refreshToken ?? refreshToken,
    generation,
  );
  return saved ? payload.accessToken : null;
}

async function refreshAccessToken(generation: number) {
  if (!isAuthGenerationCurrent(generation)) return null;
  if (refreshState?.generation !== generation) {
    const promise = performRefresh(generation)
      .catch(async (error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await clearTokensForGeneration(generation);
          return null;
        }
        throw error;
      })
      .finally(() => {
        if (refreshState?.promise === promise) refreshState = null;
      });
    refreshState = { generation, promise };
  }
  return refreshState.promise;
}

export async function apiRequest<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const requestGeneration = authGeneration;
  const { timeoutMs = 10_000, signal, schema, ...requestOptions } = options;
  const token = await readToken(ACCESS_TOKEN_KEY, requestGeneration);

  try {
    const request = (accessToken: string | null) =>
      fetchWithTimeout(
        `${apiUrl}${path}`,
        {
          ...requestOptions,
          ...(signal ? { signal } : {}),
          headers: {
            Accept: 'application/json',
            ...(requestOptions.body != null && !(requestOptions.body instanceof FormData)
              ? { 'Content-Type': 'application/json' }
              : {}),
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...requestOptions.headers,
          },
        },
        timeoutMs,
      );
    let response = await request(token);
    const routePath = path.split('?')[0] ?? path;
    if (
      response.status === 401 &&
      !REFRESH_EXCLUDED_PATHS.has(routePath) &&
      isAuthGenerationCurrent(requestGeneration)
    ) {
      const responseCode = await readResponseErrorCode(response);
      if (
        responseCode === null ||
        responseCode === 'TOKEN_INVALID' ||
        responseCode === 'AUTH_REQUIRED'
      ) {
        const refreshedToken = await refreshAccessToken(requestGeneration);
        if (signal?.aborted)
          throw new ApiError(translate('errors.cancelled'), 0, 'REQUEST_CANCELLED');
        if (refreshedToken) response = await request(refreshedToken);
      }
    }
    const payload = await parseResponse<unknown>(response);
    return schema ? validatePayload(payload, schema) : (payload as T);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(translate('errors.network'), 0, 'NETWORK_ERROR');
  }
}

export const hasAuthCredentials = async () =>
  Boolean((await readToken(ACCESS_TOKEN_KEY)) ?? (await readToken(REFRESH_TOKEN_KEY)));
