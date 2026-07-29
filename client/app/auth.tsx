import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router, Stack, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import {
  AuthErrorBanner,
  DevelopmentOtpNotice,
  OtpResendButton,
  OtpTextField,
} from '@/components/auth/otp-flow-ui';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { TextField } from '@/components/ui/text-field';
import { useOtpCooldown } from '@/hooks/use-otp-cooldown';
import { useTranslation } from '@/i18n';
import { nativeHeaderOptions } from '@/navigation/native-header';
import {
  cancelOtpChallenge,
  completeAuthenticationOtp,
  completePasswordReset,
  requestAuthenticationOtp,
  requestPasswordResetOtp,
  type AuthenticationOtpChallenge,
  type PasswordResetOtpChallenge,
} from '@/services/api/auth';
import { getServerHistory, syncQuota } from '@/services/api/dota';
import { loginBilling } from '@/services/billing';
import { useAppStore } from '@/store/app-store';
import { useAppTheme } from '@/theme/use-app-theme';

type AuthMode = 'login' | 'register';
type AuthStep = 'credentials' | 'authOtp' | 'resetEmail' | 'resetOtp';
type CredentialsValues = { email: string; password: string };
type EmailValues = { email: string };
type OtpValues = { code: string };
type ResetValues = { code: string; newPassword: string; confirmPassword: string };
type AuthenticatedSession = Awaited<ReturnType<typeof completeAuthenticationOtp>>;
type AuthenticationCompletion = {
  session: AuthenticatedSession;
  replaceLocalHistory: boolean;
  animated: boolean;
};

const closeAuth = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
};

