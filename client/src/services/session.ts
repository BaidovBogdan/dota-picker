import { useAppStore } from '@/store/app-store';
import { translate } from '@/i18n';

const DAY = 24 * 60 * 60 * 1000;

export function resetToLocalGuest(clearHistory = false) {
  const store = useAppStore.getState();
  const guestId = store.guestId;
  if (clearHistory || store.session?.kind === 'registered') store.clearHistory();
  if (!guestId) {
    store.setSession(null);
    return;
  }
  store.setSession({
    userId: guestId,
    kind: 'guest',
    email: null,
    displayName: translate('profile.guest'),
    plan: 'free',
    revenueCatAppUserId: guestId,
  });
  store.setAttempts({
    remaining: 3,
    maximum: 3,
    nextRefreshAt: new Date(Date.now() + DAY).toISOString(),
  });
}
