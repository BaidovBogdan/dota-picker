import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { diagnosticEvents, diagnosticSessions } from '../../db/schema.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import {
  diagnosticEventInputSchema,
  diagnosticsRetentionDays,
  type AdminDiagnosticsDetailQuery,
  type AdminDiagnosticsQuery,
  type DiagnosticBatchInput,
} from './diagnostics.schemas.js';

const retentionMs = diagnosticsRetentionDays * 24 * 60 * 60 * 1_000;
const maximumFutureClockSkewMs = 5 * 60 * 1_000;
const cleanupIntervalMs = 60 * 60 * 1_000;
const cleanupBatchLimit = 10_000;
const cleanupSessionBatchLimit = 100;
const cleanupEventBatchesPerRun = 4;
const cleanupSessionBatchesPerRun = 4;
const accountQuotaWindowMs = 24 * 60 * 60 * 1_000;
const accountEventLimit = 10_000;
const accountSessionLimit = 100;
const zUuid = z.uuid();

function toIso(value: Date) {
  return value.toISOString();
}

function durationMs(startedAt: Date, endedAt: Date | null) {
  if (!endedAt) return null;
  return Math.max(0, endedAt.getTime() - startedAt.getTime());
}

function sessionView(session: typeof diagnosticSessions.$inferSelect) {
  return {
    id: session.id,
    accountId: session.accountId,
    app: {
      platform: session.platform as 'win32' | 'darwin' | 'linux',
      version: session.appVersion,
      build: session.appBuild,
    },
    mode: session.mode as 'vision' | 'overwolf',
    status: session.status as 'active' | 'completed' | 'error',
    startedAt: toIso(session.startedAt),
    endedAt: session.endedAt ? toIso(session.endedAt) : null,
    durationMs: durationMs(session.startedAt, session.endedAt),
    eventCount: session.eventCount,
    errorCount: session.errorCount,
    lastEventAt: toIso(session.lastEventAt),
  };
}

type StoredDiagnosticEvent = Pick<
  typeof diagnosticEvents.$inferSelect,
  | 'id'
  | 'sessionId'
  | 'accountId'
  | 'sequence'
  | 'type'
  | 'status'
  | 'stage'
  | 'durationMs'
  | 'details'
  | 'createdAt'
>;

export function assertDiagnosticDuplicatesAreIdentical(
  accountId: string,
  sessionId: string,
  incomingEvents: DiagnosticBatchInput['events'],
  insertedIds: ReadonlySet<string>,
  storedEvents: StoredDiagnosticEvent[],
): number {
  let duplicates = 0;
  for (const incoming of incomingEvents) {
    if (insertedIds.has(incoming.id)) continue;
    const conflicts = storedEvents.filter((stored) => (
      stored.id === incoming.id
      || (stored.sessionId === sessionId && stored.sequence === incoming.sequence)
    ));
    const stored = conflicts[0];
    const identical = conflicts.length === 1
      && stored?.id === incoming.id
      && stored.sessionId === sessionId
      && stored.accountId === accountId
      && stored.sequence === incoming.sequence
      && stored.type === incoming.type
      && stored.status === incoming.status
      && stored.stage === incoming.stage
      && stored.durationMs === incoming.durationMs
      && stored.createdAt.getTime() === new Date(incoming.createdAt).getTime()
      && isDeepStrictEqual(stored.details, incoming.details);
    if (!identical) {
      throw new AppError(409, 'DIAGNOSTIC_EVENT_CONFLICT', 'Diagnostic event identity does not match');
    }
    duplicates += 1;
  }
  return duplicates;
}

export class DiagnosticsService {
  private lastCleanupAt = 0;
  private cleanupPromise: Promise<boolean> | null = null;

  public constructor(private readonly db: Database) {}