export default function AuthScreen() {
  const navigation = useNavigation();
  const currentSession = useAppStore((state) => state.session);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<AuthStep>('credentials');
  const [authChallenge, setAuthChallenge] = useState<AuthenticationOtpChallenge | null>(null);
  const [resetChallenge, setResetChallenge] = useState<PasswordResetOtpChallenge | null>(null);
  const [authenticationCompletion, setAuthenticationCompletion] =
    useState<AuthenticationCompletion | null>(null);
  const [completionReady, setCompletionReady] = useState(false);
  const challengeRef = useRef<AuthenticationOtpChallenge | PasswordResetOtpChallenge | null>(null);
  const completedRef = useRef(false);
  const navigationStartedRef = useRef(false);

  const credentialsSchema = useMemo(
    () =>
      z.object({
        email: z.email(t('auth.invalidEmail')).max(254, t('auth.longEmail')),
        password: z.string().min(10, t('auth.shortPassword')).max(128, t('auth.longPassword')),
      }),
    [t],
  );
  const emailSchema = useMemo(
    () =>
      z.object({
        email: z.email(t('auth.invalidEmail')).max(254, t('auth.longEmail')),
      }),
    [t],
  );
  const otpSchema = useMemo(
    () =>
      z.object({
        code: z.string().regex(/^\d{4}$/, t('auth.invalidOtp')),
      }),
    [t],
  );
  const resetSchema = useMemo(
    () =>
      z
        .object({
          code: z.string().regex(/^\d{4}$/, t('auth.invalidOtp')),
          newPassword: z.string().min(10, t('auth.shortPassword')).max(128, t('auth.longPassword')),
          confirmPassword: z.string().min(1, t('auth.confirmPasswordRequired')),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          path: ['confirmPassword'],
          message: t('auth.passwordsDoNotMatch'),
        }),
    [t],
  );

  const credentialsForm = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });
  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
    mode: 'onSubmit',
  });
  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
    mode: 'onBlur',
  });
  const { remainingSeconds: authCooldown, start: startAuthCooldown } = useOtpCooldown();
  const { remainingSeconds: resetCooldown, start: startResetCooldown } = useOtpCooldown();

  const finishAuthentication = useCallback(
    (session: AuthenticatedSession, replaceLocalHistory: boolean) => {
      if (useAppStore.getState().session?.userId !== session.userId) return;
      completedRef.current = true;
      challengeRef.current = null;
      const expectedUserId = session.userId;
      if (replaceLocalHistory) useAppStore.getState().replaceHistory([]);
      closeAuth();
      getServerHistory()
        .then((serverHistory) => {
          const store = useAppStore.getState();
          if (store.session?.userId !== expectedUserId) return;
          if (replaceLocalHistory) store.replaceHistory(serverHistory);
          else store.mergeHistory(serverHistory);
        })
        .catch(() => {});
      void syncQuota().catch(() => {});
      if (useAppStore.getState().session?.userId === expectedUserId) {
        loginBilling(session.revenueCatAppUserId).catch(() => {});
      }
    },
    [],
  );

  const authRequest = useMutation({
    mutationFn: (values: CredentialsValues & { mode: AuthMode }) =>
      requestAuthenticationOtp(values),
    onSuccess: (challenge) => {
      startAuthCooldown(challenge.retryAfterSeconds);
      challengeRef.current = challenge;
      setAuthChallenge(challenge);
      setAuthenticationCompletion(null);
      setCompletionReady(false);
      navigationStartedRef.current = false;
      otpForm.reset();
      setStep('authOtp');
    },
  });
  const authComplete = useMutation({
    mutationFn: ({ challenge, code }: { challenge: AuthenticationOtpChallenge; code: string }) =>
      completeAuthenticationOtp(challenge, code),
    onSuccess: (session) => {
      completedRef.current = true;
      challengeRef.current = null;
      navigationStartedRef.current = false;
      setCompletionReady(false);
      setAuthenticationCompletion({
        session,
        replaceLocalHistory: mode === 'login',
        animated: true,
      });
    },
  });
  const resetRequest = useMutation({
    mutationFn: (values: EmailValues) => requestPasswordResetOtp(values.email),
    onSuccess: (challenge) => {
      startResetCooldown(challenge.retryAfterSeconds);
      challengeRef.current = challenge;
      setResetChallenge(challenge);
      const values = resetForm.getValues();
      resetForm.reset({
        code: '',
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      setStep('resetOtp');
    },
  });
  const resetComplete = useMutation({
    mutationFn: ({
      challenge,
      values,
    }: {
      challenge: PasswordResetOtpChallenge;
      values: ResetValues;
    }) =>
      completePasswordReset(challenge, {
        code: values.code,
        newPassword: values.newPassword,
      }),
    onSuccess: (session) => {
      completedRef.current = true;
      challengeRef.current = null;
      navigationStartedRef.current = false;
      setCompletionReady(true);
      setAuthenticationCompletion({
        session,
        replaceLocalHistory: true,
        animated: false,
      });
    },
  });

  const networkPending =
    authRequest.isPending ||
    authComplete.isPending ||
    resetRequest.isPending ||
    resetComplete.isPending;
  const pending = networkPending || authenticationCompletion !== null;
  const navigationLocked =
    networkPending || (authenticationCompletion?.animated === true && !completionReady);
  const interceptInternalBack = step !== 'credentials';

  useEffect(() => {
    challengeRef.current = authChallenge ?? resetChallenge;
  }, [authChallenge, resetChallenge]);

  useEffect(
    () => () => {
      if (!completedRef.current) cancelOtpChallenge(challengeRef.current);
    },
    [],
  );

  usePreventRemove(navigationLocked || interceptInternalBack, ({ data }) => {
    if (navigationStartedRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (navigationLocked) return;
    goBackStep();
  });

  useEffect(() => {
    if (
      !authenticationCompletion ||
      !completionReady ||
      networkPending ||
      navigationStartedRef.current
    ) {
      return;
    }
    if (useAppStore.getState().session?.userId !== authenticationCompletion.session.userId) {
      return;
    }

    navigationStartedRef.current = true;
    finishAuthentication(
      authenticationCompletion.session,
      authenticationCompletion.replaceLocalHistory,
    );
  }, [authenticationCompletion, completionReady, finishAuthentication, networkPending]);

  if (
    currentSession?.kind === 'registered' &&
    authChallenge === null &&
    resetChallenge === null &&
    !authComplete.isPending &&
    !resetComplete.isPending
  ) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const clearChallenge = () => {
    cancelOtpChallenge(challengeRef.current);
    challengeRef.current = null;
    setAuthChallenge(null);
    setResetChallenge(null);
    setAuthenticationCompletion(null);
    setCompletionReady(false);
    navigationStartedRef.current = false;
    authComplete.reset();
    resetComplete.reset();
  };

  const goBackStep = () => {
    if (pending) return;
    if (step === 'authOtp') {
      clearChallenge();
      otpForm.reset();
      setStep('credentials');
      return;
    }
    if (step === 'resetOtp') {
      clearChallenge();
      resetForm.reset();
      setStep('resetEmail');
      return;
    }
    if (step === 'resetEmail') {
      resetRequest.reset();
      setStep('credentials');
    }
  };

  const title =
    step === 'authOtp'
      ? t('auth.verifyTitle')
      : step === 'resetEmail' || step === 'resetOtp'
        ? t('auth.forgotTitle')
        : mode === 'login'
          ? t('auth.titleLogin')
          : t('auth.titleRegister');

  return (
    <>
      <Stack.Screen
        options={{
          ...nativeHeaderOptions(colors),
          title,
          headerLargeTitleEnabled: false,
          headerBackButtonDisplayMode: 'minimal',
          gestureEnabled: !pending && step === 'credentials',
          ...(step === 'credentials'
            ? {}
            : {
                headerLeft: () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                    disabled={pending}
                    onPress={goBackStep}
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
              }),
        }}
      />

      <Screen keyboard nativeHeader bottomInset={28}>
        {step === 'credentials' ? (
          <CredentialsStep
            mode={mode}
            currentIsGuest={currentSession?.kind === 'guest'}
            form={credentialsForm}
            pending={pending}
            error={authRequest.error}
            onModeChange={(nextMode) => {
              if (pending || nextMode === mode) return;
              authRequest.reset();
              credentialsForm.clearErrors();
              setMode(nextMode);
            }}
            onSubmit={() => {
              if (pending) return;
              void credentialsForm.handleSubmit((values) =>
                authRequest.mutate({ ...values, mode }),
              )();
            }}
            onForgot={() => {
              authRequest.reset();
              emailForm.setValue('email', credentialsForm.getValues('email'));
              setStep('resetEmail');
            }}
            onClose={closeAuth}
          />
        ) : null}

        {step === 'authOtp' && authChallenge ? (
          <OtpStep
            email={authChallenge.email}
            title={t('auth.verifyTitle')}
            body={t('auth.verifyBody')}
            form={otpForm}
            pending={pending}
            verified={authenticationCompletion?.animated === true}
            error={authComplete.error}
            resendCooldown={authCooldown}
            onSubmit={(code) => {
              if (pending) return;
              otpForm.setValue('code', code, { shouldDirty: true, shouldValidate: true });
              authComplete.mutate({ challenge: authChallenge, code });
            }}
            onEdit={() => authComplete.reset()}
            onVerifiedAnimationComplete={() => setCompletionReady(true)}
            onResend={() => {
              if (pending || authCooldown > 0) return;
              cancelOtpChallenge(authChallenge);
              authComplete.reset();
              otpForm.reset();
              authRequest.mutate(
                { ...credentialsForm.getValues(), mode },
                {
                  onError: () => {
                    challengeRef.current = null;
                    setAuthChallenge(null);
                    setStep('credentials');
                  },
                },
              );
            }}
          />
        ) : null}

        {step === 'resetEmail' ? (
          <ResetEmailStep
            form={emailForm}
            pending={pending}
            error={resetRequest.error}
            onSubmit={() => {
              if (pending) return;
              void emailForm.handleSubmit((values) => resetRequest.mutate(values))();
            }}
          />
        ) : null}

        {step === 'resetOtp' && resetChallenge ? (
          <ResetPasswordStep
            email={resetChallenge.email}
            form={resetForm}
            pending={pending}
            error={resetComplete.error}
            resendCooldown={resetCooldown}
            onSubmit={() => {
              if (pending) return;
              void resetForm.handleSubmit((values) =>
                resetComplete.mutate({ challenge: resetChallenge, values }),
              )();
            }}
            onResend={() => {
              if (pending || resetCooldown > 0) return;
              cancelOtpChallenge(resetChallenge);
              resetComplete.reset();
              resetRequest.mutate(
                { email: resetChallenge.email },
                {
                  onError: () => {
                    challengeRef.current = null;
                    setResetChallenge(null);
                    resetForm.reset();
                    setStep('resetEmail');
                  },
                },
              );
            }}
          />
        ) : null}
      </Screen>
    </>
  );
}

function CredentialsStep({
  mode,
  currentIsGuest,
  form,
  pending,
  error,
  onModeChange,
  onSubmit,
  onForgot,
  onClose,
}: {
  mode: AuthMode;
  currentIsGuest: boolean;
  form: ReturnType<typeof useForm<CredentialsValues>>;
  pending: boolean;
  error: Error | null;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: () => void;
  onForgot: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isLogin = mode === 'login';
  const title = isLogin ? t('auth.titleLogin') : t('auth.titleRegister');
  const subtitle = isLogin
    ? t('auth.subtitleLogin')
    : currentIsGuest
      ? t('auth.subtitleRegister')
      : t('auth.subtitleLogin');

  return (
    <>
      <Panel style={{ marginTop: 12, padding: 0 }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderColor: colors.outline }}>
          {(['login', 'register'] as const).map((item, index) => {
            const active = mode === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: active, disabled: pending }}
                accessibilityLabel={item === 'login' ? t('auth.login') : t('auth.register')}
                disabled={pending}
                onPress={() => onModeChange(item)}
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
              </Pressable>
            );
          })}
        </View>
        <AuthIntro
          eyebrow={t('profile.eyebrow')}
          title={title}
          body={subtitle}
          accent={isLogin ? colors.cobalt : colors.live}
        />
      </Panel>

      <Panel style={{ marginTop: 12, padding: 14, backgroundColor: colors.background }}>
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
              onSubmitEditing={onSubmit}
            />
          )}
        />
        <AuthErrorBanner error={error} />
        <Button
          label={isLogin ? t('auth.requestLoginCode') : t('auth.requestRegisterCode')}
          tone="dota"
          loading={pending}
          onPress={onSubmit}
        />
        {isLogin ? (
          <Button
            label={t('auth.forgotPassword')}
            tone="ghost"
            disabled={pending}
            onPress={onForgot}
            style={{ marginTop: 4 }}
          />
        ) : null}
        <Button
          label={t('auth.continueGuest')}
          tone="ghost"
          disabled={pending}
          onPress={onClose}
          style={{ marginTop: 4 }}
        />
      </Panel>
    </>
  );
}

