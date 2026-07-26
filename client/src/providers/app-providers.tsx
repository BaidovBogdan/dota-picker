import NetInfo from '@react-native-community/netinfo';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { syncQuota } from '@/services/api/dota';
import { applyNetworkState, refreshNetworkState } from '@/services/network';
import { getSessionScope, useAppStore } from '@/store/app-store';
import { LocaleProvider } from '@/i18n';

const accountScopedQueryKeys = new Set(['analysis', 'billing-plans', 'quota']);

const syncPendingForCurrentOwner = () => {
  const store = useAppStore.getState();
  const ownerScope = getSessionScope(store.session, store.guestId);
  const hasPending = Boolean(
    ownerScope && store.pendingOfflineAnalyses.some((item) => item.ownerScope === ownerScope),
  );
  if (hasPending && !store.isRemoteBootstrapPending) {
    void syncQuota().catch(() => {});
  }
};

export function AppProviders({ children }: PropsWithChildren) {
  const wasOnline = useRef<boolean | null>(null);
  const nextRefreshAt = useAppStore((state) => state.attempts.nextRefreshAt);
  const plan = useAppStore((state) => state.session?.plan);
  const refreshFreeAttempts = useAppStore((state) => state.refreshFreeAttempts);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5 * 60 * 1000, retry: 1, refetchOnReconnect: true },
          mutations: { retry: 0 },
        },
      }),
  );

  useEffect(() => {
    const deadline = Date.parse(nextRefreshAt);
    if (!Number.isFinite(deadline)) return;
    const delay = deadline - Date.now();
    if (delay <= 0) {
      refreshFreeAttempts();
      return;
    }
    if (delay > 2_147_483_647) return;
    const timer = setTimeout(refreshFreeAttempts, Math.min(delay + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [nextRefreshAt, plan, refreshFreeAttempts]);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const online = applyNetworkState(state);
      if (wasOnline.current === false && online) {
        syncPendingForCurrentOwner();
      }
      wasOnline.current = online;
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
      if (state !== 'active') return;
      useAppStore.getState().refreshFreeAttempts();
      void refreshNetworkState().then((online) => {
        if (online) syncPendingForCurrentOwner();
      });
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () =>
      useAppStore.subscribe((state, previousState) => {
        const userId = state.session?.userId;
        if (userId === previousState.session?.userId) return;
        const filters = {
          predicate: (query: { queryKey: readonly unknown[] }) =>
            accountScopedQueryKeys.has(String(query.queryKey[0])) && query.queryKey[1] !== userId,
        };
        void client.cancelQueries(filters);
        client.removeQueries(filters);
      }),
    [client],
  );

  return (
    <LocaleProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </LocaleProvider>
  );
}
