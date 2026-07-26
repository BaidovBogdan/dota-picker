import { describe, expect, it } from 'vitest';
import { materializeQuota, refundOne, reserveOne, type QuotaPolicy } from '../src/modules/quota/quota.logic.js';

const hour = 60 * 60 * 1_000;
const policy: QuotaPolicy = { max: 3, refillAmount: 1, refillEveryMs: 24 * hour };
const startedAt = new Date('2026-07-01T12:00:00.000Z');

describe('quota materialization', () => {
  it('does not refill before a complete interval', () => {
    const quota = materializeQuota(
      { balance: 0, refreshedAt: startedAt },
      policy,
      new Date(startedAt.getTime() + 24 * hour - 1),
    );

    expect(quota.balance).toBe(0);
    expect(quota.refreshedAt).toEqual(startedAt);
    expect(quota.nextRefillAt).toEqual(new Date(startedAt.getTime() + 24 * hour));
  });

  it('applies all elapsed intervals, caps balance, and preserves cadence', () => {
    const now = new Date(startedAt.getTime() + 73 * hour);
    const quota = materializeQuota({ balance: 1, refreshedAt: startedAt }, policy, now);

    expect(quota.balance).toBe(3);
    expect(quota.refreshedAt).toEqual(new Date(startedAt.getTime() + 72 * hour));
    expect(quota.nextRefillAt).toBeNull();
  });

  it('ignores a clock that moved backwards', () => {
    const quota = materializeQuota(
      { balance: 1, refreshedAt: startedAt },
      policy,
      new Date(startedAt.getTime() - hour),
    );

    expect(quota.balance).toBe(1);
    expect(quota.refreshedAt).toEqual(startedAt);
  });
});

describe('quota reservation', () => {
  it('reserves an attempt after a refill and reports the next refill', () => {
    const now = new Date(startedAt.getTime() + 24 * hour);
    const reservation = reserveOne({ balance: 0, refreshedAt: startedAt }, policy, now);

    expect(reservation.success).toBe(true);
    if (reservation.success) {
      expect(reservation.quota.balance).toBe(0);
      expect(reservation.quota.refreshedAt).toEqual(now);
      expect(reservation.quota.nextRefillAt).toEqual(new Date(now.getTime() + 24 * hour));
    }
  });

  it('rejects a reservation with no attempts', () => {
    const reservation = reserveOne({ balance: 0, refreshedAt: startedAt }, policy, startedAt);
    expect(reservation.success).toBe(false);
  });

  it('refunds without exceeding the plan limit', () => {
    const quota = refundOne({ balance: 3, refreshedAt: startedAt }, policy, startedAt);
    expect(quota.balance).toBe(3);
    expect(quota.nextRefillAt).toBeNull();
  });
});

