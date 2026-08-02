import {
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import { desktop } from '../bridge';
import { useI18n } from '../i18n';
import { useAppStore } from '../store';
import type { UpdateState } from '../types';
import { Button } from './ui';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatBytes(value: number, locale: string): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: index === 0 ? 0 : 1,
  }).format(amount)} ${units[index]}`;
}

function ProgressRing({ percent }: { percent: number }) {
  const normalized = clampPercent(percent);
  return (
    <span className="update-card__ring" aria-hidden>
      <svg viewBox="0 0 24 24">
        <circle className="update-card__ring-track" cx="12" cy="12" r="9" pathLength="100" />
        <circle
          className="update-card__ring-value"
          cx="12"
          cy="12"
          r="9"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - normalized}
        />
      </svg>
    </span>
  );
}

function UpdateDialog({
  open,
  update,
  onClose,
}: {
  open: boolean;
  update: UpdateState;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { locale, text } = useI18n();
  const busy = ['downloading', 'downloaded', 'installing'].includes(update.status);
  const percent = clampPercent(update.progress?.percent ?? 0);
  const canDownload = update.status === 'available' || update.status === 'error';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open && busy) titleRef.current?.focus({ preventScroll: true });
  }, [busy, open]);

  const beginUpdate = () => {
    void desktop.updates.downloadAndInstall().catch(() => undefined);
  };

  return (
    <dialog
      id="counterpick-update-dialog"
      className="update-dialog"
      ref={dialogRef}
      aria-labelledby="update-dialog-title"
      aria-describedby="update-dialog-description"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
    >
      <div className="update-dialog__glow" aria-hidden />
      {!busy ? (
        <button
          className="update-dialog__close"
          type="button"
          aria-label={text('Закрыть', 'Close')}
          onClick={onClose}
        >
          <XIcon size={18} aria-hidden />
        </button>
      ) : null}
      <div className="update-dialog__icon" aria-hidden>
        {update.status === 'error'
          ? <WarningCircleIcon size={27} weight="duotone" />
          : <DownloadSimpleIcon size={27} weight="duotone" />}
      </div>
      <p className="update-dialog__eyebrow">
        {text('Обновление Counterpick', 'Counterpick update')}
      </p>
      <h2 id="update-dialog-title" ref={titleRef} tabIndex={-1}>
        {text(
          `Обновить приложение до версии ${update.availableVersion ?? ''}`,
          `Update to version ${update.availableVersion ?? ''}`,
        )}
      </h2>
      <p id="update-dialog-description" className="update-dialog__description">
        {text(
          'Обновление будет скачано и проверено. После загрузки Counterpick автоматически перезапустится. Начинайте, когда будете готовы выйти из текущего драфта.',
          'The update will be downloaded and verified. Counterpick will restart automatically when it is ready. Start when you are ready to leave the current draft.',
        )}
      </p>

      <div className="update-dialog__versions" aria-label={text('Версии приложения', 'Application versions')}>
        <span>
          <small>{text('Сейчас', 'Current')}</small>
          <strong>{update.currentVersion}</strong>
        </span>
        <i aria-hidden />
        <span>
          <small>{text('Новая', 'New')}</small>
          <strong>{update.availableVersion ?? '—'}</strong>
        </span>
      </div>

      {busy ? (
        <div className="update-dialog__progress">
          <div className="update-dialog__progress-heading">
            <strong role="status" aria-live="polite" aria-atomic="true">
              {update.status === 'installing'
                ? text('Перезапускаем Counterpick', 'Restarting Counterpick')
                : update.status === 'downloaded'
                  ? text('Подготавливаем установку', 'Preparing installation')
                  : text('Скачиваем обновление', 'Downloading update')}
            </strong>
            <span>{Math.round(percent)}%</span>
          </div>
          <progress
            max="100"
            value={percent}
            aria-label={text('Прогресс загрузки', 'Download progress')}
            aria-valuetext={`${Math.round(percent)}%`}
          />
          <div className="update-dialog__progress-meta">
            <span>
              {update.progress?.total
                ? `${formatBytes(update.progress.transferred, locale)} / ${formatBytes(update.progress.total, locale)}`
                : text('Подготавливаем загрузку', 'Preparing download')}
            </span>
            {update.progress?.bytesPerSecond ? (
              <span>{formatBytes(update.progress.bytesPerSecond, locale)}/s</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {update.releaseNotes && canDownload ? (
        <div className="update-dialog__notes">
          <strong>{text('Что нового', 'What is new')}</strong>
          <p>{update.releaseNotes}</p>
        </div>
      ) : null}

      {update.status === 'error' ? (
        <p className="update-dialog__error" role="alert">
          {text(
            'Не удалось завершить обновление. Проверьте подключение и попробуйте ещё раз.',
            update.error ?? 'The update could not be completed. Check your connection and try again.',
          )}
        </p>
      ) : null}

      {canDownload ? (
        <div className="update-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {text('Не сейчас', 'Not now')}
          </Button>
          <Button onClick={beginUpdate}>
            {update.status === 'error'
              ? <ArrowClockwiseIcon size={17} aria-hidden />
              : <DownloadSimpleIcon size={17} aria-hidden />}
            {update.status === 'error'
              ? text('Попробовать снова', 'Try again')
              : text('Скачать и перезапустить', 'Download and restart')}
          </Button>
        </div>
      ) : null}
    </dialog>
  );
}

export function AppUpdate() {
  const update = useAppStore((state) => state.update);
  const { text } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!update?.availableVersion) return null;
  const percent = clampPercent(update.progress?.percent ?? 0);
  const downloading = update.status === 'downloading';
  const finishing = update.status === 'downloaded' || update.status === 'installing';
  const failed = update.status === 'error';
  const title = failed
    ? text('Загрузка прервана', 'Download paused')
    : finishing
      ? text('Перезапускаем', 'Restarting')
      : downloading
        ? text('Скачиваем обновление', 'Downloading update')
        : text('Доступно обновление', 'Update available');
  const detail = downloading
    ? `${Math.round(percent)}%`
    : finishing
      ? text('Почти готово', 'Almost ready')
      : failed
        ? text('Нажмите, чтобы повторить', 'Click to try again')
        : `Counterpick ${update.availableVersion}`;
  const accessibleLabel = `${title}. ${detail}`;

  return (
    <>
      <button
        className={`update-card update-card--${update.status}`}
        type="button"
        onClick={() => setDialogOpen(true)}
        aria-haspopup="dialog"
        aria-controls="counterpick-update-dialog"
        aria-expanded={dialogOpen}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        <span className="update-card__icon">
          {downloading || finishing
            ? <ProgressRing percent={finishing ? 100 : percent} />
            : failed
              ? <WarningCircleIcon size={19} weight="duotone" aria-hidden />
              : <DownloadSimpleIcon size={19} weight="duotone" aria-hidden />}
        </span>
        <span className="update-card__copy">
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
        {downloading ? <span className="update-card__percent">{Math.round(percent)}%</span> : null}
      </button>
      <UpdateDialog open={dialogOpen} update={update} onClose={() => setDialogOpen(false)} />
    </>
  );
}
