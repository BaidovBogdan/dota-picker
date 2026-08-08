import { DesktopError } from './errors.js';

export function isRetryableAnalysisError(error: unknown): boolean {
  if (!(error instanceof DesktopError)) return false;
  if (error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR') return true;
  if (error.status === 429 && error.code === 'RATE_LIMITED') return false;
  return error.status === 408
    || error.status === 409
    || error.status === 425
    || error.status === 429
    || (error.status !== null && error.status >= 500);
}
