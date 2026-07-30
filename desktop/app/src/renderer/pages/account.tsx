import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  KeyIcon,
  SignOutIcon,
  SparkleIcon,
  TrashIcon,
  UserCircleIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import { desktop } from '../bridge';
import { formatDate, formatRelative } from '../format';
import { OtpCodeField } from '../components/otp-code-field';
import { Badge, Button, InputField, Page, Panel, Stat } from '../components/ui';
import { useAppStore } from '../store';
import type { OtpChallenge } from '../types';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(10, 'Минимум 10 символов').max(128),
    newPassword: z.string().min(10, 'Минимум 10 символов').max(128),
    confirmPassword: z.string(),
    code: z.string().regex(/^\d{4}$/, 'Введите четырёхзначный код'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export function AccountPage() {
  const account = useAppStore((state) => state.account);
  const setAccount = useAppStore((state) => state.setAccount);
  const engine = useAppStore((state) => state.engine);
  const setEngine = useAppStore((state) => state.setEngine);
  const [passwordChallenge, setPasswordChallenge] = useState<OtpChallenge | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteValue, setDeleteValue] = useState('');
  const deleteRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      code: '',
    },
  });

  const billingQuery = useQuery({
    queryKey: ['billing'],
    queryFn: desktop.billing.status,
  });
  const quotaQuery = useQuery({
    queryKey: ['quota'],
    queryFn: desktop.session.quota,
    initialData: account?.quota,
  });
  const otpMutation = useMutation({
    mutationFn: () => desktop.session.requestOtp({ purpose: 'password_change' }),
    onSuccess: (challenge) => {
      setPasswordChallenge(challenge);
      passwordForm.setValue('code', '');
      passwordForm.clearErrors('code');
    },
  });
  const passwordMutation = useMutation({
    mutationFn: (value: PasswordForm) => {
      if (!passwordChallenge) throw new Error('Сначала запросите код');
      return desktop.session.change({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        challengeId: passwordChallenge.challengeId,
        code: value.code,
      });
    },
    onSuccess: (nextAccount) => {
      setAccount(nextAccount);
      setPasswordChallenge(null);
      passwordForm.reset();
    },
  });

  const cancelPasswordChange = () => {
    setPasswordChallenge(null);
    passwordForm.setValue('code', '');
    passwordForm.clearErrors('code');
    passwordMutation.reset();
  };

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (engine?.enabled) {
        setEngine(await desktop.engine.setEnabled(false));
      }
      await desktop.session.logout();
    },
    onSuccess: async () => {
      setAccount(null);
      queryClient.setQueryData(['session'], { authenticated: false, account: null });
      await queryClient.cancelQueries();
      navigate('/auth', { replace: true });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (engine?.enabled) {
        setEngine(await desktop.engine.setEnabled(false));
      }
      await desktop.session.deleteAccount();
    },
    onSuccess: async () => {
      setAccount(null);
      queryClient.clear();
      navigate('/auth', { replace: true });
    },
  });

  const quota = quotaQuery.data ?? account?.quota;
  const isPro = billingQuery.data?.active || quota?.plan === 'pro';

  useEffect(() => {
    if (deleteOpen) deleteRef.current?.focus();
  }, [deleteOpen]);

  return (
    <Page
      title="Профиль и план"
      description="Управляйте доступом, лимитом попыток и безопасностью аккаунта."
      actions={<Badge tone={isPro ? 'teal' : 'neutral'}>{isPro ? 'PRO' : 'FREE'}</Badge>}
      className="account-page"
    >
      <section className="profile-grid" data-reveal>
        <Panel className="identity-card">
          <div className="identity-card__account">
            <span className="identity-card__avatar">
              <UserCircleIcon size={31} weight="duotone" aria-hidden />
            </span>
            <div>
              <span>Профиль</span>
              <h2>{account?.email?.split('@')[0] ?? 'Пользователь'}</h2>
              <p>
                <EnvelopeIcon size={15} weight="duotone" aria-hidden />
                {account?.email}
              </p>
            </div>
          </div>
          <div className="identity-card__session">
            <span>
              <span className="status-dot" />
              Этот компьютер
            </span>
            <Button
              variant="secondary"
              loading={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <SignOutIcon size={16} aria-hidden />
              Выйти
            </Button>
          </div>
        </Panel>

        <Panel className="plan-card" id="plan">
          <div className="plan-card__head">
            <span>
              <SparkleIcon size={18} weight="duotone" aria-hidden />
              Текущий план
            </span>
            <strong>{isPro ? 'PRO' : 'FREE'}</strong>
          </div>
          <div className="plan-card__quota">
            <Stat label="Осталось" value={quota?.remaining ?? 0} />
            <Stat label="Лимит" value={quota?.limit ?? 0} />
            <Stat
              label="Обновление"
              value={formatRelative(quota?.nextRefillAt)}
            />
          </div>
          {isPro ? (
            <p>
              Активен до {formatDate(billingQuery.data?.expiresAt ?? quota?.planExpiresAt)}
            </p>
          ) : (
            <div className="plan-card__mobile">
              <ArrowRightIcon size={17} aria-hidden />
              <span>
                <strong>Покупка PRO пока доступна в мобильном приложении</strong>
                <small>Desktop использует тот же аккаунт и общий лимит</small>
              </span>
            </div>
          )}
        </Panel>
      </section>

      <section className="profile-columns" data-reveal>
        <Panel className="security-card">
          <div className="card-heading card-heading--large">
            <div>
              <span>Пароль</span>
              <small>Подтверждение через одноразовый код</small>
            </div>
            <KeyIcon size={20} weight="duotone" aria-hidden />
          </div>
          {!passwordChallenge ? (
            <div className="security-card__idle">
              <p>
                Код придёт на <strong>{account?.email}</strong>. До его ввода пароль
                останется прежним.
              </p>
              {otpMutation.isError ? (
                <p className="form-error" role="alert">
                  Не удалось отправить код.
                </p>
              ) : null}
              <Button
                variant="secondary"
                loading={otpMutation.isPending}
                onClick={() => otpMutation.mutate()}
              >
                Получить код и изменить пароль
              </Button>
            </div>
          ) : (
            <form
              className="password-form"
              onSubmit={passwordForm.handleSubmit((value) => passwordMutation.mutate(value))}
              noValidate
            >
              <InputField
                label="Текущий пароль"
                error={passwordForm.formState.errors.currentPassword?.message}
              >
                <input type="password" autoComplete="current-password" {...passwordForm.register('currentPassword')} />
              </InputField>
              <div className="field-row">
                <InputField
                  label="Новый пароль"
                  error={passwordForm.formState.errors.newPassword?.message}
                >
                  <input type="password" autoComplete="new-password" {...passwordForm.register('newPassword')} />
                </InputField>
                <InputField
                  label="Повторите пароль"
                  error={passwordForm.formState.errors.confirmPassword?.message}
                >
                  <input type="password" autoComplete="new-password" {...passwordForm.register('confirmPassword')} />
                </InputField>
              </div>
              <Controller
                control={passwordForm.control}
                name="code"
                render={({ field, fieldState }) => (
                  <OtpCodeField
                    name={field.name}
                    value={field.value}
                    label="Код из письма"
                    hint="В тестовой среде: 1234"
                    error={fieldState.error?.message}
                    pending={passwordMutation.isPending}
                    onBlur={field.onBlur}
                    onChange={(code) => {
                      if (passwordMutation.isError) passwordMutation.reset();
                      passwordForm.clearErrors('code');
                      field.onChange(code);
                    }}
                  />
                )}
              />
              {passwordMutation.isError ? (
                <p className="form-error" role="alert">
                  Не удалось изменить пароль. Проверьте код и текущий пароль.
                </p>
              ) : null}
              <div className="form-actions">
                <Button
                  type="button"
                  variant="quiet"
                  onClick={cancelPasswordChange}
                >
                  Отмена
                </Button>
                <Button type="submit" loading={passwordMutation.isPending}>
                  Сохранить новый пароль
                </Button>
              </div>
            </form>
          )}
        </Panel>

      </section>

      <section className="danger-zone" data-reveal>
        <div>
          <p className="eyebrow">Опасная зона</p>
          <h2>Удалить аккаунт и историю</h2>
          <p>Действие необратимо. Локальный ассистент будет выключен.</p>
        </div>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          <TrashIcon size={16} aria-hidden />
          Удалить аккаунт
        </Button>
      </section>

      {passwordMutation.isSuccess ? (
        <div className="toast" role="status">
          <CheckCircleIcon size={17} weight="duotone" aria-hidden />
          Пароль изменён
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="modal-backdrop">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            ref={deleteRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !deleteMutation.isPending) setDeleteOpen(false);
            }}
          >
            <span className="delete-dialog__icon">
              <TrashIcon size={22} weight="duotone" aria-hidden />
            </span>
            <h2 id="delete-title">Удалить аккаунт навсегда?</h2>
            <p>
              Введите <strong>УДАЛИТЬ</strong>, чтобы подтвердить удаление аккаунта,
              истории и отзывов.
            </p>
            <input
              value={deleteValue}
              onChange={(event) => setDeleteValue(event.target.value)}
              placeholder="УДАЛИТЬ"
              autoFocus
            />
            {deleteMutation.isError ? (
              <p className="form-error" role="alert">
                Не удалось удалить аккаунт.
              </p>
            ) : null}
            <div>
              <Button
                variant="secondary"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteOpen(false)}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                disabled={deleteValue !== 'УДАЛИТЬ'}
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Удалить навсегда
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </Page>
  );
}
