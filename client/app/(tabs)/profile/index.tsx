import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { showNativeAlert } from '@/components/feedback/native-alert';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { useTranslation } from '@/i18n';
import { nativeLargeHeaderOptions } from '@/navigation/native-header';
import { bootstrapGuestSession, deleteAccount, logout } from '@/services/api/auth';
import { resetDevelopmentQuota } from '@/services/api/dota';
import { getAccountReviewsPage } from '@/services/api/reviews';
import {
  confirmBillingStatus,
  loginBilling,
  logoutBilling,
  manageSubscriptions,
} from '@/services/billing';
import { resetToLocalGuest } from '@/services/session';
import { getSessionScope, useAppStore } from '@/store/app-store';
import { layout, shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import type { LanguageMode, ThemeMode } from '@/types/domain';

const themeOptions: {
  value: ThemeMode;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'system', labelKey: 'common.system', icon: 'contrast-outline' },
  { value: 'light', labelKey: 'common.light', icon: 'sunny-outline' },
  { value: 'dark', labelKey: 'common.dark', icon: 'moon-outline' },
];

const languageOptions: {
  value: LanguageMode;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'system', labelKey: 'common.system', icon: 'phone-portrait-outline' },
  { value: 'ru', labelKey: 'common.russian', icon: 'language-outline' },
  { value: 'en', labelKey: 'common.english', icon: 'language-outline' },
];

