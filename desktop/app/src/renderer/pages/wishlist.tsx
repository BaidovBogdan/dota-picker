import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon, HeartIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { desktop } from '../bridge';
import { FavoriteButton } from '../components/favorite-button';
import { formatPercent, heroName, roleName } from '../format';
import { useI18n } from '../i18n';
import { AsyncState, HeroArtwork, Page } from '../components/ui';
import { useAppStore } from '../store';
import type { Hero } from '../types';

const WishlistCard = memo(function WishlistCard({ hero }: { hero: Hero }) {
  const { language, text } = useI18n();
  const name = heroName(hero, language);
  return (
    <article className="wishlist-card">
      <Link
        className="wishlist-card__link"
        to={`/hero/${hero.id}`}
        aria-label={text(`Открыть статистику ${name}`, `Open ${name} statistics`)}
      >
        <div className="wishlist-card__media">
          <HeroArtwork hero={hero} />
        </div>
        <div className="wishlist-card__body">
          <span>{hero.roles?.slice(0, 2).map((role) => roleName(role, language)).join(' · ') || text('Роли уточняются', 'Roles pending')}</span>
          <strong>{name}</strong>
          <div className="wishlist-card__meta">
            <small>
              {typeof hero.winRate === 'number'
                ? text(`${formatPercent(hero.winRate, 1, language)} побед`, `${formatPercent(hero.winRate, 1, language)} win rate`)
                : text('Статистика героя', 'Hero statistics')}
            </small>
            <span>
              {text('Открыть', 'Open')}
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
  const { language, locale, text } = useI18n();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const wishlist = useAppStore((state) => state.wishlist);
  const query = useQuery({
    queryKey: ['heroes'],
    queryFn: desktop.data.heroes,
    staleTime: 60 * 60_000,
  });

  const heroes = useMemo(() => {
    const normalized = deferredSearch.trim().toLocaleLowerCase(locale);
    const set = new Set(wishlist);
    return (
      query.data
        ?.filter((hero) => set.has(hero.id))
        .filter((hero) => !normalized || heroName(hero, language).toLocaleLowerCase(locale).includes(normalized)) ??
      []
    );
  }, [deferredSearch, language, locale, query.data, wishlist]);

  return (
    <Page
      title={text('Герои в вашем пуле', 'Heroes in your pool')}
      description={text('Сохранённая мета и сборки без повторного поиска.', 'Saved meta insights and builds without searching again.')}
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
          <span className="sr-only">{text('Найти в избранном', 'Search favorites')}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={text('Найти в избранном', 'Search favorites')}
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
          title={search ? text('Ничего не найдено', 'Nothing found') : text('Избранных героев пока нет', 'No favorite heroes yet')}
          description={
            search
              ? text('Попробуйте другой запрос.', 'Try another search.')
              : text('Добавляйте героев со страницы меты или из их подробной статистики.', 'Add heroes from the meta page or their detailed statistics.')
          }
        />
      )}
    </Page>
  );
}
