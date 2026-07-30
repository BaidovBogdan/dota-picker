import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon, HeartIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { desktop } from '../bridge';
import { FavoriteButton } from '../components/favorite-button';
import { formatPercent, heroName } from '../format';
import { AsyncState, HeroArtwork, Page } from '../components/ui';
import { useAppStore } from '../store';
import type { Hero } from '../types';

const WishlistCard = memo(function WishlistCard({ hero }: { hero: Hero }) {
  return (
    <article className="wishlist-card">
      <Link
        className="wishlist-card__link"
        to={`/hero/${hero.id}`}
        aria-label={`Открыть статистику ${heroName(hero)}`}
      >
        <div className="wishlist-card__media">
          <HeroArtwork hero={hero} />
        </div>
        <div className="wishlist-card__body">
          <span>{hero.roles?.slice(0, 2).join(' · ') || 'Роли уточняются'}</span>
          <strong>{heroName(hero)}</strong>
          <div className="wishlist-card__meta">
            <small>
              {typeof hero.winRate === 'number'
                ? `${formatPercent(hero.winRate)} побед`
                : 'Статистика героя'}
            </small>
            <span>
              Открыть
              <ArrowUpRightIcon size={14} aria-hidden />
            </span>
          </div>
        </div>
      </Link>
      <FavoriteButton
        className="wishlist-card__favorite"
        heroId={hero.id}
        size={17}
      />
    </article>
  );
});

export function WishlistPage() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const wishlist = useAppStore((state) => state.wishlist);
  const query = useQuery({
    queryKey: ['heroes'],
    queryFn: desktop.data.heroes,
    staleTime: 60 * 60_000,
  });

  const heroes = useMemo(() => {
    const normalized = deferredSearch.trim().toLocaleLowerCase('ru-RU');
    const set = new Set(wishlist);
    return (
      query.data
        ?.filter((hero) => set.has(hero.id))
        .filter((hero) => !normalized || heroName(hero).toLocaleLowerCase('ru-RU').includes(normalized)) ??
      []
    );
  }, [deferredSearch, query.data, wishlist]);

  return (
    <Page
      title="Герои в вашем пуле"
      description="Сохранённая мета и сборки без повторного поиска."
      actions={
        wishlist.length ? (
          <span className="page-counter">
            <HeartIcon size={16} weight="fill" aria-hidden />
            {wishlist.length}
          </span>
        ) : null
      }
    >
      {wishlist.length ? (
        <label className="search-field wishlist-search" data-reveal>
          <MagnifyingGlassIcon size={17} aria-hidden />
          <span className="sr-only">Найти в избранном</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти в избранном"
          />
        </label>
      ) : null}

      {query.isPending ? (
        <AsyncState status="loading" />
      ) : query.isError ? (
        <AsyncState status="error" onRetry={() => void query.refetch()} />
      ) : heroes.length ? (
        <div className="wishlist-grid" data-reveal>
          {heroes.map((hero) => (
            <WishlistCard hero={hero} key={hero.id} />
          ))}
        </div>
      ) : (
        <AsyncState
          status="empty"
          title={search ? 'Ничего не найдено' : 'Избранных героев пока нет'}
          description={
            search
              ? 'Попробуйте другой запрос.'
              : 'Добавляйте героев со страницы меты или из их подробной статистики.'
          }
        />
      )}
    </Page>
  );
}
