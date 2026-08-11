import { and, count, eq, gt, lte, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { idempotencyRecords } from '../../db/schema.js';
import { createOpaqueToken, sha256, stableStringify } from '../../lib/crypto.js';
import { ConflictError } from '../../lib/errors.js';

const cleanupBatchLimit = 500;

export type IdempotencyClaim =
  | { kind: 'acquired'; id: string; leaseToken: string; resourceId: string | null }
  | { kind: 'completed'; response: Record<string, unknown> };

export class IdempotencyService {
  private cleanupPromise: Promise<boolean> | null = null;

  public constructor(
    private readonly db: Database,
    private readonly ttlMs: number,
    private readonly leaseMs: number,
  ) {}

  public async claim(
    accountId: string,
    endpoint: string,
    key: string,
    request: unknown,
  ): Promise<IdempotencyClaim> {
    const now = new Date();
    const requestHash = sha256(stableStringify(request));
    const leaseToken = createOpaqueToken();
    const createRecord = async (token: string) => {
      const [record] = await this.db
        .insert(idempotencyRecords)
        .values({
          accountId,
          endpoint,
          key,
          requestHash,
          leaseToken: token,
          leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
          expiresAt: new Date(now.getTime() + this.ttlMs),
        })
        .onConflictDoNothing({
          target: [idempotencyRecords.accountId, idempotencyRecords.endpoint, idempotencyRecords.key],
        })
        .returning({ id: idempotencyRecords.id, resourceId: idempotencyRecords.resourceId });
      return record;
    };
    const record = await createRecord(leaseToken);

    if (record) {
      return { kind: 'acquired', id: record.id, leaseToken, resourceId: record.resourceId };
    }

    let [existing] = await this.db.select().from(idempotencyRecords).where(and(
      eq(idempotencyRecords.accountId, accountId),
      eq(idempotencyRecords.endpoint, endpoint),
      eq(idempotencyRecords.key, key),
    )).limit(1);
    if (!existing) {
      throw new ConflictError('REQUEST_IN_PROGRESS', 'The request state changed; retry shortly');
    }
    if (existing.expiresAt.getTime() <= now.getTime()) {
      const [deleted] = await this.db.delete(idempotencyRecords).where(and(
        eq(idempotencyRecords.id, existing.id),
        lte(idempotencyRecords.expiresAt, now),
      )).returning({ id: idempotencyRecords.id });
      if (deleted) {
        const retryLeaseToken = createOpaqueToken();
        const retried = await createRecord(retryLeaseToken);
        if (retried) {
          return {
            kind: 'acquired',
            id: retried.id,
            leaseToken: retryLeaseToken,
            resourceId: retried.resourceId,
          };
        }
      }
      [existing] = await this.db.select().from(idempotencyRecords).where(and(
        eq(idempotencyRecords.accountId, accountId),
        eq(idempotencyRecords.endpoint, endpoint),
        eq(idempotencyRecords.key, key),
      )).limit(1);
      if (!existing) {
        throw new ConflictError('REQUEST_IN_PROGRESS', 'The request state changed; retry shortly');
      }
    }
    if (existing.requestHash !== requestHash) {
      throw new ConflictError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key was already used with a different request');
    }
    if (existing.status === 'completed' && existing.response) {
      return { kind: 'completed', response: existing.response };
    }
    if (existing.leaseExpiresAt.getTime() > now.getTime()) {
      throw new ConflictError('REQUEST_IN_PROGRESS', 'An identical request is already in progress');
    }

    const nextLeaseToken = createOpaqueToken();
    const [reacquired] = await this.db
      .update(idempotencyRecords)
      .set({
        leaseToken: nextLeaseToken,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
        expiresAt: new Date(now.getTime() + this.ttlMs),
        attempts: sql`${idempotencyRecords.attempts} + 1`,
        updatedAt: now,
      })
      .where(and(
        eq(idempotencyRecords.id, existing.id),
        eq(idempotencyRecords.status, 'in_progress'),
        lte(idempotencyRecords.leaseExpiresAt, now),
      ))
      .returning({ id: idempotencyRecords.id, resourceId: idempotencyRecords.resourceId });
    if (!reacquired) {
      throw new ConflictError('REQUEST_IN_PROGRESS', 'An identical request is already in progress');
    }
    return {
      kind: 'acquired',
      id: reacquired.id,
      leaseToken: nextLeaseToken,
      resourceId: reacquired.resourceId,
    };
  }

  public async complete(id: string, leaseToken: string, response: Record<string, unknown>): Promise<void> {
    const [completed] = await this.db
      .update(idempotencyRecords)
      .set({ status: 'completed', response, updatedAt: new Date() })
      .where(and(
        eq(idempotencyRecords.id, id),
        eq(idempotencyRecords.leaseToken, leaseToken),
        eq(idempotencyRecords.status, 'in_progress'),
      ))
      .returning({ id: idempotencyRecords.id });
    if (!completed) {
      throw new ConflictError('REQUEST_IN_PROGRESS', 'The request lease is no longer active');
    }
  }

  public async countActive(accountId: string, endpoint: string, now = new Date()): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(idempotencyRecords)
      .where(and(
        eq(idempotencyRecords.accountId, accountId),
        eq(idempotencyRecords.endpoint, endpoint),
        gt(idempotencyRecords.expiresAt, now),
      ));
    return result?.value ?? 0;
  }

  public pruneExpired(now = new Date()): Promise<boolean> {
    if (this.cleanupPromise) return this.cleanupPromise;
    const operation = this.deleteExpired(now).finally(() => {
      if (this.cleanupPromise === operation) this.cleanupPromise = null;
    });
    this.cleanupPromise = operation;
    return operation;
  }

  public async abort(id: string, leaseToken: string): Promise<void> {
    await this.db.delete(idempotencyRecords).where(and(
      eq(idempotencyRecords.id, id),
      eq(idempotencyRecords.leaseToken, leaseToken),
      eq(idempotencyRecords.status, 'in_progress'),
    ));
  }

  private async deleteExpired(now: Date): Promise<boolean> {
    const result = await this.db.execute(sql`
      with expired as (
        select ${idempotencyRecords.id}
        from ${idempotencyRecords}
        where ${idempotencyRecords.expiresAt} <= ${now}
        order by ${idempotencyRecords.expiresAt}, ${idempotencyRecords.id}
        limit ${cleanupBatchLimit}
      ), deleted as (
        delete from ${idempotencyRecords}
        using expired
        where ${idempotencyRecords.id} = expired.id
        returning ${idempotencyRecords.id}
      )
      select count(*)::int as deleted_count from deleted
    `);
    const deletedCount = Number(result.rows[0]?.deleted_count ?? 0);
    return deletedCount === cleanupBatchLimit;
  }
}
