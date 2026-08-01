import { MedalIcon } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';

import carryIcon from '../assets/roles/carry.webp';
import hardSupportIcon from '../assets/roles/hard-support.webp';
import midIcon from '../assets/roles/mid.webp';
import offlaneIcon from '../assets/roles/offlane.webp';
import softSupportIcon from '../assets/roles/soft-support.webp';
import rank1Icon from '../assets/ranks/rank-1.png';
import rank2Icon from '../assets/ranks/rank-2.png';
import rank3Icon from '../assets/ranks/rank-3.png';
import rank4Icon from '../assets/ranks/rank-4.png';
import rank5Icon from '../assets/ranks/rank-5.png';
import rank6Icon from '../assets/ranks/rank-6.png';
import rank7Icon from '../assets/ranks/rank-7.png';
import rank8Icon from '../assets/ranks/rank-8.png';
import { positionName, rankName } from '../format';
import { useI18n } from '../i18n';
import type { Position } from '../types';

export const POSITION_VALUES = [1, 2, 3, 4, 5] as const satisfies readonly Position[];
export const RANK_VALUES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const positionIcons: Record<Position, string> = {
  1: carryIcon,
  2: midIcon,
  3: offlaneIcon,
  4: softSupportIcon,
  5: hardSupportIcon,
};

const rankIcons: Record<number, string> = {
  1: rank1Icon,
  2: rank2Icon,
  3: rank3Icon,
  4: rank4Icon,
  5: rank5Icon,
  6: rank6Icon,
  7: rank7Icon,
  8: rank8Icon,
};

export function PositionIcon({
  position,
  size = 18,
  className = '',
}: {
  position: Position;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`position-icon ${className}`}
      style={
        {
          '--position-icon': `url("${positionIcons[position]}")`,
          '--position-icon-size': `${size}px`,
        } as CSSProperties
      }
      aria-hidden
    />
  );
}

export function PositionLabel({
  position,
  variant = 'full',
  className = '',
}: {
  position: Position;
  variant?: 'full' | 'compact' | 'icon';
  className?: string;
}) {
  const { language } = useI18n();
  return (
    <span className={`taxonomy-label taxonomy-label--${variant} ${className}`}>
      <PositionIcon position={position} />
      <span className="taxonomy-label__index">P{position}</span>
      <span className="taxonomy-label__text">{positionName(position, language)}</span>
    </span>
  );
}

export function RankIcon({
  rank,
  size = 22,
  className = '',
}: {
  rank: number | null | undefined;
  size?: number;
  className?: string;
}) {
  const source = rank ? rankIcons[rank] : null;
  return (
    <span
      className={`rank-icon ${className}`}
      style={{ '--rank-icon-size': `${size}px` } as CSSProperties}
      aria-hidden
    >
      {source ? <img src={source} alt="" draggable={false} /> : <MedalIcon weight="duotone" />}
    </span>
  );
}

export function RankLabel({
  rank,
  variant = 'full',
  className = '',
}: {
  rank: number | null | undefined;
  variant?: 'full' | 'compact' | 'icon';
  className?: string;
}) {
  const { language } = useI18n();
  return (
    <span className={`taxonomy-label taxonomy-label--${variant} ${className}`}>
      <RankIcon rank={rank} />
      <span className="taxonomy-label__text">{rankName(rank, language)}</span>
    </span>
  );
}
