import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { MatchReadyLoader } from '@/components/analysis/match-ready-loader';
import { showNativeAlert } from '@/components/feedback/native-alert';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n';
import { analyzeDraft } from '@/services/api/dota';
import { resolveDraftAccess } from '@/services/draft-access';
import { flushAppPersistence, useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

function BroadcastState({
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  live = false,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  live?: boolean;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      accessibilityLiveRegion={live ? 'assertive' : 'polite'}
      style={{ flex: 1, justifyContent: 'center', paddingVertical: 24 }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 440,
          alignSelf: 'center',
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderRadius: shape.card,
          borderColor: colors.outline,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            minHeight: 38,
            flexDirection: 'row',
            alignItems: 'stretch',
            borderBottomWidth: 2,
            borderBottomColor: colors.outline,
          }}
        >
          <View
            style={{
              minWidth: 68,
              paddingHorizontal: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.live,
            }}
          >
            <AppText variant="data" color={colors.onPrimary}>
              {t('brand.live')}
            </AppText>
          </View>
          <View
            style={{
              flex: 1,
              paddingHorizontal: 11,
              alignItems: 'flex-start',
              justifyContent: 'center',
            }}
          >
            <AppText variant="data" color={colors.textMuted}>
              {t('analysis.title')}
            </AppText>
          </View>
          <View style={{ width: 18, backgroundColor: colors.cobalt }} />
        </View>

        <View style={{ padding: 18 }}>
          <AppText
            variant="display"
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.66}
            style={{ maxWidth: 360 }}
          >
            {title}
          </AppText>
          <View
            style={{
              width: 72,
              height: 7,
              marginTop: 13,
              marginBottom: 13,
              backgroundColor: colors.cobalt,
            }}
          />
          <AppText variant="body" color={colors.textMuted} style={{ maxWidth: 370 }}>
            {message}
          </AppText>
          <Button label={actionLabel} tone="dota" onPress={onAction} style={{ marginTop: 20 }} />
          {secondaryLabel && onSecondary ? (
            <Button
              label={secondaryLabel}
              tone="ghost"
              onPress={onSecondary}
              style={{ marginTop: 4 }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function AnalysisScreen() {
  const { idempotencyKey } = useLocalSearchParams<{ idempotencyKey?: string }>();
  const draft = useAppStore((state) => state.draft);
  const attempts = useAppStore((state) => state.attempts);
  const plan = useAppStore((state) => state.session?.plan);
  const userId = useAppStore((state) => state.session?.userId);
  const isRemoteBootstrapPending = useAppStore((state) => state.isRemoteBootstrapPending);
  const saveAnalysis = useAppStore((state) => state.saveAnalysis);
  const navigation = useNavigation();
  const handled = useRef(false);
  const allowNavigation = useRef(false);
  const [launchUserId] = useState(userId);
  const [quotaAccepted, setQuotaAccepted] = useState(false);
  const { t } = useTranslation();
  const actionKey =
    typeof idempotencyKey === 'string' &&
    idempotencyKey.length >= 16 &&
    idempotencyKey.length <= 128
      ? idempotencyKey
      : null;
  const accessStatus = quotaAccepted
    ? 'allowed'
    : resolveDraftAccess({
        remaining: attempts.remaining,
        plan,
        isRemoteBootstrapPending,
      });
  const valid = Boolean(
    actionKey &&
    launchUserId &&
    userId === launchUserId &&
    draft.position &&
    draft.enemies.length > 0 &&
    accessStatus === 'allowed',
  );
  const query = useQuery({
    queryKey: [
      'analysis',
      launchUserId,
      actionKey,
      draft.position,
      draft.rank,
      draft.source,
      draft.allies.join('-'),
      draft.enemies.join('-'),
    ],
    queryFn: ({ signal }) => {
      if (!actionKey || !launchUserId) throw new Error(t('analysis.error'));
      setQuotaAccepted(true);
      return analyzeDraft(draft, actionKey, { expectedUserId: launchUserId, signal });
    },
    enabled: valid,
    networkMode: 'always',
    retry: false,
  });
  usePreventRemove(valid && query.isFetching, ({ data }) => {
    if (allowNavigation.current) navigation.dispatch(data.action);
  });

  useEffect(() => {
    if (!query.data || handled.current) return;
    if (useAppStore.getState().session?.userId !== launchUserId) return;
    const result = query.data;
    handled.current = true;

    const persist = () => {
      saveAnalysis(result, actionKey ?? undefined);
      void flushAppPersistence().catch(() => {
        showNativeAlert(t('analysis.saveWarningTitle'), t('analysis.saveWarningBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.retry'), onPress: persist },
        ]);
      });
    };

    persist();
    allowNavigation.current = true;
    router.replace({ pathname: '/result/[id]', params: { id: result.id } });
  }, [actionKey, launchUserId, query.data, saveAnalysis, t]);

  if (!valid) {
    const quotaPending = accessStatus === 'pending';
    const quotaExhausted = accessStatus === 'upgrade' || accessStatus === 'waitForRefill';
    const sessionChanged = Boolean(launchUserId && userId !== launchUserId);
    const invalidLaunch = !actionKey || !launchUserId;
    const shouldOpenPlans = !sessionChanged && !invalidLaunch && accessStatus === 'upgrade';
    const shouldShowRefill = !sessionChanged && !invalidLaunch && accessStatus === 'waitForRefill';
    const title = sessionChanged
      ? t('analysis.changedSession')
      : invalidLaunch
        ? t('analysis.error')
        : quotaPending
          ? t('common.loading')
          : quotaExhausted
            ? t('home.noAttempts')
            : !draft.position
              ? t('home.needPosition')
              : t('home.needEnemy');
    const message = sessionChanged
      ? t('analysis.changedSession')
      : invalidLaunch
        ? t('analysis.invalidLaunch')
        : quotaPending
          ? t('common.loading')
          : quotaExhausted
            ? t(
                accessStatus === 'waitForRefill'
                  ? 'analysis.quotaBodyPro'
                  : 'analysis.quotaBodyFree',
              )
            : t('analysis.draftNotReady');

    return (
      <Screen scroll={false}>
        <BroadcastState
          title={title}
          message={message}
          actionLabel={
            shouldOpenPlans
              ? t('profile.upgrade')
              : shouldShowRefill
                ? t('common.confirm')
                : t('nav.draft')
          }
          onAction={() => {
            if (shouldShowRefill) {
              showNativeAlert(t('home.noAttempts'), t('analysis.quotaBodyPro'), [
                { text: t('common.confirm') },
              ]);
              return;
            }
            router.replace(shouldOpenPlans ? '/plans' : '/(tabs)');
          }}
        />
      </Screen>
    );
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : t('analysis.error');

    return (
      <Screen scroll={false}>
        <BroadcastState
          title={t('analysis.error')}
          message={message}
          actionLabel={t('common.retry')}
          onAction={() => void query.refetch()}
          secondaryLabel={t('nav.draft')}
          onSecondary={() => router.replace('/(tabs)')}
          live
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 24 }}>
        <MatchReadyLoader />
      </View>
    </Screen>
  );
}
