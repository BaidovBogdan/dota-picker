import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EnvelopeSimpleIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  ShieldCheckIcon,
  TranslateIcon,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import authHeroesLoop from '../assets/auth-heroes-loop.mp4';
import authHeroesPoster from '../assets/auth-heroes-poster.jpg';
import { desktop } from '../bridge';
import { BrandMark } from '../components/brand-mark';
import { ImageReveal, PageReveal } from '../components/motion';
import { OtpCodeField } from '../components/otp-code-field';
import { Button, InputField } from '../components/ui';
import { WindowControls } from '../components/window-controls';
import { useI18n } from '../i18n';
import { useAppStore } from '../store';
import type { Language, OtpChallenge } from '../types';

type AuthMode = 'login' | 'register' | 'reset';

type Credentials = {
  email: string;
  password: string;
  confirmPassword?: string;
};

type PendingAuth = {
  challenge: OtpChallenge;
  credentials: Credentials;
};

type Translate = (russian: string, english: string) => string;

const getLabels = (
  text: Translate,
): Record<AuthMode, { title: string; description: string; action: string }> => ({
  login: {
    title: text('Вход в Counterpick', 'Sign in to Counterpick'),
    description: text(
      'История и лимит попыток останутся на одном аккаунте.',
      'Your history and attempt limit stay with one account.',
    ),
    action: text('Получить код', 'Get code'),
  },
  register: {
    title: text('Новый аккаунт', 'Create an account'),
    description: text(
      'Подтвердите почту и сразу включайте ассистента.',
      'Verify your email and start using the assistant right away.',
    ),
    action: text('Подтвердить почту', 'Verify email'),
  },
  reset: {
    title: text('Восстановление доступа', 'Restore access'),
    description: text(
      'Задайте новый пароль и подтвердите его кодом из письма.',
      'Set a new password and confirm it with the code from your email.',
    ),
    action: text('Получить код', 'Get code'),
  },
});

const getSchema = (mode: AuthMode, text: Translate) =>
  z
    .object({
      email: z.string().trim().email(text('Введите корректный email', 'Enter a valid email')),
      password: z
        .string()
        .min(10, text('Минимум 10 символов', 'Use at least 10 characters'))
        .max(128, text('Не более 128 символов', 'Use no more than 128 characters')),
      confirmPassword: z.string().optional(),
    })
    .superRefine((value, context) => {
      if (mode !== 'login' && value.confirmPassword !== value.password) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: text('Пароли не совпадают', 'Passwords do not match'),
          path: ['confirmPassword'],
        });
      }
    });

const getOtpSchema = (text: Translate) =>
  z.object({
    code: z
      .string()
      .trim()
      .regex(
        /^\d{4}$/,
        text('Введите четырёхзначный код из письма', 'Enter the four-digit code from your email'),
      ),
  });

