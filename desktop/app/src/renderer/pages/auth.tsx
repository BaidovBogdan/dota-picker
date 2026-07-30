import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EnvelopeSimpleIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import authRivalsLoopMp4 from '../assets/auth-rivals-loop.mp4';
import authRivalsLoopWebm from '../assets/auth-rivals-loop.webm';
import authRivalsPoster from '../assets/auth-rivals-poster.webp';
import { desktop } from '../bridge';
import { BrandMark } from '../components/brand-mark';
import { ImageReveal, PageReveal } from '../components/motion';
import { OtpCodeField } from '../components/otp-code-field';
import { Button, InputField } from '../components/ui';
import { WindowControls } from '../components/window-controls';
import { useAppStore } from '../store';
import type { OtpChallenge } from '../types';

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

const labels: Record<AuthMode, { title: string; description: string; action: string }> = {
  login: {
    title: 'Вход в Counterpick',
    description: 'История и лимит попыток останутся на одном аккаунте.',
    action: 'Получить код',
  },
  register: {
    title: 'Новый аккаунт',
    description: 'Подтвердите почту и сразу включайте ассистента.',
    action: 'Подтвердить почту',
  },
  reset: {
    title: 'Восстановление доступа',
    description: 'Задайте новый пароль и подтвердите его кодом из письма.',
    action: 'Получить код',
  },
};

const getSchema = (mode: AuthMode) =>
  z
    .object({
      email: z.string().trim().email('Введите корректный email'),
      password: z.string().min(10, 'Минимум 10 символов').max(128, 'Не более 128 символов'),
      confirmPassword: z.string().optional(),
    })
    .superRefine((value, context) => {
      if (mode !== 'login' && value.confirmPassword !== value.password) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Пароли не совпадают',
          path: ['confirmPassword'],
        });
      }
    });

const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Введите четырёхзначный код из письма'),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
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
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAccount = useAppStore((state) => state.setAccount);
  const schema = useMemo(() => getSchema(mode), [mode]);

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
      if (!pending) throw new Error('Сначала запросите код');
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

  const copy = labels[mode];
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
        <WindowControls />
      </header>
      <ImageReveal className="auth-backdrop">
        <img className="auth-backdrop__poster" src={authRivalsPoster} alt="" aria-hidden />
        {!reducedMotion && !videoFailed ? (
          <video
            ref={videoRef}
            className="auth-backdrop__video"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={authRivalsPoster}
            disablePictureInPicture
            aria-hidden
            tabIndex={-1}
            onError={() => setVideoFailed(true)}
          >
            <source src={authRivalsLoopWebm} type="video/webm" />
            <source src={authRivalsLoopMp4} type="video/mp4" />
          </video>
        ) : null}
        <div className="auth-backdrop__veil" />
      </ImageReveal>
      <main className="auth-stage">
        <section className="auth-intro">
          <h1>
            Читайте драфт.
            <span>Отвечайте до последнего пика.</span>
          </h1>
          <p>Замечает пики, считает контрпик и сохраняет доказательства.</p>
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
                    aria-label="Выберите действие"
                  >
                    <button
                      type="button"
                      className={mode === 'login' ? 'is-active' : ''}
                      onClick={() => selectMode('login')}
                    >
                      Войти
                    </button>
                    <button
                      type="button"
                      className={mode === 'register' ? 'is-active' : ''}
                      onClick={() => selectMode('register')}
                    >
                      Регистрация
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
                    label={mode === 'reset' ? 'Новый пароль' : 'Пароль'}
                    error={credentialsForm.formState.errors.password?.message}
                  >
                    <span className="input-shell">
                      <KeyIcon size={18} weight="duotone" aria-hidden />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        placeholder="Не менее 10 символов"
                        {...credentialsForm.register('password')}
                      />
                      <button
                        type="button"
                        className="input-shell__action"
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
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
                      label="Повторите пароль"
                      error={credentialsForm.formState.errors.confirmPassword?.message}
                    >
                      <span className="input-shell">
                        <ShieldCheckIcon size={18} weight="duotone" aria-hidden />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Тот же пароль"
                          {...credentialsForm.register('confirmPassword')}
                        />
                      </span>
                    </InputField>
                  ) : null}
                  {requestMutation.isError ? (
                    <p className="form-error" role="alert">
                      {getErrorMessage(requestMutation.error)}
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
                      Забыли пароль?
                    </button>
                  ) : (
                    <button type="button" onClick={() => selectMode('login')}>
                      <ArrowLeftIcon size={16} weight="bold" aria-hidden />
                      Вернуться ко входу
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
                  Назад
                </button>
                <EnvelopeSimpleIcon
                  className="otp-form__icon"
                  size={34}
                  weight="duotone"
                  aria-hidden
                />
                <h2>Введите код из письма</h2>
                <p>
                  Отправили его на <strong>{pending.credentials.email}</strong>.
                </p>
                <Controller
                  control={otpForm.control}
                  name="code"
                  render={({ field, fieldState }) => (
                    <OtpCodeField
                      name={field.name}
                      value={field.value}
                      label="Одноразовый код"
                      hint="В тестовой среде используйте 1234"
                      error={
                        fieldState.error?.message ??
                        (verifyMutation.isError
                          ? getErrorMessage(verifyMutation.error)
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
                  Отправить новый код
                </button>
              </form>
            )}
          </section>
        </PageReveal>
      </main>
    </div>
  );
}
