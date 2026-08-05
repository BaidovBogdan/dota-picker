export const complimentaryProGrantId = 'admin-grant-all-2026-08-02' as const;

type PlanAccount = {
  plan: 'free' | 'pro';
  planProductId: string | null;
  planExpiresAt: Date | null;
  complimentaryPro: boolean;
};

export function resolvePlanAfterRevenueCatEvent(input: {
  complimentaryPro: boolean;
  revenueCatActive: boolean;
  revenueCatProductId: string | null;
  revenueCatExpiresAt: Date | null;
}) {
  if (input.revenueCatActive) {
    return {
      plan: 'pro' as const,
      planProductId: input.revenueCatProductId,
      planExpiresAt: input.revenueCatExpiresAt,
    };
  }
  if (input.complimentaryPro) {
    return {
      plan: 'pro' as const,
      planProductId: complimentaryProGrantId,
      planExpiresAt: null,
    };
  }
  return {
    plan: 'free' as const,
    planProductId: null,
    planExpiresAt: null,
  };
}

export function hasTransferableRevenueCatEntitlement(account: PlanAccount, now: Date) {
  if (account.plan !== 'pro') return false;
  if (
    account.complimentaryPro
    && (account.planProductId === null || account.planProductId === complimentaryProGrantId)
  ) {
    return false;
  }
  return account.planExpiresAt === null || account.planExpiresAt.getTime() > now.getTime();
}
