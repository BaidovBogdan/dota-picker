import { useInfiniteQuery } from '@tanstack/react-query';
import {
  CalendarDotsIcon,
  CameraIcon,
  CaretDownIcon,
  CursorClickIcon,
  DesktopIcon,
  FunnelIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  TargetIcon,
  TrophyIcon,
} from '@phosphor-icons/react';
import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { desktop } from '../bridge';
import { AppSelect, type AppSelectOption } from '../components/app-select';
import {
  POSITION_VALUES,
  PositionIcon,
  PositionLabel,
  RankLabel,
} from '../components/dota-taxonomy';
import { MorphingFilterBar } from '../components/morphing-filter-bar';
import { AsyncState, Badge, Button, HeroIcon, Page } from '../components/ui';
import { formatDateTime, heroName } from '../format';
import type { Analysis, AnalysisSource, Position } from '../types';

type SourceFilter = 'all' | AnalysisSource;

const SOURCE_OPTIONS: readonly AppSelectOption[] = [
  {
    value: 'all',
    label: 'Все источники',
    icon: <ListBulletsIcon size={16} weight="duotone" />,
  },
  {
    value: 'desktop',
    label: 'Автоассистент',
    icon: <DesktopIcon size={16} weight="duotone" />,
  },
  {
    value: 'manual',
    label: 'Ручной, mobile',
    icon: <CursorClickIcon size={16} weight="duotone" />,
  },
  {
    value: 'photo',
    label: 'Фото, mobile',
    icon: <CameraIcon size={16} weight="duotone" />,
  },
];

const POSITION_OPTIONS: readonly AppSelectOption[] = [
  {
    value: 'all',
    label: 'Все позиции',
    icon: <TargetIcon size={16} weight="duotone" />,
  },
  ...POSITION_VALUES.map((value) => ({
    value: String(value),
    label: `P${value}`,
    description:
      value === 1
        ? 'Керри'
        : value === 2
          ? 'Мид'
          : value === 3
            ? 'Оффлейн'
            : value === 4
              ? 'Поддержка'
              : 'Полная поддержка',
    icon: <PositionIcon position={value} size={16} />,
  })),
];

const HistoryItem = memo(function HistoryItem({ analysis }: { analysis: Analysis }) {
  const primary = analysis.result.recommendations[0];
  if (!primary) return null;

  const alternatives = analysis.result.recommendations.slice(1);

  return (
    <details className="history-item">
      <summary>
        <span className="history-item__date">
          <CalendarDotsIcon size={16} weight="duotone" aria-hidden />
          {formatDateTime(analysis.createdAt)}
        </span>
        <HeroIcon hero={primary.hero} />
        <span className="history-item__hero">
          <strong>{heroName(primary.hero)}</strong>
          <small className="history-item__taxonomy">
            <PositionLabel position={analysis.input.position} variant="compact" />
            <span aria-hidden>·</span>
            <RankLabel rank={analysis.input.rank ?? null} variant="compact" />
            <span aria-hidden>·</span>
            <span>Патч {analysis.result.patch}</span>
          </small>
        </span>
        <span className="history-item__score">
          <small>Score</small>
          <strong>{Math.round(primary.score)}</strong>
        </span>
        <Badge tone={primary.confidence === 'high' ? 'success' : 'warning'}>
          {primary.confidence === 'high'
            ? 'Высокая уверенность'
            : primary.confidence === 'medium'
              ? 'Средняя уверенность'
              : 'Низкая уверенность'}
        </Badge>
        <CaretDownIcon className="history-item__chevron" size={18} aria-hidden />
      </summary>
      <div className="history-item__details">
        <div>
          <span className="history-item__label">Альтернативы</span>
          <div className="alternative-heroes">
            {alternatives.length ? (
              alternatives.map((item) => (
                <span key={item.hero.id}>
                  <HeroIcon hero={item.hero} />
                  <span>
                    <strong>{heroName(item.hero)}</strong>
                    <small>{Math.round(item.score)} score</small>
                  </span>
                </span>
              ))
            ) : (
              <small>Сервер не вернул дополнительные варианты</small>
            )}
          </div>
        </div>
        <div className="history-item__facts">
          <span>
            <TargetIcon size={16} weight="duotone" aria-hidden />
            {analysis.input.enemyHeroIds.length} соперников
          </span>
          <span>
            <TrophyIcon size={16} weight="duotone" aria-hidden />
            {primary.evidence?.matchups.games ?? 0} игр в matchup
          </span>
        </div>
        <Link className="button button--primary" to={`/result/${analysis.id}`}>
          Открыть доказательства
        </Link>
      </div>
    </details>
  );
});

export function HistoryPage() {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [position, setPosition] = useState<'all' | Position>('all');
  const deferredSearch = useDeferredValue(search);

  const query = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) => desktop.data.history({ cursor: pageParam, limit: 30 }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

  const allItems = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );

  const items = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLocaleLowerCase('ru-RU');
    return allItems.filter((analysis) => {
      if (source !== 'all' && analysis.source !== source) return false;
      if (position !== 'all' && analysis.input.position !== position) return false;
      if (!normalizedSearch) return true;
      return analysis.result.recommendations.some((item) =>
        heroName(item.hero).toLocaleLowerCase('ru-RU').includes(normalizedSearch),
      );
    });
  }, [allItems, deferredSearch, position, source]);

  return (
    <Page
      title="История контрпиков"
      description="Каждый результат хранит входной драфт, численные метрики и происхождение данных."
    >
      <MorphingFilterBar className="history-toolbar" label="Фильтры истории контрпиков">
        <div className="history-toolbar__controls">
          <label className="search-field">
            <MagnifyingGlassIcon size={17} aria-hidden />
            <span className="sr-only">Поиск по герою</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти героя в рекомендациях"
              type="search"
            />
          </label>
          <AppSelect
            className="history-filter-select history-filter-select--source"
            value={source}
            onValueChange={(value) => setSource(value as SourceFilter)}
            options={SOURCE_OPTIONS}
            label="Источник"
            leadingIcon={<FunnelIcon size={16} weight="duotone" />}
          />
          <AppSelect
            className="history-filter-select history-filter-select--position"
            value={String(position)}
            onValueChange={(value) =>
              setPosition(value === 'all' ? 'all' : (Number(value) as Position))
            }
            options={POSITION_OPTIONS}
            label="Позиция"
            leadingIcon={<TargetIcon size={16} weight="duotone" />}
          />
        </div>
        <div className="history-toolbar__summary" aria-live="polite">
          <strong>{items.length}</strong>
          <span>результатов · сначала новые</span>
        </div>
      </MorphingFilterBar>

      {query.isPending ? (
        <AsyncState status="loading" />
      ) : query.isError ? (
        <AsyncState status="error" onRetry={() => void query.refetch()} />
      ) : items.length ? (
        <div className="history-list" data-reveal>
          {items.map((analysis) => (
            <HistoryItem analysis={analysis} key={analysis.id} />
          ))}
        </div>
      ) : (
        <AsyncState
          status="empty"
          title={search ? 'Ничего не найдено' : 'История пока пуста'}
          description={
            search
              ? 'Измените запрос или сбросьте фильтры.'
              : 'Включите ассистента на главной — первый результат появится здесь.'
          }
        />
      )}

      {query.hasNextPage ? (
        <div className="load-more" data-reveal>
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Показать ещё
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
