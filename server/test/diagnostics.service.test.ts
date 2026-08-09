import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import { AppError } from '../src/lib/errors.js';
import {
  diagnosticBatchInputSchema,
  diagnosticsConsentVersion,
  type DiagnosticBatchInput,
} from '../src/modules/diagnostics/diagnostics.schemas.js';
import { DiagnosticsService } from '../src/modules/diagnostics/diagnostics.service.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';

function batch(): DiagnosticBatchInput {
  const now = new Date().toISOString();
  return diagnosticBatchInputSchema.parse({
    session: {
      id: sessionId,
      platform: 'win32',
      appVersion: '0.1.12',
      appBuild: '0.1.12+test',
      mode: 'vision',
      startedAt: now,
      consentVersion: diagnosticsConsentVersion,
    },
    events: [{
      id: eventId,
      sequence: 1,
      type: 'app_started',
      status: 'info',
      stage: 'app',
      createdAt: now,
      durationMs: null,
      details: { consentVersion: diagnosticsConsentVersion },
    }],
  });
}

function existingSession(input: DiagnosticBatchInput, owner = accountId) {
  const startedAt = new Date(input.session.startedAt);
  return {
    id: input.session.id,
    accountId: owner,
    platform: input.session.platform,
    appVersion: input.session.appVersion,
    appBuild: input.session.appBuild,
    mode: input.session.mode,
    status: 'active',
    startedAt,
    endedAt: null,
    lastEventAt: startedAt,
    eventCount: 0,
    errorCount: 0,
    expiresAt: new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1_000),
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

function storedEvent(
  input: DiagnosticBatchInput,
  overrides: Partial<{
    id: string;
    sequence: number;
    details: unknown;
  }> = {},
) {
  const event = input.events[0];
  if (!event) throw new Error('Fixture event is required');
  return {
    id: overrides.id ?? event.id,
    sessionId: input.session.id,
    accountId,
    sequence: overrides.sequence ?? event.sequence,
    type: event.type,
    status: event.status,
    stage: event.stage,
    durationMs: event.durationMs,
    details: overrides.details ?? event.details,
    createdAt: new Date(event.createdAt),
  };
}

type Scenario = {
  existing?: ReturnType<typeof existingSession>;
  inserted?: { id: string; status: string; type: string; createdAt: Date }[];
  stored?: ReturnType<typeof storedEvent>[];
  usage?: number;
  sessions?: number;
};

function databaseFor(input: DiagnosticBatchInput, scenario: Scenario = {}) {
  const inserted = scenario.inserted ?? input.events.map((event) => ({
    id: event.id,
    status: event.status,
    type: event.type,
    createdAt: new Date(event.createdAt),
  }));
  const selectResults: unknown[][] = [
    [scenario.existing ?? existingSession(input)],
    ...(inserted.length < input.events.length ? [scenario.stored ?? []] : []),
    [{ events: scenario.usage ?? inserted.length }],
    [{ sessions: scenario.sessions ?? 1 }],
  ];
  let insertIndex = 0;
  const updates: Record<string, unknown>[] = [];
  const tx = {
    execute: vi.fn(async () => ({ rows: [] })),
    insert: vi.fn(() => {
      const current = insertIndex;
      insertIndex += 1;
      return {
        values: () => ({
          onConflictDoNothing: () => current === 0
            ? Promise.resolve([])
            : { returning: async () => inserted },
        }),
      };
    }),
    select: vi.fn(() => {
      const result = selectResults.shift() ?? [];
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = () => chain;
      chain.for = async () => result;
      chain.then = (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return chain;
    }),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: async () => [] };
      },
    })),
  };
  const db = {
    transaction: vi.fn(async (operation: (transaction: typeof tx) => unknown) => operation(tx)),
  };
  return { db: db as unknown as Database, tx, updates };
}

