import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { LaunchSplash } from '@/components/brand/launch-splash';
import { bootstrapGuestSession, hasStoredSession } from '@/services/api/auth';
import { getServerHistory } from '@/services/api/dota';
import { loginBilling } from '@/services/billing';
import { getCredential, setCredential } from '@/services/credential-storage';
import { resetToLocalGuest } from '@/services/session';
import { getSessionScope, useAppStore } from '@/store/app-store';
import { useAppTheme } from '@/theme/use-app-theme';
import { createId } from '@/utils/id';

type Props = PropsWithChildren<{ fontsReady: boolean }>;

export function BootstrapGate({ fontsReady, children }: Props) {
  const hydrated = useAppStore((state) => state.hasHydrated);
  const bootstrapGuest = useAppStore((state) => state.bootstrapGuest);
  const [ready, setReady] = useState(false);
  const [splashAssembled, setSplashAssembled] = useState(false);
  const [splashFinished, setSplashFinished] = useState(false);
  const started = useRef(false);
  const { colors } = useAppTheme();
  const finishAssembly = useCallback(() => setSplashAssembled(true), []);
  const finishSplash = useCallback(() => setSplashFinished(true), []);

  useEffect(() => {
    if (!fontsReady || !hydrated || started.current) return;
    started.current = true;
    const controller = new AbortController();
    let active = true;

    const start = async () => {
      const store = useAppStore.getState();
      store.setRemoteBootstrapPending(true);
      let guestId = store.guestId ?? createId('guest');
      try {
        const storedCredential = await getCredential('counterpick.guest-credential');
        guestId = storedCredential ?? guestId;
        if (!storedCredential) {
          await setCredential('counterpick.guest-credential', guestId);
        }
      } catch {}
      store.setGuestId(guestId);
      bootstrapGuest();
      if (!useAppStore.getState().session) resetToLocalGuest();
      const previousSession = useAppStore.getState().session;
      const previousScope = getSessionScope(previousSession, guestId);
      if (active) {
        setReady(true);
      }

      try {
        const session = await bootstrapGuestSession(guestId);
        if (!active) return;
        const currentStore = useAppStore.getState();
        if (currentStore.session?.userId !== session.userId) return;
        const currentScope = getSessionScope(session, guestId);
        if (previousScope && currentScope && previousScope !== currentScope) {
          currentStore.clearHistory();
        }
        const expectedUserId = session.userId;
        if (session.kind === 'registered') {
          void getServerHistory(controller.signal)
            .then((history) => {
              const latest = useAppStore.getState();
              if (active && latest.session?.userId === expectedUserId) latest.mergeHistory(history);
            })
            .catch(() => {});
        }
        loginBilling(session.revenueCatAppUserId).catch(() => {});
      } catch {
        if (!active) return;
        const canKeepPersistedSession = Boolean(
          useAppStore.getState().session && (await hasStoredSession()),
        );
        if (!canKeepPersistedSession) resetToLocalGuest();
      } finally {
        if (active) useAppStore.getState().setRemoteBootstrapPending(false);
      }
    };

    void start();
    return () => {
      active = false;
      controller.abort();
    };
  }, [bootstrapGuest, fontsReady, hydrated]);

  if (!fontsReady || !hydrated) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {ready && splashAssembled ? children : null}
      {!splashFinished ? (
        <LaunchSplash
          appReady={ready}
          onAssembled={finishAssembly}
          onFinished={finishSplash}
        />
      ) : null}
    </View>
  );
}
