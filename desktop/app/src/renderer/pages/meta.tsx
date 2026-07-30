import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { desktop } from '../bridge';
import { AppSelect, type AppSelectOption } from '../components/app-select';
import {
  POSITION_VALUES,
  RANK_VALUES,
  PositionLabel,
  RankIcon,
  RankLabel,
} from '../components/dota-taxonomy';
import { FavoriteButton } from '../components/favorite-button';
import { MorphingFilterBar } from '../components/morphing-filter-bar';
import { AsyncState, Badge, HeroIcon, Page } from '../components/ui';
import { formatDateTime, formatPercent, heroName, rankName } from '../format';
import type { Hero, Position, PositionStat } from '../types';

type SortKey = 'winRate' | 'picks' | 'name';

type MetaRowData = {
  hero: Hero;
  name: string;
  stat: PositionStat;
};

const RANK_OPTIONS: readonly AppSelectOption[] = [
  {
    value: 'all',
    label: 'Все ранги',
    icon: <RankIcon rank={null} size={18} />,
  },
  ...RANK_VALUES.map((rank) => ({
    value: String(rank),
    label: rankName(rank),
    icon: <RankIcon rank={rank} size={20} />,
  })),
];

const SORT_OPTIONS: readonly AppSelectOption[] = [
  {
    value: 'winRate',
    label: 'По win rate',
    icon: <ChartBarIcon size={16} weight="duotone" />,
  },
  {
    value: 'picks',
    label: 'По матчам',
    icon: <SparkleIcon size={16} weight="duotone" />,
  },
  {
    value: 'name',
    label: 'По имени',
    icon: <MagnifyingGlassIcon size={16} weight="duotone" />,
  },
];

const MetaRow = memo(function MetaRow({
  row,
  index,
  position,
}: {
  row: MetaRowData;
  index: number;
  position: Position;
}) {
  const average = 0.5;

  return (
    <div className="meta-row">
      <span className="meta-row__rank">{String(index + 1).padStart(2, '0')}</span>
      <Link className="meta-row__hero" to={`/hero/${row.hero.id}`}>
        <HeroIcon hero={row.hero} />
        <span>
          <strong>{row.name}</strong>
          <small>
            <PositionLabel position={position} variant="compact" />
          </small>
        </span>
      </Link>
      <strong>{row.stat.picks.toLocaleString('ru-RU')}</strong>
      <span>{row.stat.wins.toLocaleString('ru-RU')}</span>
      <span className="meta-row__winrate">
        <strong>{formatPercent(row.stat.winRate)}</strong>
        <small className={row.stat.winRate >= average ? 'is-positive' : 'is-negative'}>
          {row.stat.winRate >= average ? '+' : ''}
          {((row.stat.winRate - average) * 100).toFixed(1)} п.п.
        </small>
      </span>
      <FavoriteButton heroId={row.hero.id} />
    </div>
  );
});

