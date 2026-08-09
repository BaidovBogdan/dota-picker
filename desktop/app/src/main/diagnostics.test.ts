import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { Preferences } from '../shared/contracts.js';
import {
  DiagnosticsReporter,
  safeDiagnosticErrorCode,
  type DiagnosticBatch,
} from './diagnostics.js';
import { DesktopError } from './errors.js';

const temporaryDirectories: string[] = [];
const accountId = '11111111-1111-4111-8111-111111111111';

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

function preferences(accepted: boolean): Preferences {
  return {
    theme: 'system',
    language: 'en',
    position: 3,
    rank: null,
    startWithWindows: false,
    minimizeToTray: true,
    overlayShortcut: 'PageUp',
    wishlist: [],
    assistantEnabled: true,
    assistantMode: 'vision',
    captureConsent: { accepted: true, acceptedAt: '2026-08-09T10:00:00.000Z' },
    overwolfConsent: { accepted: false, acceptedAt: null },
    diagnosticsConsent: accepted
      ? { accepted: true, acceptedAt: '2026-08-09T10:00:00.000Z', version: 1 }
      : { accepted: false, acceptedAt: null, version: null },
  };
}

function overlayDetails(phase: 'watching_draft' | 'ready', pickCount: number) {
  return {
    phase,
    pickCount,
    draftActive: true,
    visibleSlots: [],
    orientationRequired: false,
    orientationSource: 'gsi_player_hero' as const,
    allyGroup: 'left' as const,
  };
}

async function harness(
  upload: (batch: DiagnosticBatch) => Promise<unknown>,
  now: () => Date = () => new Date('2026-08-09T10:00:00.000Z'),
  existingQueuePath?: string,
  authenticatedAccount: () => string | null = () => accountId,
  heartbeatIntervalMs?: number,
  loggerOverride?: {
    info: (message: string, details?: Record<string, unknown>) => void;
    warn: (message: string, details?: Record<string, unknown>) => void;
  },
) {
  const directory = existingQueuePath
    ? join(existingQueuePath, '..')
    : await mkdtemp(join(tmpdir(), 'counterpick-diagnostics-'));
  if (!existingQueuePath) temporaryDirectories.push(directory);
  const queuePath = existingQueuePath ?? join(directory, 'queue.json');
  const batches: DiagnosticBatch[] = [];
  const logs: Array<Record<string, unknown> | undefined> = [];
  const reporter = new DiagnosticsReporter({
    api: {
      isAuthenticated: () => authenticatedAccount() !== null,
      getAuthenticatedAccountId: authenticatedAccount,
      uploadDiagnostics: async (batch) => {
        batches.push(batch);
        await upload(batch);
        return {
          accepted: batch.events.length,
          duplicate: 0,
          retainedUntil: '2026-09-08T10:00:00.000Z',
        };
      },
    },
    queuePath,
    appVersion: '0.1.12',
    appBuild: '0.1.12+test',
    platform: 'win32',
    logger: loggerOverride ?? {
      info: (_message, details) => logs.push(details),
      warn: (_message, details) => logs.push(details),
    },
    flushIntervalMs: 60_000,
    retryBaseMs: 1,
    retryMaximumMs: 2,
    shutdownFlushTimeoutMs: 5,
    heartbeatIntervalMs,
    now,
  });
  return { reporter, batches, logs, queuePath };
}

