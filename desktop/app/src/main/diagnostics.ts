import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Preferences } from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import { DesktopError } from './errors.js';

export const diagnosticsConsentVersion = 1 as const;
const diagnosticsRetentionMs = 30 * 24 * 60 * 60 * 1_000;
const diagnosticsSessionMaximumMs = 24 * 60 * 60 * 1_000;
const diagnosticsQueueLimit = 500;
const diagnosticsBatchLimit = 20;
const defaultFlushIntervalMs = 5_000;
const defaultRetryBaseMs = 5_000;
const defaultRetryMaximumMs = 5 * 60_000;
const defaultShutdownFlushTimeoutMs = 250;
const diagnosticsHeartbeatMs = 60_000;

const eventBase = {
  id: z.string().uuid(),
  sequence: z.number().int().min(1).max(100_000),
  createdAt: z.string().datetime(),
  durationMs: z.number().int().min(0).max(120_000).nullable().default(null),
};

const waitingReasonSchema = z.enum([
  'not_dota_draft',
  'image_unclear',
  'uncertain_picks',
  'insufficient_enemy_picks',
  'no_enemy_picks',
]);

const modeSchema = z.enum(['vision', 'overwolf']);
const stageSchema = z.enum(['app', 'draft', 'capture', 'request', 'recognition', 'overlay', 'engine']);
const recognitionSlotSchema = z.object({
  slot: z.number().int().min(0).max(4),
  side: z.enum(['ally', 'enemy', 'unknown']),
  visualGroup: z.enum(['left', 'right']).nullable(),
  heroId: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  needsReview: z.boolean(),
}).strict();