export function MetaPage() {
  const [position, setPosition] = useState<Position>(1);
  const [rank, setRank] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>('winRate');
  const [descending, setDescending] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const query = useQuery({
    queryKey: ['meta', rank],
    queryFn: () => desktop.data.meta({ position: 1, rank }),
    placeholderData: (previous) => previous,
  });

  const statsByPosition = useMemo(() => {
    const grouped = new Map<Position, Map<number, PositionStat>>();
    for (const value of POSITION_VALUES) grouped.set(value, new Map());
    for (const stat of query.data?.positionStats ?? []) {
      grouped.get(stat.position)?.set(stat.heroId, stat);
    }
    return grouped;
  }, [query.data?.positionStats]);

  const searchableHeroes = useMemo(
    () =>
      (query.data?.heroes ?? []).map((hero) => {
        const name = heroName(hero);
        return {
          hero,
          name,
          searchName: name.toLocaleLowerCase('ru-RU'),
        };
      }),
    [query.data?.heroes],
  );

  const rows = useMemo(() => {
    const stats = statsByPosition.get(position);
    if (!stats) return [];

    const normalized = deferredSearch.trim().toLocaleLowerCase('ru-RU');
    const next: MetaRowData[] = [];

    for (const candidate of searchableHeroes) {
      const stat = stats.get(candidate.hero.id);
      if (!stat || (normalized && !candidate.searchName.includes(normalized))) continue;
      next.push({ hero: candidate.hero, name: candidate.name, stat });
    }

    const direction = descending ? -1 : 1;
    next.sort((left, right) => {
      if (sort === 'name') {
        return left.name.localeCompare(right.name, 'ru-RU') * direction;
      }
      return (left.stat[sort] - right.stat[sort]) * direction;
    });

    return next;
  }, [deferredSearch, descending, position, searchableHeroes, sort, statsByPosition]);

  return (
    <Page
      title="Мета по позициям"
      description="Статистика OpenDota по позициям и рангам. Matchup в рекомендациях считается отдельно по rolling all-ranks."
      actions={
        query.data ? (
          <Badge tone={query.data.isStale ? 'warning' : 'success'}>
            {query.data.isStale ? 'Кэш обновляется' : 'Данные актуальны'}
          </Badge>
        ) : null
      }
    >
      <MorphingFilterBar className="meta-controls" label="Фильтры меты">
        <div className="meta-controls__top">
          <div className="meta-controls__positions" aria-label="Позиция">
            {POSITION_VALUES.map((value) => (
              <button
                type="button"
                key={value}
                className={position === value ? 'is-active' : ''}
                aria-pressed={position === value}
                onClick={() => setPosition(value)}
              >
                <PositionLabel position={value} />
              </button>
            ))}
          </div>
          <div className="meta-controls__filters">
            <label className="search-field">
              <MagnifyingGlassIcon size={17} aria-hidden />
              <span className="sr-only">Найти героя</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Найти героя"
              />
            </label>
            <AppSelect
              value={rank === null ? 'all' : String(rank)}
              onValueChange={(value) => setRank(value === 'all' ? null : Number(value))}
              options={RANK_OPTIONS}
              label="Ранг"
              className="meta-controls__rank-select"
            />
            <AppSelect
              value={sort}
              onValueChange={(value) => setSort(value as SortKey)}
              options={SORT_OPTIONS}
              label="Сортировка"
              leadingIcon={<ChartBarIcon size={16} weight="duotone" />}
              className="meta-controls__sort-select"
            />
            <button
              type="button"
              className="sort-direction"
              onClick={() => setDescending((value) => !value)}
              aria-label={
                descending
                  ? 'Сортировать по возрастанию'
                  : 'Сортировать по убыванию'
              }
              title={
                descending
                  ? 'Сначала высокие значения'
                  : 'Сначала низкие значения'
              }
            >
              {descending ? (
                <ArrowDownIcon size={17} aria-hidden />
              ) : (
                <ArrowUpIcon size={17} aria-hidden />
              )}
            </button>
          </div>
        </div>
        <div className="meta-context" aria-live="polite">
          <span>
            <strong>
              {query.data?.patch
                ? `Патч ${query.data.patch}`
                : 'Патч уточняется'}
            </strong>
            {query.data?.fetchedAt
              ? ` · обновлено ${formatDateTime(query.data.fetchedAt)}`
              : ''}
          </span>
          <span>
            <PositionLabel position={position} variant="compact" />
            <span aria-hidden>·</span>
            <RankLabel rank={rank} variant="compact" />
            <span aria-hidden>·</span>
            <span>{rows.length} героев</span>
          </span>
        </div>
      </MorphingFilterBar>

      {query.isPending ? (
        <AsyncState status="loading" title="Собираем мету" />
      ) : query.isError ? (
        <AsyncState status="error" onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <div className="meta-table" data-reveal aria-busy={query.isFetching}>
          <div className="meta-table__head">
            <span>#</span>
            <span>Герой</span>
            <span>Матчи</span>
            <span>Победы</span>
            <span>Win rate</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <MetaRow
              key={row.hero.id}
              row={row}
              index={index}
              position={position}
            />
          ))}
        </div>
      ) : (
        <AsyncState
          status="empty"
          title="Герои не найдены"
          description="Измените поиск или выберите другую позицию."
        />
      )}

      {query.data?.availability === 'collecting' ? (
        <div className="collecting-note" data-reveal>
          <SparkleIcon size={18} weight="duotone" aria-hidden />
          <span>
            <strong>Выборка ещё собирается</strong>
            Некоторые позиции появятся после накопления минимального числа матчей.
          </span>
        </div>
      ) : null}
    </Page>
  );
}
