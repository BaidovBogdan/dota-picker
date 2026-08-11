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
import { useI18n } from '../i18n';
import { OtpCodeField } from '../components/otp-code-field';
import { Badge, Button, InputField, Page, Panel, Stat } from '../components/ui';
import { useAppStore } from '../store';
import type { OtpChallenge } from '../types';
import {
  accountQueryKey,
  clearAccountQueryCache,
  sessionQueryKey,
} from '../../shared/account-query-cache';

type Translate = (russian: string, english: string) => string;

const createPasswordSchema = (text: Translate) => z
  .object({
    currentPassword: z
      .string()
      .min(10, text('Минимум 10 символов', 'At least 10 characters'))
      .max(128, text('Не более 128 символов', 'No more than 128 characters')),
    newPassword: z
      .string()
      .min(10, text('Минимум 10 символов', 'At least 10 characters'))
      .max(128, text('Не более 128 символов', 'No more than 128 characters')),
    confirmPassword: z.string(),
    code: z
      .string()
      .regex(/^\d{4}$/, text('Введите четырёхзначный код', 'Enter the four-digit code')),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: text('Пароли не совпадают', 'Passwords do not match'),
    path: ['confirmPassword'],
  });

type PasswordForm = z.infer<ReturnType<typeof createPasswordSchema>>;

