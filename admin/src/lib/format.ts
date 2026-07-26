const compactNumber = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

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

export const formatCompact = (value: number) => compactNumber.format(value);
export const formatNumber = (value: number) => fullNumber.format(value);
export const formatDateTime = (value: string) => dateTime.format(new Date(value));
export const formatShortDate = (value: string) => shortDate.format(new Date(value));
export const formatPercent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;
export const formatDuration = (value: number | null) =>
  value === null ? '—' : value >= 1_000 ? `${(value / 1_000).toFixed(1)} сек` : `${value} мс`;

export const formatRelativeTime = (value: string) => {
  const diff = new Date('2026-07-26T16:35:00.000Z').getTime() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
};

export const downloadCsv = (filename: string, rows: Array<Array<string | number>>) => {
  const content = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
