import * as SplashScreen from 'expo-splash-screen';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DotaStateAnimation } from '@/components/feedback/dota-state-animation';
import { AppText } from '@/components/ui/app-text';
import { useTranslation } from '@/i18n';
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
  const started = useRef(false);

  useEffect(() => {
    if (!fontsReady || !hydrated || started.current) return;
    started.current = true;
    let active = true;

    const start = async () => {
      const store = useAppStore.getState();
      store.setRemoteBootstrapPending(true);
      void SplashScreen.hideAsync().catch(() => {});
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
        await SplashScreen.hideAsync().catch(() => {});
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
          try {
            const history = await getServerHistory();
            const latest = useAppStore.getState();
            if (latest.session?.userId === expectedUserId) latest.mergeHistory(history);
          } catch {}
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
    };
  }, [bootstrapGuest, fontsReady, hydrated]);

  if (!fontsReady || !hydrated) return null;
  if (!ready) return <BootstrapLoading />;
  return children;
}

function BootstrapLoading() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.loadingRoot, { backgroundColor: colors.background }]}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
        style={[
          styles.loadingFrame,
          {
            backgroundColor: colors.surface,
            borderColor: colors.outline,
          },
        ]}
      >
        <View style={[styles.loadingHeader, { borderColor: colors.outline }]}>
          <View style={[styles.liveTag, { backgroundColor: colors.live }]}>
            <AppText variant="data" color="#FFFFFF">
              {t('brand.live')}
            </AppText>
          </View>
          <AppText variant="data" color={colors.textMuted}>
            {t('brand.desk')}
          </AppText>
        </View>

        <View style={styles.loadingBody}>
          <DotaStateAnimation scene="loading" size={108} />
          <View style={styles.brand}>
            <AppText variant="inscription" style={styles.brandText}>
              COUNTER
            </AppText>
            <View style={[styles.brandPick, { backgroundColor: colors.live }]}>
              <AppText variant="inscription" color="#FFFFFF" style={styles.brandText}>
                PICK
              </AppText>
            </View>
          </View>
          <AppText variant="data" color={colors.textMuted} style={styles.loadingLabel}>
            {t('common.loading')}
          </AppText>
        </View>

        <View style={[styles.loadingFooter, { borderColor: colors.outline }]}>
          <View style={[styles.loadingProgress, { backgroundColor: colors.cobalt }]} />
          <View style={[styles.loadingLive, { backgroundColor: colors.live }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingFrame: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 2,
    overflow: 'hidden',
  },
  loadingHeader: {
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
  },
  liveTag: {
    minHeight: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  loadingBody: {
    minHeight: 224,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  brand: {
    marginTop: -5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  brandPick: {
    marginLeft: 4,
    paddingHorizontal: 5,
  },
  loadingLabel: {
    marginTop: 14,
  },
  loadingFooter: {
    height: 8,
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  loadingProgress: {
    flex: 1,
  },
  loadingLive: {
    width: 76,
  },
});