export default function ProfileScreen() {
  const session = useAppStore((state) => state.session);
  const attempts = useAppStore((state) => state.attempts);
  const serverAttempts = useAppStore((state) => state.serverAttempts);
  const historyCount = useAppStore((state) => state.history.length);
  const guestId = useAppStore((state) => state.guestId);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const themeMode = useAppStore((state) => state.themeMode);
  const languageMode = useAppStore((state) => state.languageMode);
  const wishlistByOwnerScope = useAppStore((state) => state.wishlistByOwnerScope);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const setLanguageMode = useAppStore((state) => state.setLanguageMode);
  const [busy, setBusy] = useState(false);
  const [resettingAttempts, setResettingAttempts] = useState(false);
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isRegistered = session?.kind === 'registered';
  const isPro = session?.plan === 'pro';
  const horizontalGutter = width >= 700 ? layout.tabletGutter : layout.phoneGutter;
  const ownerScope = getSessionScope(session, guestId);
  const wishlistCount = ownerScope ? (wishlistByOwnerScope[ownerScope]?.length ?? 0) : 0;
  const reviewsQuery = useQuery({
    queryKey: ['reviews-summary', session?.userId],
    queryFn: () => getAccountReviewsPage({ limit: 1 }),
    enabled: Boolean(session?.userId),
  });

  const showMessage = (title: string, message: string) =>
    showNativeAlert(title, message, [{ text: t('common.confirm') }]);

  const signOut = async () => {
    if (!guestId) return;
    setBusy(true);
    try {
      const remoteLogout = Promise.allSettled([
        logout(),
        logoutBilling(session?.revenueCatAppUserId),
      ]);
      resetToLocalGuest(true);
      const expectedFallbackId = useAppStore.getState().session?.userId;
      await remoteLogout;
      const currentSession = useAppStore.getState().session;
      if (currentSession?.kind !== 'guest' || currentSession.userId !== expectedFallbackId) return;
      try {
        const guest = await bootstrapGuestSession(guestId);
        if (useAppStore.getState().session?.userId !== guest.userId) return;
        await loginBilling(guest.revenueCatAppUserId).catch(() => {});
      } catch {
        if (useAppStore.getState().session?.userId !== expectedFallbackId) return;
        showMessage(t('profile.signOut'), t('profile.signOutOfflineBody'));
      }
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async () => {
    if (!guestId) return;
    const deletedScope = getSessionScope(session, guestId);
    setBusy(true);
    try {
      await deleteAccount();
      if (deletedScope) useAppStore.getState().discardOwnerScope(deletedScope);
      resetToLocalGuest(true);
      const expectedFallbackId = useAppStore.getState().session?.userId;
      try {
        if (useAppStore.getState().session?.userId !== expectedFallbackId) return;
        const guest = await bootstrapGuestSession(guestId);
        if (useAppStore.getState().session?.userId !== guest.userId) return;
        await loginBilling(guest.revenueCatAppUserId).catch(() => {});
        void confirmBillingStatus().catch(() => false);
      } catch {
        if (useAppStore.getState().session?.userId !== expectedFallbackId) return;
        showMessage(t('profile.deleteAccount'), t('profile.accountDeletedOfflineBody'));
      }
    } catch (error) {
      showMessage(
        t('profile.deleteAccount'),
        error instanceof Error ? error.message : t('auth.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  const resetAttempts = async () => {
    setResettingAttempts(true);
    try {
      await resetDevelopmentQuota();
      showMessage(t('profile.resetAttempts'), t('profile.resetAttemptsSuccess'));
    } catch (error) {
      showMessage(
        t('profile.resetAttempts'),
        error instanceof Error ? error.message : t('errors.tryAgain'),
      );
    } finally {
      setResettingAttempts(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeLargeHeaderOptions(colors),
          title: t('profile.title'),
          headerLargeTitleEnabled: true,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: horizontalGutter,
          paddingTop: 0,
          paddingBottom: 118,
        }}
      >
        <Panel
          style={{
            padding: 0,
          }}
        >
          <View
            style={{
              minHeight: 30,
              flexDirection: 'row',
              alignItems: 'center',
              borderBottomWidth: 2,
              borderColor: colors.outline,
            }}
          >
            <View
              style={{
                alignSelf: 'stretch',
                justifyContent: 'center',
                paddingHorizontal: 10,
                backgroundColor: isPro ? colors.cobalt : colors.live,
              }}
            >
              <AppText variant="data" color="#FFFFFF">
                {isPro ? t('common.pro') : t('common.free')}
              </AppText>
            </View>
            <AppText
              variant="data"
              color={colors.textMuted}
              numberOfLines={1}
              style={{ flex: 1, paddingHorizontal: 10 }}
            >
              {isRegistered ? t('profile.registered') : t('profile.guest')}
            </AppText>
            <View style={{ width: 34, alignSelf: 'stretch', backgroundColor: colors.text }} />
          </View>

          <View style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 58,
                  height: 58,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderRadius: shape.media,
                  borderColor: colors.outline,
                  backgroundColor: isPro ? colors.cobalt : colors.background,
                }}
              >
                <Ionicons
                  name={isPro ? 'diamond' : 'person'}
                  size={27}
                  color={isPro ? '#FFFFFF' : colors.text}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                <AppText variant="title" numberOfLines={1}>
                  {isRegistered
                    ? (session?.displayName ?? session?.email ?? t('profile.registered'))
                    : t('profile.guest')}
                </AppText>
                <AppText
                  variant="caption"
                  color={colors.textMuted}
                  numberOfLines={1}
                  style={{ marginTop: 3 }}
                >
                  {isRegistered
                    ? (session?.email ?? t('profile.registered'))
                    : t('profile.guestLocalOnly')}
                </AppText>
              </View>
            </View>

            {!isRegistered ? (
              <Button
                label={t('profile.signIn')}
                tone="secondary"
                icon="log-in-outline"
                onPress={() => router.push('/auth')}
                style={{ marginTop: 14 }}
              />
            ) : null}
          </View>

          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 2,
              borderColor: colors.outline,
            }}
          >
            <StatBlock
              label={t('profile.attempts')}
              value={`${attempts.remaining}/${attempts.maximum}`}
              color={isPro ? colors.cobalt : colors.live}
            />
            <View style={{ width: 2, backgroundColor: colors.outline }} />
            <StatBlock
              label={t('profile.saved')}
              value={String(historyCount)}
              color={colors.text}
            />
          </View>
        </Panel>

        <Button
          label={isPro ? t('profile.manageSubscription') : t('profile.upgrade')}
          icon="diamond-outline"
          tone="dota"
          onPress={() => {
            if (!isPro) {
              router.push('/plans');
              return;
            }
            manageSubscriptions().catch((error) =>
              showMessage(
                t('profile.plan'),
                error instanceof Error ? error.message : t('plans.error'),
              ),
            );
          }}
          style={{ marginTop: 12 }}
        />

        <SectionHeader title={t('wishlist.title')} body={t('wishlist.profileBody')} />
        <SettingsRow
          icon="heart-outline"
          label={t('wishlist.open')}
          body={t('wishlist.count', { count: wishlistCount })}
          onPress={() => router.push('/wishlist' as Href)}
        />

        <SectionHeader title={t('review.mine')} body={t('review.profileBody')} />
        <SettingsRow
          icon="star-outline"
          label={t('review.mine')}
          body={
            reviewsQuery.isError
              ? t('review.loadError')
              : t('review.count', { count: reviewsQuery.data?.total ?? 0 })
          }
          onPress={() => router.push('/(tabs)/profile/reviews' as Href)}
          loading={reviewsQuery.isPending}
        />

        <SectionHeader title={t('profile.theme')} body={t('profile.themeBody')} />
        <ChoiceGrid
          value={themeMode}
          options={themeOptions}
          onChange={(value) => setThemeMode(value as ThemeMode)}
        />

        <SectionHeader title={t('profile.language')} body={t('profile.languageBody')} />
        <ChoiceGrid
          value={languageMode}
          options={languageOptions}
          onChange={(value) => setLanguageMode(value as LanguageMode)}
        />

        {__DEV__ ? (
          <>
            <SectionHeader title={t('profile.lottieLab')} body={t('profile.lottieLabBody')} />
            <Button
              label={t('profile.lottieLabButton')}
              icon="play-circle-outline"
              tone="secondary"
              onPress={() => router.push('/(tabs)/profile/lottie-lab')}
            />
          </>
        ) : null}

        <SectionHeader title={t('profile.data')} body={t('profile.clearHistoryBody')} />
        {__DEV__ ? (
          <SettingsRow
            icon="refresh-circle-outline"
            label={t('profile.resetAttempts')}
            body={t('profile.resetAttemptsBody')}
            onPress={() => void resetAttempts()}
            loading={resettingAttempts}
            disabled={
              resettingAttempts ||
              (serverAttempts?.remaining ?? attempts.remaining) ===
                (serverAttempts?.maximum ?? attempts.maximum)
            }
          />
        ) : null}
        <SettingsRow
          icon="time-outline"
          label={t('profile.clearHistory')}
          body={t('profile.clearHistoryBody')}
          onPress={() => {
            showNativeAlert(t('history.clearTitle'), t('history.clearBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.clear'),
                style: 'destructive',
                onPress: () => clearHistory(true),
              },
            ]);
          }}
          danger={historyCount > 0}
          disabled={historyCount === 0}
        />

        {isRegistered ? (
          <>
            <SectionHeader title={t('profile.registered')} body={session?.email ?? ''} />
            <SettingsRow
              icon="key-outline"
              label={t('profile.changePassword')}
              body={t('profile.changePasswordBody')}
              onPress={() => router.push('/change-password')}
              disabled={busy}
            />
            <SettingsRow
              icon="log-out-outline"
              label={t('profile.signOut')}
              onPress={() => void signOut()}
              disabled={busy}
            />
            <SettingsRow
              icon="person-remove-outline"
              label={t('profile.deleteAccount')}
              body={t('profile.deleteAccountBody')}
              onPress={() => {
                showNativeAlert(t('profile.deleteAccountTitle'), t('profile.deleteAccountBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => void removeAccount(),
                  },
                ]);
              }}
              danger
              disabled={busy}
            />
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, minHeight: 76, justifyContent: 'center', paddingHorizontal: 13 }}>
      <AppText variant="data" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="title" color={color} style={{ marginTop: 3 }}>
        {value}
      </AppText>
    </View>
  );
}