async function expectAppError(promise: Promise<unknown>, code: AppError['code']) {
  try {
    await promise;
    throw new Error('Expected AppError');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe('DiagnosticsService ingestion', () => {
  it('rejects a session owned by another account before inserting events', async () => {
    const input = batch();
    const { db, tx } = databaseFor(input, {
      existing: existingSession(input, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    });

    await expectAppError(
      new DiagnosticsService(db).ingest(accountId, input),
      'DIAGNOSTIC_SESSION_CONFLICT',
    );
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it('counts only an identical stored event as an idempotent duplicate', async () => {
    const input = batch();
    const { db, updates } = databaseFor(input, {
      inserted: [],
      stored: [storedEvent(input)],
      usage: 1,
    });

    await expect(new DiagnosticsService(db).ingest(accountId, input)).resolves.toMatchObject({
      accepted: 0,
      duplicate: 1,
    });
    expect(updates).toHaveLength(0);
  });

  it.each([
    ['same sequence with another ID', { id: '44444444-4444-4444-8444-444444444444' }],
    ['same ID with changed content', { details: { consentVersion: 99 } }],
  ])('rejects %s as an event identity conflict', async (_name, overrides) => {
    const input = batch();
    const { db } = databaseFor(input, {
      inserted: [],
      stored: [storedEvent(input, overrides)],
      usage: 1,
    });

    await expectAppError(
      new DiagnosticsService(db).ingest(accountId, input),
      'DIAGNOSTIC_EVENT_CONFLICT',
    );
  });

  it('rejects a quota overflow inside the transaction before updating counters', async () => {
    const input = batch();
    const { db, updates } = databaseFor(input, { usage: 10_001 });

    await expectAppError(
      new DiagnosticsService(db).ingest(accountId, input),
      'DIAGNOSTIC_QUOTA_EXCEEDED',
    );
    expect(updates).toHaveLength(0);
  });

  it('marks a normally stopped session completed and updates it once', async () => {
    const input = batch();
    const firstEvent = input.events[0];
    if (!firstEvent) throw new Error('Fixture event is required');
    input.events = [{
      ...firstEvent,
      type: 'app_stopped',
      status: 'info',
      stage: 'app',
      details: { reason: 'quit' },
    }];
    const { db, updates } = databaseFor(input);

    await expect(new DiagnosticsService(db).ingest(accountId, input)).resolves.toMatchObject({
      accepted: 1,
      duplicate: 0,
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'completed' });
    expect(updates[0]?.endedAt).toBeInstanceOf(Date);
  });
});

describe('DiagnosticsService retention cleanup', () => {
  it('caps work per run and coalesces cleanup attempts within one hour', async () => {
    const execute = vi.fn(async () => ({ rows: [{ deleted_count: 10_000 }] }));
    const service = new DiagnosticsService({ execute } as unknown as Database);
    const now = new Date('2026-08-09T10:00:00.000Z');

    await expect(service.pruneExpired(now)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(8);
    await expect(service.pruneExpired(new Date('2026-08-09T10:00:05.000Z'))).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(16);
  });

  it('stops each cleanup phase as soon as a partial batch is deleted', async () => {
    const execute = vi.fn(async () => ({ rows: [{ deleted_count: 0 }] }));
    const service = new DiagnosticsService({ execute } as unknown as Database);

    await expect(service.pruneExpired(new Date('2026-08-09T10:00:00.000Z'))).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
    await expect(service.pruneExpired(new Date('2026-08-09T10:30:00.000Z'))).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe('DiagnosticsService detail pagination', () => {
  it('returns chronological pages with a stable sequence cursor', async () => {
    const input = batch();
    const session = { ...existingSession(input), eventCount: 3 };
    const events = [3, 2, 1].map((sequence) => ({
      ...storedEvent(input, {
        id: `${String(sequence).padStart(8, '0')}-3333-4333-8333-333333333333`,
        sequence,
      }),
      receivedAt: new Date(input.session.startedAt),
      expiresAt: session.expiresAt,
    }));
    const results = [[session], events];
    const offset = vi.fn();
    const db = {
      select: vi.fn(() => {
        const result = results.shift() ?? [];
        const chain: Record<string, unknown> = {};
        chain.from = () => chain;
        chain.where = () => chain;
        chain.orderBy = () => chain;
        chain.limit = () => chain;
        chain.offset = offset;
        chain.then = (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject);
        return chain;
      }),
    };

    const result = await new DiagnosticsService(db as unknown as Database).detail(
      sessionId,
      { limit: 2 },
    );

    expect(result.events.map((event) => event.sequence)).toEqual([2, 3]);
    expect(result.pagination).toEqual({
      limit: 2,
      total: 3,
      nextBeforeSequence: 2,
    });
    expect(offset).not.toHaveBeenCalled();
  });
});
