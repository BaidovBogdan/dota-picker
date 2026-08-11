import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config/env.js';
import type { Database } from '../src/db/client.js';
import { QuotaService } from '../src/modules/quota/quota.service.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-08-10T12:00:00.000Z');

describe('QuotaService get', () => {
  it('reads a materialized quota without starting a transaction or taking a row lock', async () => {
    const limit = vi.fn(async () => [{
      id: accountId,
      plan: 'free' as const,
      planExpiresAt: null,
      planProductId: null,
      quotaBalance: 3,
      quotaRefreshedAt: now,
    }]);
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({ limit }),
      }),
    }));
    const transaction = vi.fn();
    const service = new QuotaService(
      { select, transaction } as unknown as Database,
      {
        free: { max: 3, refillAmount: 1, refillEveryMs: 24 * 60 * 60 * 1_000 },
        pro: { max: 100, refillAmount: 100, refillEveryMs: 24 * 60 * 60 * 1_000 },
      } satisfies AppConfig['quota'],
    );

    const quota = await service.get(accountId, now);

    expect(quota).toEqual({
      plan: 'free',
      remaining: 3,
      limit: 3,
      nextRefillAt: null,
      planExpiresAt: null,
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
    expect(transaction).not.toHaveBeenCalled();
  });
});
