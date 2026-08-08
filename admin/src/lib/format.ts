import type { AnalysisSource } from '../types';

const fullNumber = new Intl.NumberFormat('ru-RU');

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const shortDate = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
});

export const formatNumber = (value: number) => fullNumber.format(value);
export const formatCount = (value: number, forms: readonly [string, string, string]) => {
  const absolute = Math.abs(value);
  const remainder100 = absolute % 100;
  const remainder10 = absolute % 10;
  const form = remainder100 >= 11 && remainder100 <= 14
    ? forms[2]
    : remainder10 === 1
      ? forms[0]
      : remainder10 >= 2 && remainder10 <= 4
        ? forms[1]
        : forms[2];
  return `${formatNumber(value)} ${form}`;
};
export const formatDateTime = (value: string) => dateTime.format(new Date(value));
export const formatShortDate = (value: string) => shortDate.format(new Date(value));
export const formatPercent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;
export const formatAnalysisSource = (source: AnalysisSource) => ({
  manual: 'Вручную',
  photo: 'Фото',
  overwolf: 'Overwolf Live',
})[source];
export const formatDuration = (value: number | null) =>
  value === null ? '—' : value >= 1_000 ? `${(value / 1_000).toFixed(1)} сек` : `${value} мс`;

export const formatRelativeTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'неизвестно';
  const diff = Date.now() - timestamp;
  if (diff < -60_000) return formatDateTime(value);
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
};
