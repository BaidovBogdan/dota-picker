import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import {
  confirmBillingStatus,
  getBillingPlans,
  purchasePlan,
  restorePurchases,
} from '@/services/billing';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function PlansScreen() {
  const isWeb = Platform.OS === 'web';
  const session = useAppStore((state) => state.session);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const benefits = [t('plans.featureAttempts'), t('plans.featureSync'), t('plans.featureMeta')];
  const plansQuery = useQuery({
    queryKey: ['billing-plans', session?.userId],
    queryFn: getBillingPlans,
    enabled: Boolean(session?.userId) && !isWeb,
    retry: false,
  });
  const preferred = useMemo(
    () => plansQuery.data?.find((plan) => plan.period === 'annual') ?? plansQuery.data?.[0],
    [plansQuery.data],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = plansQuery.data?.find((plan) => plan.packageId === selectedId) ?? preferred;
  const [message, setMessage] = useState<string | null>(null);

  const purchase = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error(t('plans.empty'));
      return purchasePlan(selected.packageId);
    },
    onSuccess: async (result) => {
      if (result === 'cancelled') {
        setMessage(t('plans.cancelled'));
        return;
      }
      if (result !== 'purchased') {
        setMessage(t('plans.purchaseNotEntitled'));
        return;
      }
      const confirmed = await confirmBillingStatus().catch(() => false);
      setMessage(confirmed ? t('plans.success') : t('plans.purchaseConfirming'));
    },
  });
  const restore = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (active) => {
      if (!active) {
        setMessage(t('plans.noActiveSubscription'));
        return;
      }
      const confirmed = await confirmBillingStatus().catch(() => false);
      setMessage(confirmed ? t('plans.restored') : t('plans.restoreConfirming'));
    },
  });
  const busy = purchase.isPending || restore.isPending;
  const error = purchase.error ?? restore.error ?? plansQuery.error;

  usePreventRemove(busy, () => undefined);

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t('plans.title'),
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
          gestureEnabled: !busy,
        }}
      />

      <Screen nativeHeader bottomInset={26}>
        <Panel
          style={{
            marginTop: 12,
            padding: 0,
          }}
        >
          <View style={{ padding: 16 }}>
            <AppText variant="data" color={colors.cobalt}>
              {t('plans.eyebrow')}
            </AppText>
            <AppText variant="display" style={{ marginTop: 5 }}>
              {t('plans.title')}
            </AppText>
            <AppText
              variant="body"
              color={colors.textMuted}
              style={{ maxWidth: 500, marginTop: 9 }}
            >
              {t('plans.subtitle')}
            </AppText>
          </View>

          <View style={{ borderTopWidth: 2, borderColor: colors.outline }}>
            {benefits.map((benefit, index) => (
              <View
                key={benefit}
                style={{
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderTopWidth: index === 0 ? 0 : 2,
                  borderColor: colors.outline,
                }}
              >
                <View
                  style={{
                    width: 52,
                    alignSelf: 'stretch',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: index === 0 ? colors.cobalt : colors.background,
                    borderRightWidth: 2,
                    borderColor: colors.outline,
                  }}
                >
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={index === 0 ? '#FFFFFF' : colors.cobalt}
                  />
                </View>
                <AppText variant="label" style={{ flex: 1, paddingHorizontal: 12 }}>
                  {benefit}
                </AppText>
                <AppText variant="data" color={colors.textMuted} style={{ paddingRight: 10 }}>
                  {String(index + 1).padStart(2, '0')}
                </AppText>
              </View>
            ))}
          </View>
        </Panel>

        <View
          style={{
            marginTop: 22,
            marginBottom: 8,
            paddingBottom: 8,
            borderBottomWidth: 2,
            borderColor: colors.outline,
          }}
        >
          <AppText variant="inscription">{t('profile.plan')}</AppText>
        </View>

        {isWeb ? (
          <BroadcastNotice
            icon="phone-portrait-outline"
            title={t('plans.webOnlyTitle')}
            body={t('plans.webOnlyBody')}
          />
        ) : plansQuery.isLoading ? (
          <LoadingOffers />
        ) : plansQuery.data && plansQuery.data.length > 0 ? (
          <View
            accessibilityRole="radiogroup"
            style={{
              overflow: 'hidden',
              borderWidth: 2,
              borderRadius: shape.card,
              borderColor: colors.outline,
            }}
          >
            {plansQuery.data.map((plan, index) => {
              const active = plan.packageId === selected?.packageId;
              return (
                <Pressable
                  key={plan.packageId}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={t('plans.choose', { plan: plan.title })}
                  disabled={busy}
                  onPress={() => setSelectedId(plan.packageId)}
                  style={{
                    minHeight: 78,
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    borderTopWidth: index === 0 ? 0 : 2,
                    borderColor: colors.outline,
                    backgroundColor: active ? colors.cobalt : colors.surface,
                    opacity: busy ? 0.58 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRightWidth: 2,
                      borderColor: active ? '#FFFFFF' : colors.outline,
                      backgroundColor: active ? colors.live : colors.background,
                    }}
                  >
                    <Ionicons
                      name={active ? 'checkmark' : 'add'}
                      size={21}
                      color={active ? '#FFFFFF' : colors.textMuted}
                    />
                  </View>
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      justifyContent: 'center',
                      paddingHorizontal: 12,
                    }}
                  >
                    <AppText
                      variant="inscription"
                      color={active ? '#FFFFFF' : colors.text}
                      numberOfLines={2}
                    >
                      {plan.title}
                    </AppText>
                  </View>
                  <View
                    style={{
                      minWidth: 96,
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      paddingHorizontal: 12,
                      borderLeftWidth: 2,
                      borderColor: active ? '#FFFFFF' : colors.outline,
                    }}
                  >
                    <AppText
                      variant="title"
                      color={active ? '#FFFFFF' : colors.cobalt}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {plan.price}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <BroadcastNotice icon="storefront-outline" title={t('plans.empty')} />
        )}

        {!isWeb && error ? (
          <View
            accessibilityRole="alert"
            style={{
              marginTop: 12,
              padding: 11,
              borderWidth: 2,
              borderRadius: shape.control,
              borderColor: colors.live,
              backgroundColor: colors.surface,
            }}
          >
            <AppText variant="data" color={colors.live}>
              {t('plans.error')}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
              {error.message}
            </AppText>
          </View>
        ) : null}

        {message ? (
          <View
            accessibilityRole="alert"
            style={{
              marginTop: 12,
              padding: 11,
              borderWidth: 2,
              borderRadius: shape.control,
              borderColor: colors.cobalt,
              backgroundColor: colors.surface,
            }}
          >
            <AppText variant="data" color={colors.cobalt}>
              {message}
            </AppText>
          </View>
        ) : null}

        {!isWeb ? (
          <>
            <Button
              label={
                session?.plan === 'pro'
                  ? t('plans.current')
                  : t('plans.choose', { plan: selected?.title ?? t('common.pro') })
              }
              tone="dota"
              loading={purchase.isPending}
              disabled={!selected || session?.plan === 'pro' || busy}
              onPress={() => purchase.mutate()}
              style={{ marginTop: 18 }}
            />
            <Button
              label={t('plans.restore')}
              tone="secondary"
              loading={restore.isPending}
              disabled={busy}
              onPress={() => restore.mutate()}
              style={{ marginTop: 8 }}
            />
            <AppText
              variant="caption"
              color={colors.textMuted}
              style={{ textAlign: 'center', marginTop: 12 }}
            >
              {t('plans.legal')}
            </AppText>
          </>
        ) : null}
      </Screen>
    </>
  );
}

