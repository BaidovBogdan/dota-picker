import { HeartIcon } from '@phosphor-icons/react';
import { memo, type MouseEvent } from 'react';

import { useFavorite } from '../hooks/use-wishlist';
import { useI18n } from '../i18n';

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
  const { text } = useI18n();

  return (
    <button
      type="button"
      className={favorite ? `${className} is-active` : className}
      aria-label={favorite
        ? text('Убрать из избранного', 'Remove from favorites')
        : text('Добавить в избранное', 'Add to favorites')}
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
      {showLabel ? (
        <span>{favorite ? text('В избранном', 'In favorites') : text('В избранное', 'Add to favorites')}</span>
      ) : null}
    </button>
  );
});