export function AccountPage() {
  const account = useAppStore((state) => state.account);
  const accountId = account?.id ?? null;
  const setAccount = useAppStore((state) => state.setAccount);
  const [passwordChallenge, setPasswordChallenge] = useState<OtpChallenge | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteValue, setDeleteValue] = useState('');
  const deleteRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { language, text } = useI18n();
  const passwordSchema = createPasswordSchema(text);
  const deleteConfirmation = text('УДАЛИТЬ', 'DELETE');
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
    queryKey: accountQueryKey(accountId ?? 'anonymous', 'billing'),
    queryFn: desktop.billing.status,
    enabled: Boolean(accountId),
  });
  const quotaQuery = useQuery({
    queryKey: accountQueryKey(accountId ?? 'anonymous', 'quota'),
    queryFn: desktop.session.quota,
    initialData: account?.quota,
    enabled: Boolean(accountId),
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
      if (!passwordChallenge) {
        throw new Error(text('Сначала запросите код', 'Request a code first'));
      }
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
    mutationFn: desktop.session.logout,
    onSuccess: async () => {
      await clearAccountQueryCache(queryClient);
      setAccount(null);
      queryClient.setQueryData(sessionQueryKey, { authenticated: false, account: null });
      navigate('/auth', { replace: true });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: desktop.session.deleteAccount,
    onSuccess: async () => {
      await clearAccountQueryCache(queryClient);
      setAccount(null);
      queryClient.clear();
      queryClient.setQueryData(sessionQueryKey, { authenticated: false, account: null });
      navigate('/auth', { replace: true });
    },
  });

  const quota = quotaQuery.data ?? account?.quota;
  const isPro = billingQuery.data?.active || quota?.plan === 'pro';

  useEffect(() => {
    if (deleteOpen) deleteRef.current?.focus();
  }, [deleteOpen]);

  useEffect(() => {
    passwordForm.clearErrors();
  }, [language, passwordForm.clearErrors]);

  return (
    <Page
      title={text('Профиль и план', 'Profile and plan')}
      description={text(
        'Управляйте доступом, лимитом попыток и безопасностью аккаунта.',
        'Manage access, attempt limits, and account security.',
      )}
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
              <span>{text('Профиль', 'Profile')}</span>
              <h2>{account?.email?.split('@')[0] ?? text('Пользователь', 'User')}</h2>
              <p>
                <EnvelopeIcon size={15} weight="duotone" aria-hidden />
                {account?.email}
              </p>
            </div>
          </div>
          <div className="identity-card__session">
            <span>
              <span className="status-dot" />
              {text('Этот компьютер', 'This computer')}
            </span>
            <Button
              variant="secondary"
              loading={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <SignOutIcon size={16} aria-hidden />
              {text('Выйти', 'Sign out')}
            </Button>
          </div>
        </Panel>

        <Panel className="plan-card" id="plan">
          <div className="plan-card__head">
            <span>
              <SparkleIcon size={18} weight="duotone" aria-hidden />
              {text('Текущий план', 'Current plan')}
            </span>
            <strong>{isPro ? 'PRO' : 'FREE'}</strong>
          </div>
          <div className="plan-card__quota">
            <Stat label={text('Осталось', 'Remaining')} value={quota?.remaining ?? 0} />
            <Stat label={text('Лимит', 'Limit')} value={quota?.limit ?? 0} />
            <Stat
              label={text('Обновление', 'Refresh')}
              value={formatRelative(quota?.nextRefillAt, language)}
            />
          </div>
          {isPro ? (
            <p>
              {text('Активен до', 'Active until')}{' '}
              {formatDate(billingQuery.data?.expiresAt ?? quota?.planExpiresAt, language)}
            </p>
          ) : (
            <div className="plan-card__mobile">
              <ArrowRightIcon size={17} aria-hidden />
              <span>
                <strong>
                  {text(
                    'Покупка PRO пока доступна в мобильном приложении',
                    'PRO is currently available for purchase in the mobile app',
                  )}
                </strong>
                <small>
                  {text(
                    'Десктопное приложение использует тот же аккаунт и общий лимит',
                    'The desktop app uses the same account and shared limit',
                  )}
                </small>
              </span>
            </div>
          )}
        </Panel>
      </section>

      <section className="profile-columns" data-reveal>
        <Panel className="security-card">
          <div className="card-heading card-heading--large">
            <div>
              <span>{text('Пароль', 'Password')}</span>
              <small>
                {text('Подтверждение через одноразовый код', 'Confirmation with a one-time code')}
              </small>
            </div>
            <KeyIcon size={20} weight="duotone" aria-hidden />
          </div>
          {!passwordChallenge ? (
            <div className="security-card__idle">
              <p>
                {text('Код придёт на', 'The code will be sent to')}{' '}
                <strong>{account?.email}</strong>.{' '}
                {text(
                  'До его ввода пароль останется прежним.',
                  'Your password will remain unchanged until you enter it.',
                )}
              </p>
              {otpMutation.isError ? (
                <p className="form-error" role="alert">
                  {text('Не удалось отправить код.', 'Could not send the code.')}
                </p>
              ) : null}
              <Button
                variant="secondary"
                loading={otpMutation.isPending}
                onClick={() => otpMutation.mutate()}
              >
                {text('Получить код и изменить пароль', 'Get code and change password')}
              </Button>
            </div>
          ) : (
            <form
              className="password-form"
              onSubmit={passwordForm.handleSubmit((value) => passwordMutation.mutate(value))}
              noValidate
            >
              <InputField
                label={text('Текущий пароль', 'Current password')}
                error={passwordForm.formState.errors.currentPassword?.message}
              >
                <input type="password" autoComplete="current-password" {...passwordForm.register('currentPassword')} />
              </InputField>
              <div className="field-row">
                <InputField
                  label={text('Новый пароль', 'New password')}
                  error={passwordForm.formState.errors.newPassword?.message}
                >
                  <input type="password" autoComplete="new-password" {...passwordForm.register('newPassword')} />
                </InputField>
                <InputField
                  label={text('Повторите пароль', 'Confirm password')}
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
                    label={text('Код из письма', 'Code from the email')}
                    hint={text('В тестовой среде: 1234', 'In the test environment: 1234')}
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
                  {text(
                    'Не удалось изменить пароль. Проверьте код и текущий пароль.',
                    'Could not change the password. Check the code and your current password.',
                  )}
                </p>
              ) : null}
              <div className="form-actions">
                <Button
                  type="button"
                  variant="quiet"
                  onClick={cancelPasswordChange}
                >
                  {text('Отмена', 'Cancel')}
                </Button>
                <Button type="submit" loading={passwordMutation.isPending}>
                  {text('Сохранить новый пароль', 'Save new password')}
                </Button>
              </div>
            </form>
          )}
        </Panel>

      </section>

      <section className="danger-zone" data-reveal>
        <div>
          <p className="eyebrow">{text('Опасная зона', 'Danger zone')}</p>
          <h2>{text('Удалить аккаунт и историю', 'Delete account and history')}</h2>
          <p>
            {text(
              'Действие необратимо. Локальный ассистент будет выключен.',
              'This action cannot be undone. The local assistant will be turned off.',
            )}
          </p>
        </div>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          <TrashIcon size={16} aria-hidden />
          {text('Удалить аккаунт', 'Delete account')}
        </Button>
      </section>

      {passwordMutation.isSuccess ? (
        <div className="toast" role="status">
          <CheckCircleIcon size={17} weight="duotone" aria-hidden />
          {text('Пароль изменён', 'Password changed')}
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
            <h2 id="delete-title">
              {text('Удалить аккаунт навсегда?', 'Delete account permanently?')}
            </h2>
            <p>
              {text('Введите', 'Enter')} <strong>{deleteConfirmation}</strong>{' '}
              {text(
                'для подтверждения удаления аккаунта, истории и отзывов.',
                'to confirm deletion of your account, history, and reviews.',
              )}
            </p>
            <input
              value={deleteValue}
              onChange={(event) => setDeleteValue(event.target.value)}
              placeholder={deleteConfirmation}
              autoFocus
            />
            {deleteMutation.isError ? (
              <p className="form-error" role="alert">
                {text('Не удалось удалить аккаунт.', 'Could not delete the account.')}
              </p>
            ) : null}
            <div>
              <Button
                variant="secondary"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteOpen(false)}
              >
                {text('Отмена', 'Cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deleteValue !== deleteConfirmation}
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {text('Удалить навсегда', 'Delete permanently')}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </Page>
  );
}
