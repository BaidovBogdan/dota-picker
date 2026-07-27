import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router, Stack } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import {
  AuthErrorBanner,
  DevelopmentOtpNotice,
  OtpResendButton,
  OtpTextField,
} from '@/components/auth/otp-flow-ui';
import { showNativeAlert } from '@/components/feedback/native-alert';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { TextField } from '@/components/ui/text-field';
import { useTranslation } from '@/i18n';
import { useOtpCooldown } from '@/hooks/use-otp-cooldown';
import { nativeHeaderOptions } from '@/navigation/native-header';
import {
  cancelOtpChallenge,
  completePasswordChange,
  requestPasswordChangeOtp,
  type PasswordChangeOtpChallenge,
} from '@/services/api/auth';
import { useAppStore } from '@/store/app-store';
import { shape } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ChangePasswordValues = {
  code: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export default function ChangePasswordScreen() {
  const session = useAppStore((state) => state.session);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<PasswordChangeOtpChallenge | null>(null);
  const challengeRef = useRef<PasswordChangeOtpChallenge | null>(null);
  const completedRef = useRef(false);
  const schema = useMemo(
    () =>
      z
        .object({
          code: z.string().regex(/^\d{4}$/, t('auth.invalidOtp')),
          currentPassword: z
            .string()
            .min(10, t('auth.shortPassword'))
            .max(128, t('auth.longPassword')),
          newPassword: z.string().min(10, t('auth.shortPassword')).max(128, t('auth.longPassword')),
          confirmPassword: z.string().min(1, t('auth.confirmPasswordRequired')),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          path: ['confirmPassword'],
          message: t('auth.passwordsDoNotMatch'),
        })
        .refine((values) => values.currentPassword !== values.newPassword, {
          path: ['newPassword'],
          message: t('auth.passwordMustChange'),
        }),
    [t],
  );
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });
  const { remainingSeconds: resendCooldown, start: startResendCooldown } = useOtpCooldown();

  const requestMutation = useMutation({
    mutationFn: requestPasswordChangeOtp,
    onSuccess: (nextChallenge) => {
      startResendCooldown(nextChallenge.retryAfterSeconds);
      challengeRef.current = nextChallenge;
      setChallenge(nextChallenge);
      const values = form.getValues();
      form.reset({ ...values, code: '' });
    },
  });
  const completeMutation = useMutation({
    mutationFn: ({
      currentChallenge,
      values,
    }: {
      currentChallenge: PasswordChangeOtpChallenge;
      values: ChangePasswordValues;
    }) =>
      completePasswordChange(currentChallenge, {
        code: values.code,
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: (nextSession) => {
      if (useAppStore.getState().session?.userId !== nextSession.userId) return;
      completedRef.current = true;
      challengeRef.current = null;
      showNativeAlert(t('auth.changePasswordTitle'), t('auth.changePasswordSuccess'), [
        { text: t('common.confirm'), onPress: () => router.back() },
      ]);
    },
  });
  const pending = requestMutation.isPending || completeMutation.isPending;

  useEffect(() => {
    challengeRef.current = challenge;
  }, [challenge]);

  useEffect(
    () => () => {
      if (!completedRef.current) cancelOtpChallenge(challengeRef.current);
    },
    [],
  );

  usePreventRemove(pending, () => undefined);

  if (session?.kind !== 'registered') return <Redirect href="/(tabs)/profile" />;

  const returnToRequest = () => {
    if (pending) return;
    cancelOtpChallenge(challengeRef.current);
    challengeRef.current = null;
    setChallenge(null);
    completeMutation.reset();
    form.reset();
  };

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title: t('auth.changePasswordTitle'),
          headerLargeTitleEnabled: false,
          gestureEnabled: !pending,
          ...(challenge
            ? {
                headerLeft: () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                    disabled={pending}
                    onPress={returnToRequest}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: -8,
                      opacity: pending ? 0.4 : 1,
                    }}
                  >
                    <Ionicons name="chevron-back" size={28} color={colors.cobalt} />
                  </Pressable>
                ),
              }
            : {}),
        }}
      />

      <Screen keyboard nativeHeader bottomInset={28}>
        <Panel style={{ marginTop: 12, padding: 16 }}>
          <AppText variant="data" color={colors.cobalt} style={{ marginBottom: 7 }}>
            {t('auth.securityEyebrow')}
          </AppText>
          <AppText variant="display">
            {challenge ? t('auth.createNewPassword') : t('auth.changePasswordTitle')}
          </AppText>
          <AppText variant="body" color={colors.textMuted} style={{ marginTop: 9 }}>
            {challenge
              ? `${t('auth.verifyBody')}\n${session.email ?? ''}`
              : t('auth.changePasswordBody')}
          </AppText>
        </Panel>

        <Panel style={{ marginTop: 12, padding: 14, backgroundColor: colors.background }}>
          {!challenge ? (
            <>
              <View
                style={{
                  minHeight: 58,
                  marginBottom: 16,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderRadius: shape.control,
                  borderColor: colors.outline,
                  backgroundColor: colors.surface,
                }}
              >
                <AppText variant="data" color={colors.textMuted}>
                  {t('auth.email')}
                </AppText>
                <AppText variant="label" style={{ marginTop: 3 }}>
                  {session.email ?? ''}
                </AppText>
              </View>
              <AuthErrorBanner error={requestMutation.error} />
              <Button
                label={t('auth.requestChangeCode')}
                tone="dota"
                loading={pending}
                onPress={() => requestMutation.mutate()}
              />
            </>
          ) : (
            <>
              <Controller
                control={form.control}
                name="code"
                render={({ field, fieldState }) => (
                  <OtpTextField
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    pending={pending}
                    autoFocus
                  />
                )}
              />
              <Controller
                control={form.control}
                name="currentPassword"
                render={({ field, fieldState }) => (
                  <TextField
                    label={t('auth.currentPassword')}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secureTextEntry
                    autoComplete="current-password"
                    maxLength={128}
                    editable={!pending}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="newPassword"
                render={({ field, fieldState }) => (
                  <TextField
                    label={t('auth.newPassword')}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secureTextEntry
                    autoComplete="new-password"
                    maxLength={128}
                    editable={!pending}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="confirmPassword"
                render={({ field, fieldState }) => (
                  <TextField
                    label={t('auth.confirmPassword')}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secureTextEntry
                    autoComplete="new-password"
                    maxLength={128}
                    editable={!pending}
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      if (pending) return;
                      void form.handleSubmit((values) =>
                        completeMutation.mutate({ currentChallenge: challenge, values }),
                      )();
                    }}
                  />
                )}
              />
              <DevelopmentOtpNotice />
              <AuthErrorBanner error={completeMutation.error} />
              <Button
                label={t('auth.changePassword')}
                tone="dota"
                loading={pending}
                onPress={() => {
                  if (pending) return;
                  void form.handleSubmit((values) =>
                    completeMutation.mutate({ currentChallenge: challenge, values }),
                  )();
                }}
              />
              <OtpResendButton
                cooldown={resendCooldown}
                pending={pending}
                onPress={() => {
                  if (pending || resendCooldown > 0) return;
                  cancelOtpChallenge(challenge);
                  completeMutation.reset();
                  requestMutation.mutate(undefined, {
                    onError: () => {
                      challengeRef.current = null;
                      setChallenge(null);
                      form.reset();
                    },
                  });
                }}
              />
            </>
          )}
        </Panel>
      </Screen>
    </>
  );
}
