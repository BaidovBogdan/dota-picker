import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import type { Database } from '../src/db/client.js';
import type { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import { AdminService, analysisSourceLabel } from '../src/modules/admin/admin.service.js';

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

const metaAdapter = {
  getHeroes: vi.fn(),
  getMetaPositionSnapshot: vi.fn(),
  getPatch: vi.fn(),
} as unknown as Pick<OpenDotaAdapter, 'getHeroes' | 'getMetaPositionSnapshot' | 'getPatch'>;

describe('AdminService analysis provenance', () => {
  it('keeps every source distinguishable in activity and table labels', () => {
    expect([
      analysisSourceLabel('manual'),
      analysisSourceLabel('photo'),
      analysisSourceLabel('overwolf'),
    ]).toEqual(['Вручную', 'Фото', 'Overwolf Live']);
  });
});

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
    const service = new AdminService(db, config, metaAdapter);

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
    const service = new AdminService(db, config, metaAdapter);

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

describe('AdminService meta', () => {
  it('returns one coherent rank snapshot from the shared OpenDota adapter', async () => {
    const heroes = [{ id: 1, localizedName: 'Anti-Mage' }];
    const snapshot = {
      patch: '7.39e',
      rank: 6,
      rankFilter: 'average_match_rank',
      window: 'current_patch_30d',
      minimumGames: 25,
      fetchedAt: '2026-08-08T10:00:00.000Z',
      isStale: false,
      availability: 'ready',
      positionStats: [],
    };
    const adapter = {
      getHeroes: vi.fn(async () => heroes),
      getMetaPositionSnapshot: vi.fn(async () => snapshot),
      getPatch: vi.fn(async () => snapshot.patch),
    } as unknown as Pick<OpenDotaAdapter, 'getHeroes' | 'getMetaPositionSnapshot' | 'getPatch'>;
    const service = new AdminService({} as Database, config, adapter);

    const result = await service.meta({ rank: 6 });

    expect(result).toEqual({ heroes, ...snapshot });
    expect(adapter.getHeroes).toHaveBeenCalledWith(6);
    expect(adapter.getMetaPositionSnapshot).toHaveBeenCalledWith(6);
  });

  it('reports a service-unavailable contract when metadata is not configured', async () => {
    const service = new AdminService({} as Database, config);

    await expect(service.meta({})).rejects.toMatchObject({
      statusCode: 503,
      code: 'EXTERNAL_SERVICE_UNAVAILABLE',
    });
  });
});

describe('AdminService system audit', () => {
  it('reports runtime probes instead of configuration-only assumptions', async () => {
    const db = { execute: vi.fn(async () => undefined) } as unknown as Database;
    const adapter = {
      getHeroes: vi.fn(),
      getMetaPositionSnapshot: vi.fn(),
      getPatch: vi.fn(async () => '7.41'),
    } as unknown as Pick<OpenDotaAdapter, 'getHeroes' | 'getMetaPositionSnapshot' | 'getPatch'>;
    const service = new AdminService(db, config, adapter);

    const result = await service.system();

    expect(result.summary.database.status).toBe('connected');
    expect(result.summary.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.groups.connected).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'postgresql', status: 'connected' }),
      expect.objectContaining({ id: 'opendota', status: 'connected' }),
    ]));
    expect(result.groups.connected.find((item) => item.id === 'opendota')?.detail).toContain('7.41');
    expect(db.execute).toHaveBeenCalledOnce();
    expect(adapter.getPatch).toHaveBeenCalledOnce();
  });

  it('marks failed runtime dependencies as blocked', async () => {
    const db = { execute: vi.fn(async () => Promise.reject(new Error('database unavailable'))) } as unknown as Database;
    const adapter = {
      getHeroes: vi.fn(),
      getMetaPositionSnapshot: vi.fn(),
      getPatch: vi.fn(async () => Promise.reject(new Error('OpenDota unavailable'))),
    } as unknown as Pick<OpenDotaAdapter, 'getHeroes' | 'getMetaPositionSnapshot' | 'getPatch'>;
    const service = new AdminService(db, config, adapter);

    const result = await service.system();

    expect(result.summary.database.status).toBe('blocked');
    expect(result.groups.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'postgresql', status: 'blocked' }),
      expect.objectContaining({ id: 'opendota', status: 'blocked' }),
    ]));
  });
});