function OtpStep({
  email,
  title,
  body,
  form,
  pending,
  verified,
  error,
  resendCooldown,
  onSubmit,
  onEdit,
  onVerifiedAnimationComplete,
  onResend,
}: {
  email: string;
  title: string;
  body: string;
  form: ReturnType<typeof useForm<OtpValues>>;
  pending: boolean;
  verified: boolean;
  error: Error | null;
  resendCooldown: number;
  onSubmit: (code: string) => void;
  onEdit: () => void;
  onVerifiedAnimationComplete: () => void;
  onResend: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <>
      <Panel style={{ marginTop: 12, padding: 0 }}>
        <AuthIntro
          eyebrow={t('auth.securityEyebrow')}
          title={title}
          body={`${body}\n${email}`}
          accent={colors.cobalt}
        />
      </Panel>
      <Panel style={{ marginTop: 12, padding: 14, backgroundColor: colors.background }}>
        <Controller
          control={form.control}
          name="code"
          render={({ field, fieldState }) => (
            <OtpTextField
              value={field.value}
              onChangeText={(nextValue) => {
                if (error) onEdit();
                field.onChange(nextValue);
              }}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              invalid={Boolean(error)}
              pending={pending}
              autoFocus
              onComplete={onSubmit}
              animatedVerification
              verified={verified}
              onVerifiedAnimationComplete={onVerifiedAnimationComplete}
            />
          )}
        />
        {!verified ? <DevelopmentOtpNotice /> : null}
        {!verified ? <AuthErrorBanner error={error} /> : null}
        {!verified ? (
          <OtpResendButton cooldown={resendCooldown} pending={pending} onPress={onResend} />
        ) : null}
      </Panel>
    </>
  );
}