export const diagnosticEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal('app_started'),
    status: z.literal('info'),
    stage: z.literal('app'),
    details: z.object({ consentVersion: z.literal(diagnosticsConsentVersion) }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('mode_changed'),
    status: z.literal('info'),
    stage: z.literal('app'),
    details: z.object({ mode: modeSchema }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('draft_started'),
    status: z.literal('info'),
    stage: z.literal('draft'),
    details: z.object({ draftSessionId: z.string().uuid() }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('capture_decision'),
    status: z.enum(['info', 'warning']),
    stage: z.literal('capture'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      distance: z.number().int().nonnegative().max(10_000).nullable(),
      decision: z.enum(['no_window', 'unchanged', 'changed', 'forced', 'retry']),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('request_started'),
    status: z.literal('info'),
    stage: z.literal('request'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      operation: z.enum(['create', 'revise']),
      attempt: z.number().int().min(1).max(20),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('request_completed'),
    status: z.enum(['success', 'warning', 'error']),
    stage: z.literal('request'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      outcome: z.enum(['waiting', 'completed', 'stale', 'error']),
      waitingReason: waitingReasonSchema.optional(),
      latencyMs: z.number().int().min(0).max(120_000),
      analysisId: z.string().uuid().optional(),
      recommendationHeroIds: z.array(z.number().int().positive()).max(3).optional(),
      errorCode: z.string().trim().regex(/^[A-Z0-9_]{2,64}$/).optional(),
      recoverable: z.boolean().optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('recognition_result'),
    status: z.enum(['success', 'warning']),
    stage: z.literal('recognition'),
    details: z.object({
      revision: z.number().int().nonnegative().max(10_000),
      quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
      model: z.string().trim().min(1).max(80).nullable(),
      recognizedCount: z.number().int().min(0).max(10),
      needsReviewCount: z.number().int().min(0).max(10),
      slots: z.array(recognitionSlotSchema).max(10),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('overlay_state'),
    status: z.enum(['info', 'success', 'warning', 'error']),
    stage: z.literal('overlay'),
    details: z.object({
      phase: z.enum([
        'off',
        'starting',
        'waiting_for_dota',
        'watching_draft',
        'recognizing',
        'analyzing',
        'ready',
        'quota',
        'error',
      ]),
      pickCount: z.number().int().min(0).max(10),
      draftActive: z.boolean(),
      visibleSlots: z.array(z.object({
        slot: z.number().int().min(0).max(4),
        side: z.enum(['ally', 'enemy']),
        heroId: z.number().int().positive(),
      }).strict()).max(10),
      orientationRequired: z.boolean(),
      orientationSource: z.enum([
        'gsi_player_hero',
        'manual_confirmation',
        'overwolf',
      ]).nullable(),
      allyGroup: z.enum(['left', 'right']).nullable(),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('engine_error'),
    status: z.literal('error'),
    stage: z.literal('engine'),
    details: z.object({
      code: z.string().trim().regex(/^[A-Z0-9_]{2,64}$/),
      recoverable: z.boolean(),
      stage: stageSchema,
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('draft_ended'),
    status: z.enum(['info', 'success', 'error']),
    stage: z.literal('draft'),
    details: z.object({
      reason: z.enum(['completed', 'left_draft', 'assistant_disabled', 'mode_changed', 'error']),
    }).strict(),
  }).strict(),
  z.object({
    ...eventBase,
    type: z.literal('app_stopped'),
    status: z.enum(['info', 'error']),
    stage: z.literal('app'),
    details: z.object({
      reason: z.enum(['quit', 'update', 'crash', 'rollover', 'mode_changed']),
    }).strict(),
  }).strict(),
]);

const diagnosticSessionSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(['win32', 'darwin', 'linux']),
  appVersion: z.string().trim().min(1).max(32),
  appBuild: z.string().trim().min(1).max(64),
  mode: modeSchema,
  startedAt: z.string().datetime(),
  consentVersion: z.literal(diagnosticsConsentVersion),
}).strict();

const queuedDiagnosticSchema = z.object({
  session: diagnosticSessionSchema,
  event: diagnosticEventSchema,
}).strict();
const diagnosticsQueueSchema = z.array(queuedDiagnosticSchema).max(diagnosticsQueueLimit);
const diagnosticsStateSchema = z.object({
  ownerAccountId: z.string().uuid().nullable().default(null),
  activeSession: diagnosticSessionSchema.nullable(),
  lastActivityAt: z.string().datetime().nullable().default(null),
  sequence: z.number().int().min(0).max(100_000),
  queue: diagnosticsQueueSchema,
}).strict();

export type DiagnosticEvent = z.infer<typeof diagnosticEventSchema>;
type WithoutEventIdentity<T> = T extends unknown
  ? Omit<T, 'id' | 'sequence' | 'createdAt'>
  : never;
export type DiagnosticEventDraft = WithoutEventIdentity<DiagnosticEvent>;
export type DiagnosticBatch = {
  session: z.infer<typeof diagnosticSessionSchema>;
  events: DiagnosticEvent[];
};

export function safeDiagnosticErrorCode(error: unknown, fallback = 'UNEXPECTED_ERROR'): string {
  const candidate = error instanceof DesktopError ? error.code : fallback;
  return /^[A-Z0-9_]{2,64}$/.test(candidate) ? candidate : fallback;
}

type ReporterLogger = {
  info: (message: string, details?: Record<string, unknown>) => void;
  warn: (message: string, details?: Record<string, unknown>) => void;
};

type DiagnosticsApi = Pick<
  ApiClient,
  'isAuthenticated' | 'getAuthenticatedAccountId' | 'uploadDiagnostics'
>;

type DiagnosticsReporterOptions = {
  api: DiagnosticsApi;
  queuePath: string;
  appVersion: string;
  appBuild: string;
  platform: 'win32' | 'darwin' | 'linux';
  logger: ReporterLogger;
  flushIntervalMs?: number;
  retryBaseMs?: number;
  retryMaximumMs?: number;
  shutdownFlushTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  now?: () => Date;
};

export class DiagnosticsReporter {
  private queue: z.infer<typeof diagnosticsQueueSchema> = [];
  private session: z.infer<typeof diagnosticSessionSchema>;
  private ownerAccountId: string | null = null;
  private persistedState: z.infer<typeof diagnosticsStateSchema> | null = null;
  private lastActivityAt: string | null = null;
  private sequence = 0;
  private consentAccepted = false;
  private started = false;
  private disposed = false;
  private retryAttempt = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private flushPromise: Promise<void> | null = null;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private identityQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly options: DiagnosticsReporterOptions) {
    this.session = this.createSession('vision');
  }

  public async start(preferences: Preferences): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.consentAccepted = preferences.diagnosticsConsent.accepted
      && preferences.diagnosticsConsent.version === diagnosticsConsentVersion;
    const now = this.now();
    this.persistedState = this.consentAccepted ? await this.loadState() : null;
    this.queue = [];
    this.session = this.createSession(preferences.assistantMode, now);
    this.sequence = 0;
    if (!this.consentAccepted) await this.persist();
    this.record({
      type: 'app_started',
      status: 'info',
      stage: 'app',
      durationMs: null,
      details: { consentVersion: diagnosticsConsentVersion },
    });
    const accountId = this.options.api.getAuthenticatedAccountId();
    if (accountId) await this.applyAuthenticatedAccount(accountId);
  }

  public applyAuthenticatedAccount(accountId: string | null): Promise<void> {
    const operation = this.identityQueue.then(() => this.switchAuthenticatedAccount(accountId));
    this.identityQueue = operation.catch(() => undefined);
    return operation.catch(() => undefined);
  }

  public async applyPreferences(previous: Preferences, current: Preferences): Promise<void> {
    const wasAccepted = previous.diagnosticsConsent.accepted
      && previous.diagnosticsConsent.version === diagnosticsConsentVersion;
    const isAccepted = current.diagnosticsConsent.accepted
      && current.diagnosticsConsent.version === diagnosticsConsentVersion;
    let openedSession = false;
    if (!wasAccepted && isAccepted) {
      this.consentAccepted = true;
      this.session = this.createSession(current.assistantMode);
      this.sequence = 0;
      openedSession = true;
      this.record({
        type: 'app_started',
        status: 'info',
        stage: 'app',
        durationMs: null,
        details: { consentVersion: diagnosticsConsentVersion },
      });
      const accountId = this.options.api.getAuthenticatedAccountId();
      if (accountId) await this.applyAuthenticatedAccount(accountId);
    } else if (wasAccepted && !isAccepted) {
      this.consentAccepted = false;
      this.ownerAccountId = null;
      this.persistedState = null;
      this.lastActivityAt = null;
      this.queue = [];
      this.retryAttempt = 0;
      this.cancelFlush();
      this.cancelHeartbeat();
      await this.persist();
      try {
        this.options.logger.info('Remote diagnostics consent revoked');
      } catch {
      }
    }
    if (previous.assistantMode !== current.assistantMode) {
      try {
        const now = this.now();
        let queueChanged = this.appendEvent({
          type: 'mode_changed',
          status: 'info',
          stage: 'app',
          durationMs: null,
          details: { mode: current.assistantMode },
        }, now);
        if (!openedSession) {
          queueChanged = this.rotateSession(current.assistantMode, 'mode_changed', now) || queueChanged;
        }
        this.finalizeQueueMutation(queueChanged);
      } catch {
        return;
      }
    }
  }

  public record(draft: DiagnosticEventDraft): void {
    try {
      const now = this.now();
      let queueChanged = false;
      if (
        this.sequence >= 99_999
        || now.getTime() - new Date(this.session.startedAt).getTime() >= diagnosticsSessionMaximumMs
      ) {
        queueChanged = this.rotateSession(this.session.mode, 'rollover', now);
      }
      queueChanged = this.appendEvent(draft, now) || queueChanged;
      this.finalizeQueueMutation(queueChanged);
    } catch {
      return;
    }
  }

  private appendEvent(draft: DiagnosticEventDraft, now: Date): boolean {
    const parsed = diagnosticEventSchema.safeParse({
      ...draft,
      id: randomUUID(),
      sequence: ++this.sequence,
      createdAt: now.toISOString(),
    });
    if (!parsed.success) {
      this.options.logger.warn('Diagnostic event rejected', { code: 'DIAGNOSTIC_EVENT_INVALID' });
      return false;
    }
    const event = parsed.data;
    this.options.logger.info('Diagnostic event', {
      sessionId: this.session.id,
      mode: this.session.mode,
      event,
    });
    if (!this.consentAccepted || !this.ownerAccountId || this.disposed) return false;
    this.lastActivityAt = event.createdAt;
    this.queue.push({ session: { ...this.session }, event });
    return true;
  }

  private rotateSession(
    mode: Preferences['assistantMode'],
    reason: 'rollover' | 'mode_changed',
    now: Date,
  ): boolean {
    const sessionStartedAt = new Date(this.session.startedAt).getTime();
    const stoppedAt = reason === 'rollover'
      ? new Date(Math.min(now.getTime(), sessionStartedAt + diagnosticsSessionMaximumMs))
      : now;
    let queueChanged = this.appendEvent({
      type: 'app_stopped',
      status: 'info',
      stage: 'app',
      durationMs: null,
      details: { reason },
    }, stoppedAt);
    this.session = this.createSession(mode, now);
    this.sequence = 0;
    queueChanged = this.appendEvent({
      type: 'app_started',
      status: 'info',
      stage: 'app',
      durationMs: null,
      details: { consentVersion: diagnosticsConsentVersion },
    }, now) || queueChanged;
    return queueChanged;
  }

  private finalizeQueueMutation(queueChanged: boolean): void {
    if (!queueChanged) return;
    if (this.queue.length > diagnosticsQueueLimit) {
      this.queue.splice(0, this.queue.length - diagnosticsQueueLimit);
    }
    void this.persist();
    this.scheduleFlush(this.options.flushIntervalMs ?? defaultFlushIntervalMs);
  }

  public async flushNow(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.cancelFlush();
    if (
      !this.consentAccepted
      || !this.ownerAccountId
      || this.queue.length === 0
      || !this.options.api.isAuthenticated()
      || this.options.api.getAuthenticatedAccountId() !== this.ownerAccountId
    ) {
      if (!this.disposed && this.consentAccepted && this.ownerAccountId && this.queue.length > 0) {
        this.scheduleFlush(this.options.flushIntervalMs ?? defaultFlushIntervalMs);
      }
      return;
    }
    const sessionId = this.queue[0]?.session.id;
    if (!sessionId) return;
    const firstSession = this.queue[0]!.session;
    const records: z.infer<typeof diagnosticsQueueSchema> = [];
    for (const record of this.queue) {
      if (record.session.id !== sessionId || record.session.mode !== firstSession.mode) break;
      records.push(record);
      if (records.length === diagnosticsBatchLimit) break;
    }
    const eventIds = new Set(records.map((record) => record.event.id));
    const batch = {
      session: records[0]!.session,
      events: records.map((record) => record.event),
    };
    this.flushPromise = this.options.api.uploadDiagnostics(batch)
      .then(async () => {
        this.queue = this.queue.filter((record) => !eventIds.has(record.event.id));
        this.retryAttempt = 0;
        await this.persist();
        if (!this.disposed && this.queue.length > 0) this.scheduleFlush(0);
      })
      .catch(async (error: unknown) => {
        const sessionInvalid = error instanceof DesktopError
          && (
            error.code === 'DIAGNOSTIC_SESSION_CONFLICT'
            || error.code === 'DIAGNOSTIC_SESSION_EXPIRED'
          );
        const quotaExceeded = error instanceof DesktopError
          && error.code === 'DIAGNOSTIC_QUOTA_EXCEEDED';
        const unrecoverable = !quotaExceeded && (error instanceof DesktopError
          && typeof error.status === 'number'
          && [400, 409, 413, 422].includes(error.status));
        this.options.logger.warn('Diagnostic upload failed', {
          code: error instanceof DesktopError ? error.code : 'DIAGNOSTIC_UPLOAD_FAILED',
          recoverable: !unrecoverable,
        });
        if (unrecoverable) {
          this.queue = this.queue.filter((record) => (
            sessionInvalid
              ? record.session.id !== sessionId
              : !eventIds.has(record.event.id)
          ));
          if (
            sessionInvalid
            && this.session.id === sessionId
            && !this.disposed
            && this.consentAccepted
          ) {
            const now = this.now();
            this.session = this.createSession(firstSession.mode, now);
            this.sequence = 0;
            this.appendEvent({
              type: 'app_started',
              status: 'info',
              stage: 'app',
              durationMs: null,
              details: { consentVersion: diagnosticsConsentVersion },
            }, now);
          }
          this.retryAttempt = 0;
          await this.persist();
        } else {
          this.retryAttempt += 1;
        }
        if (!this.disposed && this.queue.length > 0) {
          this.scheduleFlush(quotaExceeded ? 60 * 60 * 1_000 : unrecoverable ? 0 : this.retryDelay());
        }
      })
      .finally(() => {
        this.flushPromise = null;
      });
    return this.flushPromise;
  }

  public async dispose(reason: 'quit' | 'update' | 'crash' = 'quit'): Promise<void> {
    if (this.disposed) return;
    this.record({
      type: 'app_stopped',
      status: reason === 'crash' ? 'error' : 'info',
      stage: 'app',
      durationMs: null,
      details: { reason },
    });
    this.disposed = true;
    this.cancelFlush();
    this.cancelHeartbeat();
    if (!this.ownerAccountId && this.persistedState) return;
    await this.persist();
    if (
      this.consentAccepted
      && this.ownerAccountId
      && this.queue.length > 0
      && this.options.api.isAuthenticated()
      && this.options.api.getAuthenticatedAccountId() === this.ownerAccountId
    ) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(
          resolve,
          this.options.shutdownFlushTimeoutMs ?? defaultShutdownFlushTimeoutMs,
        );
        void this.flushNow().finally(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }

  private createSession(mode: Preferences['assistantMode'], startedAt = this.now()) {
    return diagnosticSessionSchema.parse({
      id: randomUUID(),
      platform: this.options.platform,
      appVersion: this.options.appVersion,
      appBuild: this.options.appBuild,
      mode,
      startedAt: startedAt.toISOString(),
      consentVersion: diagnosticsConsentVersion,
    });
  }

  private async loadState() {
    try {
      const input: unknown = JSON.parse(await fs.readFile(this.options.queuePath, 'utf8'));
      const parsed = Array.isArray(input)
        ? {
          ownerAccountId: null,
          activeSession: null,
          lastActivityAt: null,
          sequence: 0,
          queue: diagnosticsQueueSchema.parse(input),
        }
        : diagnosticsStateSchema.parse(input);
      const earliest = this.now().getTime() - diagnosticsRetentionMs;
      return {
        ownerAccountId: parsed.ownerAccountId,
        activeSession: parsed.activeSession
          && new Date(parsed.activeSession.startedAt).getTime() >= earliest
          ? parsed.activeSession
          : null,
        lastActivityAt: parsed.lastActivityAt,
        sequence: parsed.sequence,
        queue: parsed.queue.filter((record) => new Date(record.event.createdAt).getTime() >= earliest),
      };
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        try {
          this.options.logger.warn('Diagnostic queue load failed', {
            code: 'DIAGNOSTIC_QUEUE_LOAD_FAILED',
            recoverable: true,
          });
        } catch {
        }
      }
      return null;
    }
  }

  private persist(): Promise<void> {
    const snapshot = structuredClone({
      ownerAccountId: this.consentAccepted ? this.ownerAccountId : null,
      activeSession: this.consentAccepted && this.ownerAccountId && !this.disposed
        ? this.session
        : null,
      lastActivityAt: this.consentAccepted && this.ownerAccountId
        ? this.lastActivityAt
        : null,
      sequence: this.consentAccepted && this.ownerAccountId && !this.disposed ? this.sequence : 0,
      queue: this.queue,
    });
    const operation = this.persistenceQueue.then(async () => {
      if (!snapshot.ownerAccountId && !snapshot.activeSession && snapshot.queue.length === 0) {
        await fs.rm(this.options.queuePath, { force: true });
        return;
      }
      const temporaryPath = `${this.options.queuePath}.${process.pid}.tmp`;
      await fs.mkdir(dirname(this.options.queuePath), { recursive: true });
      await fs.writeFile(temporaryPath, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryPath, this.options.queuePath);
    });
    const handled = operation.catch(() => {
      try {
        this.options.logger.warn('Diagnostic queue persistence failed', {
          code: 'DIAGNOSTIC_QUEUE_PERSIST_FAILED',
          recoverable: true,
        });
      } catch {
      }
    });
    this.persistenceQueue = handled;
    return handled;
  }

  private recoverInterruptedSession(
    session: z.infer<typeof diagnosticSessionSchema>,
    persistedSequence: number,
    lastActivityAt: string | null,
    now: Date,
  ): void {
    const queuedSessionEvents = this.queue.filter((record) => record.session.id === session.id);
    if (queuedSessionEvents.some((record) => record.event.type === 'app_stopped')) return;
    const sequence = Math.max(
      persistedSequence,
      ...queuedSessionEvents.map((record) => record.event.sequence),
    );
    if (sequence >= 100_000) return;
    const latestQueuedAt = queuedSessionEvents.reduce(
      (latest, record) => Math.max(latest, new Date(record.event.createdAt).getTime()),
      new Date(session.startedAt).getTime(),
    );
    const persistedActivityAt = lastActivityAt
      ? new Date(lastActivityAt).getTime()
      : latestQueuedAt;
    const crashAt = new Date(Math.min(now.getTime(), Math.max(latestQueuedAt, persistedActivityAt)));
    const parsed = diagnosticEventSchema.safeParse({
      id: randomUUID(),
      sequence: sequence + 1,
      createdAt: crashAt.toISOString(),
      durationMs: null,
      type: 'app_stopped',
      status: 'error',
      stage: 'app',
      details: { reason: 'crash' },
    });
    if (!parsed.success) return;
    this.options.logger.info('Recovered interrupted diagnostic session', {
      sessionId: session.id,
      mode: session.mode,
      event: parsed.data,
    });
    this.queue.push({ session, event: parsed.data });
  }

  private async switchAuthenticatedAccount(accountId: string | null): Promise<void> {
    if (!this.started || this.disposed || accountId === this.ownerAccountId) return;
    this.cancelFlush();
    this.cancelHeartbeat();
    this.retryAttempt = 0;
    this.queue = [];
    if (!accountId || !this.consentAccepted) {
      this.ownerAccountId = null;
      this.persistedState = null;
      this.lastActivityAt = null;
      await this.persist();
      return;
    }
    const now = this.now();
    const persisted = this.persistedState?.ownerAccountId === accountId
      ? this.persistedState
      : null;
    this.ownerAccountId = accountId;
    this.queue = persisted?.queue ?? [];
    if (persisted?.activeSession) {
      this.recoverInterruptedSession(
        persisted.activeSession,
        persisted.sequence,
        persisted.lastActivityAt,
        now,
      );
    }
    this.persistedState = null;
    this.session = this.createSession(this.session.mode, now);
    this.sequence = 0;
    this.lastActivityAt = null;
    const queueChanged = this.appendEvent({
      type: 'app_started',
      status: 'info',
      stage: 'app',
      durationMs: null,
      details: { consentVersion: diagnosticsConsentVersion },
    }, now);
    this.finalizeQueueMutation(queueChanged);
    this.scheduleHeartbeat();
  }

  private scheduleHeartbeat(): void {
    if (this.heartbeatTimer || !this.ownerAccountId || this.disposed) return;
    this.heartbeatTimer = setInterval(() => {
      try {
        if (!this.ownerAccountId || this.disposed) return;
        const now = this.now();
        if (
          now.getTime() - new Date(this.session.startedAt).getTime()
          >= diagnosticsSessionMaximumMs
        ) {
          this.finalizeQueueMutation(this.rotateSession(this.session.mode, 'rollover', now));
          return;
        }
        this.lastActivityAt = now.toISOString();
        void this.persist();
      } catch {
        try {
          this.options.logger.warn('Diagnostic heartbeat failed', {
            code: 'DIAGNOSTIC_HEARTBEAT_FAILED',
            recoverable: true,
          });
        } catch {
        }
      }
    }, this.options.heartbeatIntervalMs ?? diagnosticsHeartbeatMs);
    this.heartbeatTimer.unref?.();
  }

  private cancelHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer || this.disposed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushNow();
    }, delay);
    this.flushTimer.unref?.();
  }

  private cancelFlush(): void {
    if (!this.flushTimer) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private retryDelay(): number {
    const base = this.options.retryBaseMs ?? defaultRetryBaseMs;
    const maximum = this.options.retryMaximumMs ?? defaultRetryMaximumMs;
    return Math.min(maximum, base * 2 ** Math.min(this.retryAttempt - 1, 8));
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}
