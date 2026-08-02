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
import { FilterSearchField } from '../components/filter-search-field';
import { MorphingFilterBar } from '../components/morphing-filter-bar';
import { AsyncState, Badge, HeroIcon, Page } from '../components/ui';
import { formatDateTime, formatPercent, heroName, rankName } from '../format';
import { useI18n } from '../i18n';
import type { Hero, Position, PositionStat } from '../types';

type SortKey = 'winRate' | 'picks' | 'name';

type MetaRowData = {
  hero: Hero;
  name: string;
  stat: PositionStat;
};

const MetaRow = memo(function MetaRow({
  row,
  index,
  position,
}: {
  row: MetaRowData;
  index: number;
  position: Position;
}) {
  const { language, locale, text } = useI18n();
  const average = 0.5;
  const delta = (row.stat.winRate - average) * 100;

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
      <strong>{row.stat.picks.toLocaleString(locale)}</strong>
      <span>{row.stat.wins.toLocaleString(locale)}</span>
      <span className="meta-row__winrate">
        <strong>{formatPercent(row.stat.winRate, 1, language)}</strong>
        <small className={row.stat.winRate >= average ? 'is-positive' : 'is-negative'}>
          {delta >= 0 ? '+' : ''}
          {delta.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} {text('п.п.', 'pp')}
        </small>
      </span>
      <FavoriteButton heroId={row.hero.id} />
    </div>
  );
});

