import { zodResolver } from '@hookform/resolvers/zod';
import { usePreventRemove } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TouchableOpacity, View } from 'react-native';
import { z } from 'zod';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { TextField } from '@/components/ui/text-field';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import { authenticate } from '@/services/api/auth';
import { beginAuthTransition } from '@/services/api/client';
import { getServerHistory, syncQuota } from '@/services/api/dota';
import { loginBilling } from '@/services/billing';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type FormValues = {
  email: string;
  password: string;
};

const closeAuth = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
};

export default function AuthScreen() {
  const currentSession = useAppStore((state) => state.session);
  const { t } = useTranslation();
  const schema = useMemo(
    () =>
      z.object({
        email: z.email(t('auth.invalidEmail')).max(254, t('auth.longEmail')),
        password: z.string().min(10, t('auth.shortPassword')).max(128, t('auth.longPassword')),
      }),
    [t],
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });
  const authMode = useAppStore((state) => state.session?.kind === 'guest');
  const mutation = useMutation({
    mutationFn: (values: FormValues & { mode: 'login' | 'register' }) => authenticate(values),
    onSuccess: (session, variables) => {
      if (useAppStore.getState().session?.userId !== session.userId) return;
      const expectedUserId = session.userId;
      if (variables.mode === 'login') useAppStore.getState().replaceHistory([]);
      closeAuth();
      getServerHistory()
        .then((serverHistory) => {
          const store = useAppStore.getState();
          if (store.session?.userId !== expectedUserId) return;
          if (variables.mode === 'login') store.replaceHistory(serverHistory);
          else store.mergeHistory(serverHistory);
        })
        .catch(() => {});
      void syncQuota().catch(() => {});
      if (useAppStore.getState().session?.userId === expectedUserId) {
        loginBilling(session.revenueCatAppUserId).catch(() => {});
      }
    },
  });

  if (currentSession?.kind === 'registered') return <Redirect href="/(tabs)/profile" />;

  return (
    <AuthForm
      currentIsGuest={Boolean(authMode || currentSession?.kind === 'guest')}
      form={form}
      mutation={mutation}
    />
  );
}

type AuthFormProps = {
  currentIsGuest: boolean;
  form: ReturnType<typeof useForm<FormValues>>;
  mutation: ReturnType<
    typeof useMutation<
      Awaited<ReturnType<typeof authenticate>>,
      Error,
      FormValues & { mode: 'login' | 'register' }
    >
  >;
};

function AuthForm({ currentIsGuest, form, mutation }: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const activeRequestRef = useRef(false);
  const intentVersionRef = useRef(0);
  const pending = mutation.isPending || activeRequestRef.current;
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  useEffect(
    () => () => {
      intentVersionRef.current += 1;
      if (activeRequestRef.current && useAppStore.getState().session?.kind !== 'registered') {
        beginAuthTransition();
      }
    },
    [],
  );

  usePreventRemove(pending, () => undefined);

  const close = () => {
    if (activeRequestRef.current || mutation.isPending) return;
    intentVersionRef.current += 1;
    closeAuth();
  };

  const changeMode = (nextMode: 'login' | 'register') => {
    if (activeRequestRef.current || mutation.isPending || nextMode === mode) return;
    intentVersionRef.current += 1;
    mutation.reset();
    form.clearErrors();
    setMode(nextMode);
  };

  const submit = () => {
    if (activeRequestRef.current || mutation.isPending) return;
    const intentVersion = intentVersionRef.current;
    const submitMode = mode;
    void form.handleSubmit((values) => {
      if (activeRequestRef.current || intentVersion !== intentVersionRef.current) return;
      activeRequestRef.current = true;
      mutation.mutate(
        { ...values, mode: submitMode },
        {
          onSettled: () => {
            if (intentVersion === intentVersionRef.current) activeRequestRef.current = false;
          },
        },
      );
    })();
  };

  const isLogin = mode === 'login';
  const title = isLogin ? t('auth.titleLogin') : t('auth.titleRegister');
  const subtitle = isLogin
    ? t('auth.subtitleLogin')
    : currentIsGuest
      ? t('auth.subtitleRegister')
      : t('auth.subtitleLogin');

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title,
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
          gestureEnabled: !pending,
        }}
      />

      <Screen keyboard nativeHeader bottomInset={28}>
        <Panel
          style={{
            marginTop: 12,
            padding: 0,
          }}
        >
          <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderColor: colors.outline }}>
            {(['login', 'register'] as const).map((item, index) => {
              const active = mode === item;
              return (
                <TouchableOpacity
                  key={item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active, disabled: pending }}
                  accessibilityLabel={item === 'login' ? t('auth.login') : t('auth.register')}
                  activeOpacity={0.74}
                  disabled={pending}
                  onPress={() => changeMode(item)}
                  style={{
                    flex: 1,
                    minHeight: 54,
                    minWidth: 0,
                    paddingHorizontal: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderLeftWidth: index === 0 ? 0 : 2,
                    borderColor: colors.outline,
                    backgroundColor: active
                      ? item === 'login'
                        ? colors.cobalt
                        : colors.live
                      : colors.surface,
                  }}
                >
                  <AppText
                    variant="inscription"
                    color={active ? '#FFFFFF' : colors.textMuted}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    maxFontSizeMultiplier={1.5}
                    style={{ width: '100%', textAlign: 'center', fontSize: 17, lineHeight: 20 }}
                  >
                    {item === 'login' ? t('auth.login') : t('auth.register')}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ padding: 16 }}>
            <AppText
              variant="data"
              color={isLogin ? colors.cobalt : colors.live}
              style={{ marginBottom: 7 }}
            >
              {t('profile.eyebrow')}
            </AppText>
            <AppText variant="display" style={{ maxWidth: 420 }}>
              {title}
            </AppText>
            <AppText
              variant="body"
              color={colors.textMuted}
              style={{ maxWidth: 480, marginTop: 9 }}
            >
              {subtitle}
            </AppText>
          </View>
        </Panel>

        <Panel
          style={{
            marginTop: 12,
            padding: 14,
            backgroundColor: colors.background,
          }}
        >
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label={t('auth.email')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="email-address"
                autoComplete="email"
                maxLength={254}
                editable={!pending}
              />
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <TextField
                label={t('auth.password')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                secureTextEntry
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                maxLength={128}
                editable={!pending}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            )}
          />

          {mutation.isError ? (
            <View
              accessibilityRole="alert"
              style={{
                marginBottom: 14,
                padding: 10,
                borderWidth: 2,
                borderRadius: shape.control,
                borderColor: colors.live,
                backgroundColor: colors.surface,
              }}
            >
              <AppText variant="data" color={colors.live}>
                {t('auth.error')}
              </AppText>
              <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
                {mutation.error.message}
              </AppText>
            </View>
          ) : null}

          <Button
            label={isLogin ? t('auth.submitLogin') : t('auth.submitRegister')}
            tone="dota"
            loading={pending}
            onPress={submit}
          />
          <Button
            label={t('auth.continueGuest')}
            tone="ghost"
            disabled={pending}
            onPress={close}
            style={{ marginTop: 8 }}
          />
        </Panel>
      </Screen>
    </>
  );
}
