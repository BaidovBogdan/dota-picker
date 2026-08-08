import type { StartupDiagnostic } from '../shared/contracts';
import { desktop } from './bridge';

export type StartupDiagnosticPhase = StartupDiagnostic['phase'];

const now = () => globalThis.performance?.now() ?? Date.now();

const report = (
  phase: StartupDiagnosticPhase,
  detail: string | undefined,
  durationMs: number,
  outcome: 'success' | 'error',
) => {
  try {
    void Promise.resolve(desktop.app.reportStartup({
      phase,
      ...(detail ? { detail } : {}),
      durationMs,
      outcome,
    })).catch(() => undefined);
  } catch {
    return;
  }
};

export async function measureStartup<T>(
  phase: StartupDiagnosticPhase,
  detail: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = now();
  try {
    const value = await operation();
    report(phase, detail, now() - startedAt, 'success');
    return value;
  } catch (error) {
    report(phase, detail, now() - startedAt, 'error');
    throw error;
  }
}