export function MetaPage() {
  const { language, locale, text } = useI18n();
  const [position, setPosition] = useState<Position>(1);
  const [rank, setRank] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>('winRate');
  const [descending, setDescending] = useState(true);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const rankOptions: readonly AppSelectOption[] = [
    { value: 'all', label: text('Все ранги', 'All ranks'), icon: <RankIcon rank={null} size={18} /> },
    ...RANK_VALUES.map((value) => ({
      value: String(value),
      label: rankName(value, language),
      icon: <RankIcon rank={value} size={20} />,
    })),
  ];
  const sortOptions: readonly AppSelectOption[] = [
    { value: 'winRate', label: text('По win rate', 'By win rate'), icon: <ChartBarIcon size={16} weight="duotone" /> },
    { value: 'picks', label: text('По матчам', 'By matches'), icon: <SparkleIcon size={16} weight="duotone" /> },
    { value: 'name', label: text('По имени', 'By name'), icon: <MagnifyingGlassIcon size={16} weight="duotone" /> },
  ];

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
        const name = heroName(hero, language);
        return {
          hero,
          name,
          searchName: name.toLocaleLowerCase(locale),
        };
      }),
    [language, locale, query.data?.heroes],
  );

  const rows = useMemo(() => {
    const stats = statsByPosition.get(position);
    if (!stats) return [];

    const normalized = deferredSearch.trim().toLocaleLowerCase(locale);
    const next: MetaRowData[] = [];

    for (const candidate of searchableHeroes) {
      const stat = stats.get(candidate.hero.id);
      if (!stat || (normalized && !candidate.searchName.includes(normalized))) continue;
      next.push({ hero: candidate.hero, name: candidate.name, stat });
    }

    const direction = descending ? -1 : 1;
    next.sort((left, right) => {
      if (sort === 'name') {
        return left.name.localeCompare(right.name, locale) * direction;
      }
      return (left.stat[sort] - right.stat[sort]) * direction;
    });

    return next;
  }, [deferredSearch, descending, locale, position, searchableHeroes, sort, statsByPosition]);

  return (
    <Page
      title={text('Мета по позициям', 'Meta by position')}
      description={text('Статистика OpenDota по позициям и рангам. Matchup в рекомендациях считается отдельно по rolling all-ranks.', 'OpenDota statistics by position and rank. Recommendation matchups are calculated separately using rolling all-ranks data.')}
      actions={
        query.data ? (
          <Badge tone={query.data.isStale ? 'warning' : 'success'}>
            {query.data.isStale ? text('Кэш обновляется', 'Refreshing cache') : text('Данные актуальны', 'Data is current')}
          </Badge>
        ) : null
      }
    >
      <MorphingFilterBar
        className="meta-controls"
        compactLabel={text('Фильтры', 'Filters')}
        compactContent={(
          <>
            <span className="filter-dock__value" data-active="true">
              <PositionLabel position={position} variant="compact" />
            </span>
            <span className="filter-dock__value" data-active={rank !== null}>
              <RankLabel rank={rank} variant="compact" />
            </span>
            <span className="filter-dock__value">
              {sortOptions.find((option) => option.value === sort)?.label}
              {descending
                ? <ArrowDownIcon size={13} aria-hidden />
                : <ArrowUpIcon size={13} aria-hidden />}
            </span>
            {search.trim() ? (
              <span className="filter-dock__value filter-dock__value--query" data-active="true">
                <MagnifyingGlassIcon size={13} aria-hidden />
                {search.trim()}
              </span>
            ) : null}
            <span className="filter-dock__count">
              <strong>{rows.length}</strong>
              {text('героев', 'heroes')}
            </span>
          </>
        )}
        label={text('Фильтры меты', 'Meta filters')}
      >
        <div className="meta-controls__top">
          <div className="meta-controls__positions" aria-label={text('Позиция', 'Position')}>
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
            <FilterSearchField
              value={search}
              onValueChange={setSearch}
              label={text('Найти героя', 'Find a hero')}
              placeholder={text('Найти героя', 'Find a hero')}
            />
            <AppSelect
              value={rank === null ? 'all' : String(rank)}
              onValueChange={(value) => setRank(value === 'all' ? null : Number(value))}
              options={rankOptions}
              label={text('Ранг', 'Rank')}
              className="meta-controls__rank-select"
            />
            <AppSelect
              value={sort}
              onValueChange={(value) => setSort(value as SortKey)}
              options={sortOptions}
              label={text('Сортировка', 'Sort')}
              leadingIcon={<ChartBarIcon size={16} weight="duotone" />}
              className="meta-controls__sort-select"
            />
            <button
              type="button"
              className="sort-direction"
              onClick={() => setDescending((value) => !value)}
              aria-label={
                descending
                  ? text('Сортировать по возрастанию', 'Sort ascending')
                  : text('Сортировать по убыванию', 'Sort descending')
              }
              title={
                descending
                  ? text('Сначала высокие значения', 'Highest values first')
                  : text('Сначала низкие значения', 'Lowest values first')
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
                ? `${text('Патч', 'Patch')} ${query.data.patch}`
                : text('Патч уточняется', 'Patch pending')}
            </strong>
            {query.data?.fetchedAt
              ? ` · ${text('обновлено', 'updated')} ${formatDateTime(query.data.fetchedAt, language)}`
              : ''}
          </span>
          <span>
            <PositionLabel position={position} variant="compact" />
            <span aria-hidden>·</span>
            <RankLabel rank={rank} variant="compact" />
            <span aria-hidden>·</span>
            <span>{rows.length} {text('героев', 'heroes')}</span>
          </span>
        </div>
      </MorphingFilterBar>

      {query.isPending ? (
        <AsyncState status="loading" title={text('Собираем мету', 'Loading meta')} />
      ) : query.isError ? (
        <AsyncState status="error" onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <div className="meta-table" data-reveal aria-busy={query.isFetching}>
          <div className="meta-table__head">
            <span>#</span>
            <span>{text('Герой', 'Hero')}</span>
            <span>{text('Матчи', 'Matches')}</span>
            <span>{text('Победы', 'Wins')}</span>
            <span>{text('Процент побед', 'Win rate')}</span>
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
          title={text('Герои не найдены', 'No heroes found')}
          description={text('Измените поиск или выберите другую позицию.', 'Change the search or choose another position.')}
        />
      )}

      {query.data?.availability === 'collecting' ? (
        <div className="collecting-note" data-reveal>
          <SparkleIcon size={18} weight="duotone" aria-hidden />
          <span>
            <strong>{text('Выборка ещё собирается', 'The sample is still growing')}</strong>
            {text('Некоторые позиции появятся после накопления минимального числа матчей.', 'Some positions will appear after the minimum match sample is reached.')}
          </span>
        </div>
      ) : null}
    </Page>
  );
}
