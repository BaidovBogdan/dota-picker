export type QuotaPolicy = {
  max: number;
  refillAmount: number;
  refillEveryMs: number;
};

export type QuotaState = {
  balance: number;
  refreshedAt: Date;
};

export type MaterializedQuota = QuotaState & {
  nextRefillAt: Date | null;
};

export function materializeQuota(state: QuotaState, policy: QuotaPolicy, now: Date): MaterializedQuota {
  const elapsed = Math.max(0, now.getTime() - state.refreshedAt.getTime());
  const intervals = Math.floor(elapsed / policy.refillEveryMs);
  const refreshedAt = intervals > 0
    ? new Date(state.refreshedAt.getTime() + intervals * policy.refillEveryMs)
    : state.refreshedAt;
  const balance = intervals > 0
    ? Math.min(policy.max, state.balance + intervals * policy.refillAmount)
    : Math.min(policy.max, state.balance);
  const nextRefillAt = balance >= policy.max
    ? null
    : new Date(refreshedAt.getTime() + policy.refillEveryMs);

  return { balance, refreshedAt, nextRefillAt };
}

export function reserveOne(state: QuotaState, policy: QuotaPolicy, now: Date) {
  const current = materializeQuota(state, policy, now);
  if (current.balance < 1) {
    return { success: false as const, quota: current };
  }

  const balance = current.balance - 1;
  return {
    success: true as const,
    quota: {
      balance,
      refreshedAt: current.refreshedAt,
      nextRefillAt: balance >= policy.max
        ? null
        : new Date(current.refreshedAt.getTime() + policy.refillEveryMs),
    },
  };
}

export function refundOne(state: QuotaState, policy: QuotaPolicy, now: Date) {
  const current = materializeQuota(state, policy, now);
  const balance = Math.min(policy.max, current.balance + 1);
  return {
    balance,
    refreshedAt: current.refreshedAt,
    nextRefillAt: balance >= policy.max
      ? null
      : new Date(current.refreshedAt.getTime() + policy.refillEveryMs),
  };
}

