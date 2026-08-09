import { join } from 'node:path';
import log from 'electron-log/main';

type Logger = {
  info: (message: string, details?: unknown) => void;
  warn: (message: string, details?: unknown) => void;
  error: (message: string, details?: unknown) => void;
};

const noOpLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export const desktopLogMaxSizeBytes = 5 * 1024 * 1024;

export function isAutomatedTestRuntime(environment: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    environment.NODE_TEST_CONTEXT
    || environment.VITEST
    || environment.COUNTERPICK_E2E === '1'
    || environment.COUNTERPICK_OVERLAY_PREVIEW === '1'
  );
}

export function desktopLogFileName(isPackaged: boolean, automated: boolean) {
  if (automated) return 'test.log';
  return isPackaged ? 'main.log' : 'development.log';
}

export function configureDesktopLogging(
  userData: string,
  isPackaged: boolean,
  automated = isAutomatedTestRuntime(),
): void {
  log.initialize({ spyRendererConsole: false });
  log.transports.file.maxSize = desktopLogMaxSizeBytes;
  const fileName = desktopLogFileName(isPackaged, automated);
  log.transports.file.resolvePathFn = () => join(userData, 'logs', fileName);
}

export function scopedDesktopLogger(scope: string): Logger {
  if (isAutomatedTestRuntime()) return noOpLogger;
  return log.scope(scope);
}
