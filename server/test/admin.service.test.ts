import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import type { Database } from '../src/db/client.js';
import { AdminService } from '../src/modules/admin/admin.service.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
  JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
  REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
  ADMIN_API_KEY: 'test-admin-key-that-is-longer-than-32-characters',
  PRO_QUOTA_MAX: '100',
});

function queryResult<T>(value: T) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => value),
    then: <TResult1 = T, TResult2 = never>(
      onFulfilled?: ((result: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(value).then(onFulfilled, onRejected),
  };
  return builder;
}

describe('AdminService Pro grants', () => {
  it('updates only the free-account selection and records a durable marker', async () => {
    const appliedAt = new Date('2026-08-02T12:00:00.000Z');
    const selectResults = [[], [{ total: 4 }]];
    const updateSet = vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: 'free-1' }, { id: 'free-2' }, { id: 'free-3' }]),
      })),
      values,
    }));
    const insertValues = vi.fn((values: Record<string, unknown>) => ({
      returning: vi.fn(async () => [{ ...values, id: 'audit-1', createdAt: appliedAt }]),
    }));
    const tx = {
      execute: vi.fn(async () => undefined),
      select: vi.fn(() => queryResult(selectResults.shift() ?? [])),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    const db = {
      transaction: vi.fn(async (operation: (transaction: typeof tx) => unknown) => operation(tx)),
    } as unknown as Database;
    const service = new AdminService(db, config);

    const result = await service.grantProToAllFreeAccounts('admin-session');

    expect(result).toMatchObject({
      marker: 'admin-grant-all-2026-08-02',
      alreadyApplied: false,
      totalAccounts: 4,
      eligibleAccounts: 3,
      grantedAccounts: 3,
      quotaBalance: 100,
    });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      plan: 'pro',
      planProductId: 'admin-grant-all-2026-08-02',
      planExpiresAt: null,
      quotaBalance: 100,
    }));
    expect(insertValues.mock.calls[0]?.[0]).toMatchObject({
      action: 'grant_pro_all',
      marker: 'admin-grant-all-2026-08-02',
      actor: 'admin-session',
      details: { grantedAccounts: 3 },
    });
  });

  it('returns the stored audit result without updating accounts again', async () => {
    const createdAt = new Date('2026-08-02T12:00:00.000Z');
    const existing = [{
      id: 'audit-1',
      action: 'grant_pro_all',
      marker: 'admin-grant-all-2026-08-02',
      actor: 'admin-session',
      details: {
        totalAccounts: 4,
        eligibleAccounts: 3,
        grantedAccounts: 3,
        quotaBalance: 100,
      },
      createdAt,
    }];
    const tx = {
      execute: vi.fn(async () => undefined),
      select: vi.fn(() => queryResult(existing)),
      update: vi.fn(),
      insert: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (operation: (transaction: typeof tx) => unknown) => operation(tx)),
    } as unknown as Database;
    const service = new AdminService(db, config);

    const result = await service.grantProToAllFreeAccounts('admin-session');

    expect(result).toEqual({
      marker: 'admin-grant-all-2026-08-02',
      alreadyApplied: true,
      totalAccounts: 4,
      eligibleAccounts: 3,
      grantedAccounts: 3,
      quotaBalance: 100,
      appliedAt: createdAt.toISOString(),
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
