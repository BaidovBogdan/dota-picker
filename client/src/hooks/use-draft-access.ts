import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { showNativeAlert } from '@/components/feedback/native-alert';
import { useTranslation } from '@/i18n';
import { resolveDraftAccess } from '@/services/draft-access';
import { useAppStore } from '@/store/app-store';

export type DraftAccessRequest = (onAllowed?: () => void) => boolean;

export function useDraftAccessGuard() {
  const remaining = useAppStore((state) => state.attempts.remaining);
  const plan = useAppStore((state) => state.session?.plan);
  const isRemoteBootstrapPending = useAppStore((state) => state.isRemoteBootstrapPending);
  const { t } = useTranslation();
  const status = useMemo(
    () => resolveDraftAccess({ remaining, plan, isRemoteBootstrapPending }),
    [isRemoteBootstrapPending, plan, remaining],
  );

  const requestAccess = useCallback<DraftAccessRequest>(
    (onAllowed) => {
      if (status === 'allowed') {
        onAllowed?.();
        return true;
      }
      if (status === 'upgrade') {
        router.push('/plans');
        return false;
      }
      if (status === 'waitForRefill') {
        showNativeAlert(t('home.noAttempts'), t('analysis.quotaBodyPro'), [
          { text: t('common.confirm') },
        ]);
        return false;
      }
      showNativeAlert(t('common.loading'), t('common.loading'), [{ text: t('common.confirm') }]);
      return false;
    },
    [status, t],
  );

  return useMemo(() => ({ status, requestAccess }), [requestAccess, status]);
}