function getErrorMessage(error: unknown, language: Language, text: Translate) {
  const fallback = text(
    'Не удалось выполнить запрос. Попробуйте ещё раз.',
    'Could not complete the request. Please try again.',
  );
  if (!(error instanceof Error) || !error.message) return fallback;
  const message = error.message.replace(/^\[[A-Z0-9_]+]\s*/, '');
  if (language === 'en' && /[А-ЯЁа-яё]/u.test(message)) return fallback;
  return message;
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mediaQuery) return;
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [pending, setPending] = useState<PendingAuth | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoAtSeam, setVideoAtSeam] = useState(true);
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { language, text } = useI18n();
  const setAccount = useAppStore((state) => state.setAccount);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const schema = useMemo(() => getSchema(mode, text), [language, mode]);
  const otpSchema = useMemo(() => getOtpSchema(text), [language]);

  const credentialsForm = useForm<Credentials>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
    mode: 'onBlur',
  });
  const otpForm = useForm<{ code: string }>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  });

  const requestMutation = useMutation({
    mutationFn: async (credentials: Credentials) => {
      const purpose = mode === 'reset' ? 'password_reset' : mode;
      const challenge = await desktop.session.requestOtp({
        purpose,
        email: credentials.email.trim().toLowerCase(),
        ...(mode === 'login' ? { password: credentials.password } : {}),
      });
      return { challenge, credentials };
    },
    onSuccess: (value) => {
      setPending(value);
      otpForm.reset();
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      if (!pending) throw new Error(text('Сначала запросите код', 'Request a code first'));
      const input = {
        email: pending.credentials.email.trim().toLowerCase(),
        password: pending.credentials.password,
        challengeId: pending.challenge.challengeId,
        code,
      };
      if (mode === 'login') return desktop.session.login(input);
      if (mode === 'register') return desktop.session.register(input);
      return desktop.session.reset({
        email: input.email,
        newPassword: input.password,
        challengeId: input.challengeId,
        code: input.code,
      });
    },
    onSuccess: async (account) => {
      setAccount(account);
      queryClient.setQueryData(['session'], { authenticated: true, account });
      navigate('/', { replace: true });
    },
  });
  const languageMutation = useMutation({
    mutationFn: (nextLanguage: Language) => desktop.preferences.update({ language: nextLanguage }),
    onMutate: (nextLanguage) => {
      const previous = useAppStore.getState().preferences;
      if (previous) setPreferences({ ...previous, language: nextLanguage });
      return { previous };
    },
    onError: (_error, _nextLanguage, context) => {
      if (context?.previous) setPreferences(context.previous);
    },
    onSuccess: setPreferences,
  });

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPending(null);
    requestMutation.reset();
    verifyMutation.reset();
    credentialsForm.reset();
    otpForm.reset();
  };

  const leaveOtp = () => {
    setPending(null);
    requestMutation.reset();
    verifyMutation.reset();
    otpForm.reset();
  };

  const resendOtp = () => {
    if (!pending) return;
    otpForm.reset();
    verifyMutation.reset();
    requestMutation.reset();
    requestMutation.mutate(pending.credentials);
  };

  const copy = getLabels(text)[mode];
  const busy = requestMutation.isPending || verifyMutation.isPending;

  useEffect(() => {
    if (reducedMotion || videoFailed) return;
    const video = videoRef.current;
    if (!video) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
        return;
      }
      void video.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    handleVisibilityChange();
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reducedMotion, videoFailed]);

  return (
    <div className="auth-layout">
      <header className="auth-titlebar">
        <div className="auth-titlebar__brand">
          <BrandMark />
          <span>COUNTERPICK</span>
        </div>
        <div className="auth-titlebar__actions">
          <button
            className="auth-language-toggle"
            type="button"
            aria-label={text('Переключить на английский', 'Switch to Russian')}
            title={text('English', 'Русский')}
            disabled={languageMutation.isPending}
            onClick={() => languageMutation.mutate(language === 'ru' ? 'en' : 'ru')}
          >
            <TranslateIcon size={15} weight="duotone" aria-hidden />
            <span>{language === 'ru' ? 'EN' : 'RU'}</span>
          </button>
          <WindowControls />
        </div>
      </header>
      <ImageReveal className="auth-backdrop">
        <img className="auth-backdrop__poster" src={authHeroesPoster} alt="" aria-hidden />
        {!reducedMotion && !videoFailed ? (
          <>
            <video
              ref={videoRef}
              className={`auth-backdrop__video${videoReady ? ' is-ready' : ''}`}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={authHeroesPoster}
              disablePictureInPicture
              aria-hidden
              tabIndex={-1}
              onCanPlay={() => setVideoReady(true)}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                setVideoAtSeam(
                  video.currentTime < 0.75 || video.duration - video.currentTime < 0.75,
                );
              }}
              onError={() => {
                setVideoReady(false);
                setVideoFailed(true);
              }}
            >
              <source src={authHeroesLoop} type="video/mp4" />
            </video>
            <div
              className={`auth-backdrop__loop-mask${videoAtSeam ? ' is-visible' : ''}`}
              aria-hidden
            />
          </>
        ) : null}
        <div className="auth-backdrop__veil" />
      </ImageReveal>
      <main className="auth-stage">
        <section className="auth-intro">
          <h1>
            {text('Читайте драфт.', 'Read the draft.')}
            <span>{text('Отвечайте до последнего пика.', 'Answer every pick.')}</span>
          </h1>
          <p>
            {text(
              'Замечает пики, считает контрпик и сохраняет доказательства.',
              'Detects picks, calculates counters, and keeps the evidence.',
            )}
          </p>
        </section>
        <PageReveal>
          <section className="auth-console" data-reveal>
            {!pending ? (
              <>
                <div className="auth-console__heading">
                  <div>
                    <h2>{copy.title}</h2>
                    <p>{copy.description}</p>
                  </div>
                </div>
                {mode !== 'reset' ? (
                  <div
                    className="auth-mode-switch"
                    data-mode={mode}
                    aria-label={text('Выберите действие', 'Choose an action')}
                  >
                    <button
                      type="button"
                      className={mode === 'login' ? 'is-active' : ''}
                      onClick={() => selectMode('login')}
                    >
                      {text('Войти', 'Sign in')}
                    </button>
                    <button
                      type="button"
                      className={mode === 'register' ? 'is-active' : ''}
                      onClick={() => selectMode('register')}
                    >
                      {text('Регистрация', 'Register')}
                    </button>
                  </div>
                ) : null}
                <form
                  className="auth-form"
                  onSubmit={credentialsForm.handleSubmit((value) =>
                    requestMutation.mutate(value),
                  )}
                  noValidate
                >
                  <InputField
                    label="Email"
                    error={credentialsForm.formState.errors.email?.message}
                  >
                    <span className="input-shell">
                      <EnvelopeSimpleIcon size={18} weight="duotone" aria-hidden />
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...credentialsForm.register('email')}
                      />
                    </span>
                  </InputField>
                  <InputField
                    label={mode === 'reset' ? text('Новый пароль', 'New password') : text('Пароль', 'Password')}
                    error={credentialsForm.formState.errors.password?.message}
                  >
                    <span className="input-shell">
                      <KeyIcon size={18} weight="duotone" aria-hidden />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        placeholder={text('Не менее 10 символов', 'At least 10 characters')}
                        {...credentialsForm.register('password')}
                      />
                      <button
                        type="button"
                        className="input-shell__action"
                        aria-label={
                          showPassword
                            ? text('Скрыть пароль', 'Hide password')
                            : text('Показать пароль', 'Show password')
                        }
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? (
                          <EyeSlashIcon size={18} weight="duotone" />
                        ) : (
                          <EyeIcon size={18} weight="duotone" />
                        )}
                      </button>
                    </span>
                  </InputField>
                  {mode !== 'login' ? (
                    <InputField
                      label={text('Повторите пароль', 'Confirm password')}
                      error={credentialsForm.formState.errors.confirmPassword?.message}
                    >
                      <span className="input-shell">
                        <ShieldCheckIcon size={18} weight="duotone" aria-hidden />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder={text('Тот же пароль', 'Enter the same password')}
                          {...credentialsForm.register('confirmPassword')}
                        />
                      </span>
                    </InputField>
                  ) : null}
                  {requestMutation.isError ? (
                    <p className="form-error" role="alert">
                      {getErrorMessage(requestMutation.error, language, text)}
                    </p>
                  ) : null}
                  <Button type="submit" loading={requestMutation.isPending}>
                    {copy.action}
                    <ArrowRightIcon size={18} weight="bold" aria-hidden />
                  </Button>
                </form>
                <div className="auth-console__footer">
                  {mode === 'login' ? (
                    <button type="button" onClick={() => selectMode('reset')}>
                      {text('Забыли пароль?', 'Forgot your password?')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => selectMode('login')}>
                      <ArrowLeftIcon size={16} weight="bold" aria-hidden />
                      {text('Вернуться ко входу', 'Back to sign in')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <form
                className="otp-form"
                onSubmit={(event) => event.preventDefault()}
                noValidate
              >
                <button
                  type="button"
                  className="auth-back"
                  onClick={leaveOtp}
                  disabled={busy}
                >
                  <ArrowLeftIcon size={17} weight="bold" aria-hidden />
                  {text('Назад', 'Back')}
                </button>
                <EnvelopeSimpleIcon
                  className="otp-form__icon"
                  size={34}
                  weight="duotone"
                  aria-hidden
                />
                <h2>{text('Введите код из письма', 'Enter the code from your email')}</h2>
                <p>
                  {text('Отправили его на', 'We sent it to')}{' '}
                  <strong>{pending.credentials.email}</strong>.
                </p>
                <Controller
                  control={otpForm.control}
                  name="code"
                  render={({ field, fieldState }) => (
                    <OtpCodeField
                      name={field.name}
                      value={field.value}
                      label={text('Одноразовый код', 'One-time code')}
                      hint={text(
                        'В тестовой среде используйте 1234',
                        'Use 1234 in the test environment',
                      )}
                      error={
                        fieldState.error?.message ??
                        (verifyMutation.isError
                          ? getErrorMessage(verifyMutation.error, language, text)
                          : undefined)
                      }
                      autoFocus
                      pending={verifyMutation.isPending}
                      disabled={requestMutation.isPending}
                      onBlur={field.onBlur}
                      onChange={(code) => {
                        if (verifyMutation.isError) verifyMutation.reset();
                        otpForm.clearErrors('code');
                        field.onChange(code);
                      }}
                      onComplete={(code) => verifyMutation.mutate({ code })}
                    />
                  )}
                />
                <button
                  className="quiet-action"
                  type="button"
                  disabled={busy}
                  onClick={resendOtp}
                >
                  {text('Отправить новый код', 'Send a new code')}
                </button>
              </form>
            )}
          </section>
        </PageReveal>
      </main>
    </div>
  );
}