function BroadcastNotice({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={{
        minHeight: 92,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderWidth: 2,
        borderRadius: shape.card,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: 64,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.live,
          borderRightWidth: 2,
          borderColor: colors.outline,
        }}
      >
        <Ionicons name={icon} size={24} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 13 }}>
        <AppText variant="inscription">{title}</AppText>
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
          {body ?? t('plans.subtitle')}
        </AppText>
      </View>
    </View>
  );
}

function LoadingOffers() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('plans.loading')}
      style={{
        overflow: 'hidden',
        borderWidth: 2,
        borderRadius: shape.card,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
      }}
    >
      {[0, 1].map((index) => (
        <View
          key={index}
          style={{
            minHeight: 76,
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderTopWidth: index === 0 ? 0 : 2,
            borderColor: colors.outline,
          }}
        >
          <View
            style={{
              width: index === 0 ? '54%' : '68%',
              height: 9,
              borderRadius: 5,
              backgroundColor: colors.grid,
            }}
          />
          <View
            style={{
              width: index === 0 ? '32%' : '40%',
              height: 7,
              marginTop: 10,
              borderRadius: 4,
              backgroundColor: colors.surfaceElevated,
            }}
          />
        </View>
      ))}
      <View
        style={{
          minHeight: 34,
          justifyContent: 'center',
          paddingHorizontal: 10,
          borderTopWidth: 2,
          borderColor: colors.outline,
          backgroundColor: colors.cobalt,
        }}
      >
        <AppText variant="data" color="#FFFFFF">
          {t('plans.loading')}
        </AppText>
      </View>
    </View>
  );
}
