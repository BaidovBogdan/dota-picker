import type { Session } from '@/types/domain';

export type DraftAccessStatus = 'pending' | 'allowed' | 'upgrade' | 'waitForRefill';

type DraftAccessInput = {
  remaining: number;
  plan: Session['plan'] | undefined;
  isRemoteBootstrapPending: boolean;
};

export const resolveDraftAccess = ({
  remaining,
  plan,
  isRemoteBootstrapPending,
}: DraftAccessInput): DraftAccessStatus => {
  if (isRemoteBootstrapPending) return 'pending';
  if (remaining > 0) return 'allowed';
  return plan === 'pro' ? 'waitForRefill' : 'upgrade';
};