describe('remote diagnostics reporter', () => {
  it('normalizes arbitrary remote error codes to the bounded safe format', () => {
    assert.equal(safeDiagnosticErrorCode(new DesktopError('NETWORK_ERROR', 'offline')), 'NETWORK_ERROR');
    assert.equal(safeDiagnosticErrorCode(new DesktopError('private.error/value', 'offline')), 'UNEXPECTED_ERROR');
  });

  it('keeps local events but uploads nothing without explicit consent', async () => {
    const { reporter, batches, logs, queuePath } = await harness(async () => undefined);
    await reporter.start(preferences(false));
    reporter.record({
      type: 'overlay_state',
      status: 'info',
      stage: 'overlay',
      durationMs: null,
      details: overlayDetails('watching_draft', 0),
    });
    await reporter.flushNow();

    assert.equal(batches.length, 0);
    assert.equal(logs.length, 2);
    await assert.rejects(readFile(queuePath, 'utf8'));
  });

  it('uploads a bounded strict batch without forbidden user or image fields', async () => {
    const { reporter, batches } = await harness(async () => undefined);
    await reporter.start(preferences(true));
    reporter.record({
      type: 'recognition_result',
      status: 'success',
      stage: 'recognition',
      durationMs: 820,
      details: {
        revision: 2,
        quality: 'clear',
        model: 'portrait-index-v3',
        recognizedCount: 1,
        needsReviewCount: 0,
        slots: [{
          slot: 0,
          side: 'enemy',
          visualGroup: 'right',
          heroId: 14,
          confidence: 0.98,
          needsReview: false,
        }],
      },
    });
    await reporter.flushNow();

    assert.equal(batches.length, 1);
    assert.equal(batches[0]?.events.length, 2);
    const serialized = JSON.stringify(batches[0]);
    for (const forbidden of ['screenshot', 'playerName', 'steamId', 'token', 'rawGsi', 'image']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it('retries recoverable failures and preserves event identity for idempotency', async () => {
    let attempts = 0;
    const { reporter, batches } = await harness(async () => {
      attempts += 1;
      if (attempts === 1) throw new DesktopError('NETWORK_ERROR', 'offline');
    });
    await reporter.start(preferences(true));
    await reporter.flushNow();
    const firstEventId = batches[0]?.events[0]?.id;
    await reporter.flushNow();

    assert.equal(attempts, 2);
    assert.equal(batches[1]?.events[0]?.id, firstEventId);
  });

  it('drops only the rejected batch for a non-session timestamp error', async () => {
    let attempts = 0;
    const { reporter, batches } = await harness(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new DesktopError(
          'DIAGNOSTIC_TIMESTAMP_INVALID',
          'clock mismatch',
          422,
        );
      }
    });
    await reporter.start(preferences(true));
    for (let index = 0; index < 25; index += 1) {
      reporter.record({
        type: 'overlay_state',
        status: 'info',
        stage: 'overlay',
        durationMs: null,
        details: overlayDetails('watching_draft', index % 10),
      });
    }

    await reporter.flushNow();
    await reporter.flushNow();

    assert.equal(batches.length, 2);
    assert.equal(batches[0]?.session.id, batches[1]?.session.id);
    assert.equal(batches[1]?.events.length, 6);
  });

  it('opens a replacement after the server expires the current session', async () => {
    let attempts = 0;
    const { reporter, batches } = await harness(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new DesktopError(
          'DIAGNOSTIC_SESSION_EXPIRED',
          'expired',
          422,
        );
      }
    });
    await reporter.start(preferences(true));
    await reporter.flushNow();
    await reporter.flushNow();

    assert.equal(batches.length, 2);
    assert.notEqual(batches[0]?.session.id, batches[1]?.session.id);
    assert.equal(batches[1]?.events[0]?.type, 'app_started');
  });

  it('uploads mode changes in chronological metadata groups', async () => {
    const { reporter, batches } = await harness(async () => undefined);
    const vision = preferences(true);
    const overwolf: Preferences = { ...vision, assistantMode: 'overwolf' };
    await reporter.start(vision);
    await reporter.applyPreferences(vision, overwolf);
    await reporter.applyPreferences(overwolf, vision);

    await reporter.flushNow();
    await reporter.flushNow();
    await reporter.flushNow();

    assert.deepEqual(batches.map((batch) => batch.session.mode), [
      'vision',
      'overwolf',
      'vision',
    ]);
  });

  it('closes and rotates a long-running session before it ages out', async () => {
    let now = new Date('2026-08-09T10:00:00.000Z');
    const { reporter, batches } = await harness(async () => undefined, () => now);
    await reporter.start(preferences(true));
    now = new Date('2026-08-10T11:00:00.000Z');
    reporter.record({
      type: 'overlay_state',
      status: 'info',
      stage: 'overlay',
      durationMs: null,
      details: overlayDetails('watching_draft', 2),
    });

    await reporter.flushNow();
    await reporter.flushNow();

    assert.equal(batches.length, 2);
    assert.notEqual(batches[0]?.session.id, batches[1]?.session.id);
    assert.equal(batches[0]?.events.at(-1)?.type, 'app_stopped');
    assert.equal(batches[1]?.events[0]?.type, 'app_started');
  });

  it('rotates an idle session on heartbeat at the 24-hour boundary', async () => {
    let now = new Date('2026-08-09T10:00:00.000Z');
    const { reporter, batches } = await harness(
      async () => undefined,
      () => now,
      undefined,
      () => accountId,
      5,
    );
    await reporter.start(preferences(true));
    now = new Date('2026-08-10T11:00:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 20));

    await reporter.flushNow();
    await reporter.flushNow();
    await reporter.dispose();

    assert.equal(batches.length >= 2, true);
    assert.notEqual(batches[0]?.session.id, batches[1]?.session.id);
    assert.equal(batches[0]?.events.at(-1)?.type, 'app_stopped');
    assert.equal(batches[0]?.events.at(-1)?.createdAt, '2026-08-10T10:00:00.000Z');
    assert.equal(batches[1]?.events[0]?.type, 'app_started');
    assert.equal(batches[1]?.events[0]?.createdAt, '2026-08-10T11:00:00.000Z');
  });

  it('contains synchronous heartbeat failures without crashing the main process', async () => {
    let now = new Date('2026-08-09T10:00:00.000Z');
    let failInfo = false;
    const warnings: Array<Record<string, unknown> | undefined> = [];
    const { reporter } = await harness(
      async () => undefined,
      () => now,
      undefined,
      () => accountId,
      5,
      {
        info: () => {
          if (failInfo) throw new Error('logger failed');
        },
        warn: (_message, details) => warnings.push(details),
      },
    );
    await reporter.start(preferences(true));
    failInfo = true;
    now = new Date('2026-08-10T11:00:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await reporter.dispose();

    assert.equal(warnings.some((entry) => entry?.code === 'DIAGNOSTIC_HEARTBEAT_FAILED'), true);
  });

  it('deletes the unsent queue immediately when consent is revoked', async () => {
    const { reporter, batches, queuePath } = await harness(async () => undefined);
    const accepted = preferences(true);
    await reporter.start(accepted);
    reporter.record({
      type: 'capture_decision',
      status: 'info',
      stage: 'capture',
      durationMs: null,
      details: { revision: 1, distance: 2, decision: 'changed' },
    });
    await reporter.applyPreferences(accepted, preferences(false));
    await reporter.flushNow();

    assert.equal(batches.length, 0);
    await assert.rejects(readFile(queuePath, 'utf8'));
  });

  it('never uploads one account queue through a different account session', async () => {
    let activeAccountId: string | null = accountId;
    const secondAccountId = '22222222-2222-4222-8222-222222222222';
    const { reporter, batches } = await harness(
      async () => undefined,
      undefined,
      undefined,
      () => activeAccountId,
    );
    await reporter.start(preferences(true));
    reporter.record({
      type: 'recognition_result',
      status: 'success',
      stage: 'recognition',
      durationMs: 50,
      details: {
        revision: 1,
        quality: 'clear',
        model: 'test',
        recognizedCount: 1,
        needsReviewCount: 0,
        slots: [{
          slot: 0,
          side: 'enemy',
          visualGroup: 'right',
          heroId: 14,
          confidence: 0.99,
          needsReview: false,
        }],
      },
    });
    activeAccountId = secondAccountId;
    await reporter.applyAuthenticatedAccount(secondAccountId);
    await reporter.flushNow();

    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0]?.events.map((event) => event.type), ['app_started']);
  });

  it('never lets an invalid diagnostic event interrupt the app', async () => {
    const { reporter, logs } = await harness(async () => undefined);
    await reporter.start(preferences(false));

    assert.doesNotThrow(() => reporter.record({
      type: 'overlay_state',
      status: 'info',
      stage: 'overlay',
      durationMs: null,
      details: overlayDetails('ready', 99),
    } as never));
    assert.deepEqual(logs.at(-1), { code: 'DIAGNOSTIC_EVENT_INVALID' });
  });

  it('persists shutdown events without delaying exit on a network upload', async () => {
    const { reporter, batches, queuePath } = await harness(async () => new Promise(() => undefined));
    await reporter.start(preferences(true));
    await reporter.dispose();

    assert.equal(batches.length, 1);
    const state = JSON.parse(await readFile(queuePath, 'utf8')) as {
      queue: Array<{ event: { type: string } }>;
    };
    assert.equal(state.queue.at(-1)?.event.type, 'app_stopped');
  });

  it('closes an interrupted persisted session as a crash on the next start', async () => {
    const first = await harness(async () => undefined);
    await first.reporter.start(preferences(true));
    await first.reporter.flushNow();

    const second = await harness(
      async () => undefined,
      () => new Date('2026-08-09T10:05:00.000Z'),
      first.queuePath,
    );
    await second.reporter.start(preferences(true));
    await second.reporter.flushNow();
    await second.reporter.flushNow();

    assert.equal(second.batches.length, 2);
    assert.equal(second.batches[0]?.session.id, first.batches[0]?.session.id);
    assert.deepEqual(second.batches[0]?.events.map((event) => event.type), ['app_stopped']);
    assert.equal(second.batches[0]?.events[0]?.status, 'error');
    assert.equal(second.batches[0]?.events[0]?.createdAt, '2026-08-09T10:00:00.000Z');
    assert.equal(second.batches[1]?.events[0]?.type, 'app_started');
  });

  it('reports a corrupted persisted queue without exposing its contents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'counterpick-diagnostics-corrupt-'));
    temporaryDirectories.push(directory);
    const queuePath = join(directory, 'queue.json');
    await writeFile(queuePath, '{not-json', 'utf8');
    const { reporter, logs } = await harness(
      async () => undefined,
      undefined,
      queuePath,
    );

    await reporter.start(preferences(true));
    await reporter.dispose();

    assert.equal(logs.some((entry) => entry?.code === 'DIAGNOSTIC_QUEUE_LOAD_FAILED'), true);
    assert.equal(JSON.stringify(logs).includes('{not-json'), false);
    assert.equal(JSON.stringify(logs).includes(queuePath), false);
  });

  it('keeps running and logs a safe code when queue persistence fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'counterpick-diagnostics-write-'));
    temporaryDirectories.push(directory);
    const blockedDirectory = join(directory, 'blocked');
    await writeFile(blockedDirectory, 'not-a-directory', 'utf8');
    const { reporter, logs } = await harness(
      async () => undefined,
      undefined,
      join(blockedDirectory, 'queue.json'),
    );

    await assert.doesNotReject(reporter.start(preferences(true)));
    await assert.doesNotReject(reporter.dispose());

    assert.equal(logs.some((entry) => entry?.code === 'DIAGNOSTIC_QUEUE_PERSIST_FAILED'), true);
    assert.equal(JSON.stringify(logs).includes(blockedDirectory), false);
  });
});
