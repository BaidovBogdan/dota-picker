import type { Position } from '@/types/domain';
import { translate } from '@/i18n';

export const positions: { id: Position; short: string; labelKey: string }[] = [
  { id: 1, short: 'P1', labelKey: 'position.1' },
  { id: 2, short: 'P2', labelKey: 'position.2' },
  { id: 3, short: 'P3', labelKey: 'position.3' },
  { id: 4, short: 'P4', labelKey: 'position.4' },
  { id: 5, short: 'P5', labelKey: 'position.5' },
];

export const ranks: { value: number | null; labelKey: string }[] = [
  { value: null, labelKey: 'rank.any' },
  { value: 1, labelKey: 'rank.1' },
  { value: 2, labelKey: 'rank.2' },
  { value: 3, labelKey: 'rank.3' },
  { value: 4, labelKey: 'rank.4' },
  { value: 5, labelKey: 'rank.5' },
  { value: 6, labelKey: 'rank.6' },
  { value: 7, labelKey: 'rank.7' },
  { value: 8, labelKey: 'rank.8' },
];

export const getRankLabel = (value: number | null) =>
  translate(ranks.find((rank) => rank.value === value)?.labelKey ?? 'rank.any');
