import { HeartIcon } from '@phosphor-icons/react';
import { memo, type MouseEvent } from 'react';

import { useFavorite } from '../hooks/use-wishlist';

export const FavoriteButton = memo(function FavoriteButton({
  heroId,
  className = 'favorite-button',
  size = 18,
  showLabel = false,
  onClick,
}: {
  heroId: number;
  className?: string;
  size?: number;
  showLabel?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { favorite, toggle, pending } = useFavorite(heroId);

  return (
    <button
      type="button"
      className={favorite ? `${className} is-active` : className}
      aria-label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
      aria-pressed={favorite}
      disabled={pending}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggle();
      }}
    >
      <HeartIcon
        size={size}
        weight={favorite ? 'fill' : 'regular'}
        aria-hidden
      />
      {showLabel ? <span>{favorite ? 'В избранном' : 'В избранное'}</span> : null}
    </button>
  );
});