function SectionHeader({ title, body }: { title: string; body: string }) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        marginTop: 26,
        marginBottom: 8,
        paddingBottom: 8,
        borderBottomWidth: 2,
        borderColor: colors.outline,
      }}
    >
      <AppText variant="inscription">{title}</AppText>
      {body ? (
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 3 }}>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

function ChoiceGrid({
  value,
  options,
  onChange,
}: {
  value: ThemeMode | LanguageMode;
  options: {
    value: ThemeMode | LanguageMode;
    labelKey: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[];
  onChange: (value: ThemeMode | LanguageMode) => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        borderWidth: 2,
        borderRadius: shape.control,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={t(option.labelKey)}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 76,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
              paddingVertical: 8,
              borderLeftWidth: index === 0 ? 0 : 2,
              borderColor: colors.outline,
              backgroundColor: active ? colors.cobalt : colors.surface,
              overflow: 'hidden',
            }}
          >
            <Ionicons name={option.icon} size={18} color={active ? '#FFFFFF' : colors.textMuted} />
            <AppText
              variant="data"
              color={active ? '#FFFFFF' : colors.textMuted}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              maxFontSizeMultiplier={1.2}
              style={{
                width: '100%',
                flexShrink: 1,
                marginTop: 5,
                textAlign: 'center',
                fontSize: 10,
                lineHeight: 14,
              }}
            >
              {t(option.labelKey)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  body,
  onPress,
  danger = false,
  disabled = false,
  loading = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  body?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useAppTheme();
  const accent = danger ? colors.live : colors.cobalt;
  const isDisabled = disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={{
        minHeight: body ? 72 : 58,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderWidth: 2,
        borderRadius: shape.control,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        opacity: isDisabled ? 0.36 : 1,
      }}
    >
      <View
        style={{
          width: 54,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: danger ? colors.live : colors.background,
          borderRightWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <Ionicons name={icon} size={20} color={danger ? '#FFFFFF' : accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 12 }}>
        <AppText variant="label" color={danger ? colors.danger : colors.text}>
          {label}
        </AppText>
        {body ? (
          <AppText
            variant="caption"
            color={colors.textMuted}
            numberOfLines={2}
            style={{ marginTop: 2 }}
          >
            {body}
          </AppText>
        ) : null}
      </View>
      <View
        style={{
          width: 38,
          alignItems: 'center',
          justifyContent: 'center',
          borderLeftWidth: 2,
          borderColor: colors.outline,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Ionicons name="arrow-forward" size={18} color={accent} />
        )}
      </View>
    </Pressable>
  );
}