function ResetEmailStep({
  form,
  pending,
  error,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<EmailValues>>;
  pending: boolean;
  error: Error | null;
  onSubmit: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <>
      <Panel style={{ marginTop: 12, padding: 0 }}>
        <AuthIntro
          eyebrow={t('auth.securityEyebrow')}
          title={t('auth.forgotTitle')}
          body={t('auth.forgotBody')}
          accent={colors.live}
        />
      </Panel>
      <Panel style={{ marginTop: 12, padding: 14, backgroundColor: colors.background }}>
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
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        <AuthErrorBanner error={error} />
        <Button
          label={t('auth.requestResetCode')}
          tone="dota"
          loading={pending}
          onPress={onSubmit}
        />
      </Panel>
    </>
  );
}

function ResetPasswordStep({
  email,
  form,
  pending,
  error,
  resendCooldown,
  onSubmit,
  onResend,
}: {
  email: string;
  form: ReturnType<typeof useForm<ResetValues>>;
  pending: boolean;
  error: Error | null;
  resendCooldown: number;
  onSubmit: () => void;
  onResend: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <>
      <Panel style={{ marginTop: 12, padding: 0 }}>
        <AuthIntro
          eyebrow={t('auth.securityEyebrow')}
          title={t('auth.createNewPassword')}
          body={`${t('auth.verifyBody')}\n${email}`}
          accent={colors.live}
        />
      </Panel>
      <Panel style={{ marginTop: 12, padding: 14, backgroundColor: colors.background }}>
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
              onSubmitEditing={onSubmit}
            />
          )}
        />
        <DevelopmentOtpNotice />
        <AuthErrorBanner error={error} />
        <Button label={t('auth.resetPassword')} tone="dota" loading={pending} onPress={onSubmit} />
        <OtpResendButton cooldown={resendCooldown} pending={pending} onPress={onResend} />
      </Panel>
    </>
  );
}

function AuthIntro({
  eyebrow,
  title,
  body,
  accent,
}: {
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={{ padding: 16 }}>
      <AppText variant="data" color={accent} style={{ marginBottom: 7 }}>
        {eyebrow}
      </AppText>
      <AppText variant="display" style={{ maxWidth: 440 }}>
        {title}
      </AppText>
      <AppText variant="body" color={colors.textMuted} style={{ marginTop: 9 }}>
        {body}
      </AppText>
    </View>
  );
}