  public async ingest(accountId: string, input: DiagnosticBatchInput) {
    const now = new Date();
    const earliest = new Date(now.getTime() - retentionMs);
    const latest = new Date(now.getTime() + maximumFutureClockSkewMs);
    const startedAt = new Date(input.session.startedAt);
    const timestamps = input.events.map((event) => new Date(event.createdAt));
    if (startedAt < earliest) {
      throw new AppError(422, 'DIAGNOSTIC_SESSION_EXPIRED', 'Diagnostic session is outside the retention window');
    }
    if (startedAt > latest) {
      throw new AppError(422, 'DIAGNOSTIC_TIMESTAMP_INVALID', 'Diagnostic session timestamp is outside the accepted clock window');
    }
    if (
      timestamps.some((timestamp) => timestamp < earliest || timestamp > latest)
      || timestamps.some((timestamp) => timestamp.getTime() < startedAt.getTime() - maximumFutureClockSkewMs)
    ) {
      throw new AppError(422, 'DIAGNOSTIC_TIMESTAMP_INVALID', 'Diagnostic event timestamp is outside the accepted clock window');
    }
    const retainedUntil = new Date(now.getTime() + retentionMs);
    const sessionExpiresAt = new Date(Math.min(
      retainedUntil.getTime(),
      startedAt.getTime() + retentionMs,
    ));
    const quotaWindowStart = new Date(now.getTime() - accountQuotaWindowMs);

    const accepted = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`diagnostics:${accountId}`}))`);
      await tx.insert(diagnosticSessions).values({
        id: input.session.id,
        accountId,
        platform: input.session.platform,
        appVersion: input.session.appVersion,
        appBuild: input.session.appBuild,
        mode: input.session.mode,
        startedAt,
        lastEventAt: startedAt,
        expiresAt: sessionExpiresAt,
      }).onConflictDoNothing();

      const [existing] = await tx
        .select()
        .from(diagnosticSessions)
        .where(eq(diagnosticSessions.id, input.session.id))
        .limit(1)
        .for('update');
      if (!existing) {
        throw new AppError(409, 'DIAGNOSTIC_SESSION_CONFLICT', 'Diagnostic session identity does not match');
      }
      if (
        existing.accountId !== accountId
        || existing.platform !== input.session.platform
        || existing.appVersion !== input.session.appVersion
        || existing.appBuild !== input.session.appBuild
        || existing.mode !== input.session.mode
        || existing.startedAt.getTime() !== startedAt.getTime()
      ) {
        throw new AppError(409, 'DIAGNOSTIC_SESSION_CONFLICT', 'Diagnostic session identity does not match');
      }

      const inserted = await tx.insert(diagnosticEvents).values(input.events.map((event) => ({
        id: event.id,
        sessionId: input.session.id,
        accountId,
        sequence: event.sequence,
        type: event.type,
        status: event.status,
        stage: event.stage,
        durationMs: event.durationMs,
        details: event.details,
        createdAt: new Date(event.createdAt),
        expiresAt: sessionExpiresAt,
      }))).onConflictDoNothing().returning({
        id: diagnosticEvents.id,
        status: diagnosticEvents.status,
        type: diagnosticEvents.type,
        createdAt: diagnosticEvents.createdAt,
      });

      const insertedIds = new Set(inserted.map((event) => event.id));
      const missingEvents = input.events.filter((event) => !insertedIds.has(event.id));
      let duplicate = 0;
      if (missingEvents.length > 0) {
        const storedEvents = await tx.select({
          id: diagnosticEvents.id,
          sessionId: diagnosticEvents.sessionId,
          accountId: diagnosticEvents.accountId,
          sequence: diagnosticEvents.sequence,
          type: diagnosticEvents.type,
          status: diagnosticEvents.status,
          stage: diagnosticEvents.stage,
          durationMs: diagnosticEvents.durationMs,
          details: diagnosticEvents.details,
          createdAt: diagnosticEvents.createdAt,
        }).from(diagnosticEvents).where(or(
          inArray(diagnosticEvents.id, missingEvents.map((event) => event.id)),
          and(
            eq(diagnosticEvents.sessionId, input.session.id),
            inArray(diagnosticEvents.sequence, missingEvents.map((event) => event.sequence)),
          ),
        ));
        duplicate = assertDiagnosticDuplicatesAreIdentical(
          accountId,
          input.session.id,
          missingEvents,
          insertedIds,
          storedEvents,
        );
      }

      const [usage] = await tx.select({
        events: count(),
      }).from(diagnosticEvents).where(and(
        eq(diagnosticEvents.accountId, accountId),
        gte(diagnosticEvents.receivedAt, quotaWindowStart),
      ));
      const [sessionUsage] = await tx.select({
        sessions: count(),
      }).from(diagnosticSessions).where(and(
        eq(diagnosticSessions.accountId, accountId),
        gte(diagnosticSessions.createdAt, quotaWindowStart),
      ));
      if (
        (usage?.events ?? 0) > accountEventLimit
        || (sessionUsage?.sessions ?? 0) > accountSessionLimit
      ) {
        throw new AppError(
          429,
          'DIAGNOSTIC_QUOTA_EXCEEDED',
          'Diagnostic upload quota is temporarily exhausted',
          { retryAfterSeconds: 3_600 },
        );
      }

      if (inserted.length > 0) {
        const errorIncrement = inserted.filter((event) => event.status === 'error').length;
        const lastEventAt = inserted.reduce(
          (latestEvent, event) => event.createdAt > latestEvent ? event.createdAt : latestEvent,
          existing.lastEventAt,
        );
        const endedAt = inserted
          .filter((event) => event.type === 'app_stopped')
          .reduce<Date | null>(
            (latestEvent, event) => !latestEvent || event.createdAt > latestEvent ? event.createdAt : latestEvent,
            existing.endedAt,
          );
        const status = existing.status === 'error' || errorIncrement > 0
          ? 'error'
          : endedAt
            ? 'completed'
            : 'active';
        await tx.update(diagnosticSessions).set({
          status,
          endedAt,
          lastEventAt,
          eventCount: sql`${diagnosticSessions.eventCount} + ${inserted.length}`,
          errorCount: sql`${diagnosticSessions.errorCount} + ${errorIncrement}`,
          expiresAt: sessionExpiresAt,
          updatedAt: now,
        }).where(eq(diagnosticSessions.id, input.session.id));
      }
      return { accepted: inserted.length, duplicate };
    });

    return {
      accepted: accepted.accepted,
      duplicate: accepted.duplicate,
      retainedUntil: sessionExpiresAt.toISOString(),
    };
  }

  public async list(query: AdminDiagnosticsQuery) {
    const now = new Date();
    const conditions = this.conditions(query, now);
    const where = and(...conditions);
    const [aggregateRows, rows] = await Promise.all([
      this.db.select({
        sessions: count(),
        events: sql<number>`coalesce(sum(${diagnosticSessions.eventCount}), 0)::int`,
        errors: sql<number>`coalesce(sum(${diagnosticSessions.errorCount}), 0)::int`,
      }).from(diagnosticSessions).where(where),
      this.db.select().from(diagnosticSessions)
        .where(where)
        .orderBy(desc(diagnosticSessions.lastEventAt), desc(diagnosticSessions.id))
        .limit(query.limit)
        .offset(query.offset),
    ]);
    const aggregate = aggregateRows[0] ?? { sessions: 0, events: 0, errors: 0 };
    return {
      items: rows.map(sessionView),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: aggregate.sessions,
      },
      summary: {
        sessions: aggregate.sessions,
        events: aggregate.events,
        errors: aggregate.errors,
      },
    };
  }

  public async detail(id: string, query: AdminDiagnosticsDetailQuery) {
    const now = new Date();
    const [session] = await this.db.select().from(diagnosticSessions).where(and(
      eq(diagnosticSessions.id, id),
      gt(diagnosticSessions.expiresAt, now),
    )).limit(1);
    if (!session) throw new NotFoundError('Diagnostic session not found');
    const rows = await this.db.select().from(diagnosticEvents).where(and(
      eq(diagnosticEvents.sessionId, id),
      gt(diagnosticEvents.expiresAt, now),
      ...(query.beforeSequence
        ? [lt(diagnosticEvents.sequence, query.beforeSequence)]
        : []),
    ))
      .orderBy(desc(diagnosticEvents.sequence), desc(diagnosticEvents.createdAt))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const nextBeforeSequence = hasMore ? pageRows.at(-1)?.sequence ?? null : null;
    const events = pageRows.reverse().flatMap((event) => {
      const parsed = diagnosticEventInputSchema.safeParse({
        id: event.id,
        sequence: event.sequence,
        type: event.type,
        status: event.status,
        stage: event.stage,
        createdAt: event.createdAt.toISOString(),
        durationMs: event.durationMs,
        details: event.details,
      });
      if (!parsed.success) return [];
      const details = parsed.data.details;
      const errorCode = 'errorCode' in details && typeof details.errorCode === 'string'
        ? details.errorCode
        : 'code' in details && typeof details.code === 'string'
          ? details.code
          : null;
      const recoverable = 'recoverable' in details && typeof details.recoverable === 'boolean'
        ? details.recoverable
        : null;
      return [{
        id: parsed.data.id,
        sequence: parsed.data.sequence,
        type: parsed.data.type,
        status: parsed.data.status,
        stage: parsed.data.stage,
        createdAt: parsed.data.createdAt,
        durationMs: parsed.data.durationMs,
        ...(errorCode && recoverable !== null ? { error: { code: errorCode, recoverable } } : {}),
        details,
      }];
    });
    return {
      session: sessionView(session),
      events,
      pagination: {
        limit: query.limit,
        total: session.eventCount,
        nextBeforeSequence,
      },
    };
  }

  private conditions(query: AdminDiagnosticsQuery, now: Date) {
    const conditions: SQL[] = [gt(diagnosticSessions.expiresAt, now)];
    if (query.q) {
      const parsed = zUuid.safeParse(query.q);
      conditions.push(parsed.success
        ? or(
          eq(diagnosticSessions.id, parsed.data),
          eq(diagnosticSessions.accountId, parsed.data),
        ) ?? sql`false`
        : sql`false`);
    }
    if (query.appVersion) conditions.push(eq(diagnosticSessions.appVersion, query.appVersion));
    if (query.mode) conditions.push(eq(diagnosticSessions.mode, query.mode));
    if (query.status) conditions.push(eq(diagnosticSessions.status, query.status));
    if (query.hasErrors === true) conditions.push(gt(diagnosticSessions.errorCount, 0));
    if (query.hasErrors === false) conditions.push(eq(diagnosticSessions.errorCount, 0));
    if (query.from) conditions.push(gte(diagnosticSessions.startedAt, new Date(query.from)));
    if (query.to) conditions.push(lte(diagnosticSessions.startedAt, new Date(query.to)));
    return conditions;
  }

  public pruneExpired(now = new Date()): Promise<boolean> {
    if (now.getTime() - this.lastCleanupAt < cleanupIntervalMs) return Promise.resolve(false);
    if (this.cleanupPromise) return this.cleanupPromise;
    const operation = this.deleteExpired(now).finally(() => {
      if (this.cleanupPromise === operation) this.cleanupPromise = null;
    });
    this.cleanupPromise = operation;
    return operation;
  }

  private async deleteExpired(now: Date): Promise<boolean> {
    let eventBacklogRemaining = false;
    for (let batch = 0; batch < cleanupEventBatchesPerRun; batch += 1) {
      const result = await this.db.execute(sql`
        with expired as (
          select ${diagnosticEvents.id}
          from ${diagnosticEvents}
          where ${diagnosticEvents.expiresAt} <= ${now}
          order by ${diagnosticEvents.expiresAt}, ${diagnosticEvents.id}
          limit ${cleanupBatchLimit}
        ), deleted as (
          delete from ${diagnosticEvents}
          using expired
          where ${diagnosticEvents.id} = expired.id
          returning ${diagnosticEvents.sessionId} as session_id, ${diagnosticEvents.status} as status
        ), removed as (
          select
            session_id,
            count(*)::int as event_count,
            count(*) filter (where status = 'error')::int as error_count
          from deleted
          group by session_id
        ), updated as (
          update ${diagnosticSessions}
          set
            event_count = greatest(0, ${diagnosticSessions.eventCount} - removed.event_count),
            error_count = greatest(0, ${diagnosticSessions.errorCount} - removed.error_count),
            status = case
              when greatest(0, ${diagnosticSessions.errorCount} - removed.error_count) > 0 then 'error'
              when ${diagnosticSessions.endedAt} is not null then 'completed'
              else 'active'
            end,
            updated_at = ${now}
          from removed
          where ${diagnosticSessions.id} = removed.session_id
          returning ${diagnosticSessions.id}
        )
        select count(*)::int as deleted_count from deleted
      `);
      const deletedCount = Number(result.rows[0]?.deleted_count ?? 0);
      if (deletedCount < cleanupBatchLimit) break;
      if (batch === cleanupEventBatchesPerRun - 1) eventBacklogRemaining = true;
    }
    let sessionBacklogRemaining = false;
    for (let batch = 0; batch < cleanupSessionBatchesPerRun; batch += 1) {
      const result = await this.db.execute(sql`
        with expired as (
          select ${diagnosticSessions.id}
          from ${diagnosticSessions}
          where ${diagnosticSessions.expiresAt} <= ${now}
          and not exists (
            select 1
            from ${diagnosticEvents}
            where ${diagnosticEvents.sessionId} = ${diagnosticSessions.id}
          )
          order by ${diagnosticSessions.expiresAt}, ${diagnosticSessions.id}
          limit ${cleanupSessionBatchLimit}
        ), deleted as (
          delete from ${diagnosticSessions}
          using expired
          where ${diagnosticSessions.id} = expired.id
          returning ${diagnosticSessions.id}
        )
        select count(*)::int as deleted_count from deleted
      `);
      const deletedSessions = Number(result.rows[0]?.deleted_count ?? 0);
      if (deletedSessions < cleanupSessionBatchLimit) break;
      if (batch === cleanupSessionBatchesPerRun - 1) sessionBacklogRemaining = true;
    }
    const backlogRemaining = eventBacklogRemaining || sessionBacklogRemaining;
    if (!backlogRemaining) this.lastCleanupAt = now.getTime();
    return backlogRemaining;
  }
}
