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
import { formatDateTime, heroName, positionName } from '../format';
import { useI18n } from '../i18n';
import type { Analysis, AnalysisSource, Position } from '../types';

type SourceFilter = 'all' | AnalysisSource;

const HistoryItem = memo(function HistoryItem({ analysis }: { analysis: Analysis }) {
  const { language, text } = useI18n();
  const primary = analysis.result.recommendations[0];
  if (!primary) return null;

  const alternatives = analysis.result.recommendations.slice(1);

  return (
    <details className="history-item">
      <summary>
        <span className="history-item__date">
          <CalendarDotsIcon size={16} weight="duotone" aria-hidden />
          {formatDateTime(analysis.createdAt, language)}
        </span>
        <HeroIcon hero={primary.hero} />
        <span className="history-item__hero">
          <strong>{heroName(primary.hero, language)}</strong>
          <small className="history-item__taxonomy">
            <PositionLabel position={analysis.input.position} variant="compact" />
            <span aria-hidden>·</span>
            <RankLabel rank={analysis.input.rank ?? null} variant="compact" />
            <span aria-hidden>·</span>
            <span>{text('Патч', 'Patch')} {analysis.result.patch}</span>
          </small>
        </span>
        <span className="history-item__score">
          <small>{text('Оценка', 'Score')}</small>
          <strong>{Math.round(primary.score)}</strong>
        </span>
        <Badge tone={primary.confidence === 'high' ? 'success' : 'warning'}>
          {primary.confidence === 'high'
            ? text('Высокая уверенность', 'High confidence')
            : primary.confidence === 'medium'
              ? text('Средняя уверенность', 'Medium confidence')
              : text('Низкая уверенность', 'Low confidence')}
        </Badge>
        <CaretDownIcon className="history-item__chevron" size={18} aria-hidden />
      </summary>
      <div className="history-item__details">
        <div>
          <span className="history-item__label">{text('Альтернативы', 'Alternatives')}</span>
          <div className="alternative-heroes">
            {alternatives.length ? (
              alternatives.map((item) => (
                <span key={item.hero.id}>
                  <HeroIcon hero={item.hero} />
                  <span>
                    <strong>{heroName(item.hero, language)}</strong>
                    <small>{Math.round(item.score)} {text('баллов', 'score')}</small>
                  </span>
                </span>
              ))
            ) : (
              <small>{text('Сервер не вернул дополнительные варианты', 'The server returned no additional options')}</small>
            )}
          </div>
        </div>
        <div className="history-item__facts">
          <span>
            <TargetIcon size={16} weight="duotone" aria-hidden />
            {analysis.input.enemyHeroIds.length} {text('соперников', 'enemies')}
          </span>
          <span>
            <TrophyIcon size={16} weight="duotone" aria-hidden />
            {primary.evidence?.matchups.games ?? 0} {text('игр в matchup', 'matchup games')}
          </span>
        </div>
        <Link className="button button--primary" to={`/result/${analysis.id}`}>
          {text('Открыть доказательства', 'Open evidence')}
        </Link>
      </div>
    </details>
  );
});

export function HistoryPage() {
  const { language, locale, text } = useI18n();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [position, setPosition] = useState<'all' | Position>('all');
  const deferredSearch = useDeferredValue(search);
  const sourceOptions: readonly AppSelectOption[] = [
    { value: 'all', label: text('Все источники', 'All sources'), icon: <ListBulletsIcon size={16} weight="duotone" /> },
    { value: 'desktop', label: text('Автоассистент', 'Auto assistant'), icon: <DesktopIcon size={16} weight="duotone" /> },
    { value: 'manual', label: text('Ручной, mobile', 'Manual, mobile'), icon: <CursorClickIcon size={16} weight="duotone" /> },
    { value: 'photo', label: text('Фото, mobile', 'Photo, mobile'), icon: <CameraIcon size={16} weight="duotone" /> },
  ];
  const positionOptions: readonly AppSelectOption[] = [
    { value: 'all', label: text('Все позиции', 'All positions'), icon: <TargetIcon size={16} weight="duotone" /> },
    ...POSITION_VALUES.map((value) => ({
      value: String(value),
      label: `P${value}`,
      description: positionName(value, language),
      icon: <PositionIcon position={value} size={16} />,
    })),
  ];

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
    const normalizedSearch = deferredSearch.trim().toLocaleLowerCase(locale);
    return allItems.filter((analysis) => {
      if (source !== 'all' && analysis.source !== source) return false;
      if (position !== 'all' && analysis.input.position !== position) return false;
      if (!normalizedSearch) return true;
      return analysis.result.recommendations.some((item) =>
        heroName(item.hero, language).toLocaleLowerCase(locale).includes(normalizedSearch),
      );
    });
  }, [allItems, deferredSearch, language, locale, position, source]);

  return (
    <Page
      title={text('История контрпиков', 'Counterpick history')}
      description={text('Каждый результат хранит входной драфт, численные метрики и происхождение данных.', 'Every result keeps the input draft, numerical metrics, and data provenance.')}
    >
      <MorphingFilterBar className="history-toolbar" label={text('Фильтры истории контрпиков', 'Counterpick history filters')}>
        <div className="history-toolbar__controls">
          <label className="search-field">
            <MagnifyingGlassIcon size={17} aria-hidden />
            <span className="sr-only">{text('Поиск по герою', 'Search by hero')}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={text('Найти героя в рекомендациях', 'Find a recommended hero')}
              type="search"
            />
          </label>
          <AppSelect
            className="history-filter-select history-filter-select--source"
            value={source}
            onValueChange={(value) => setSource(value as SourceFilter)}
            options={sourceOptions}
            label={text('Источник', 'Source')}
            leadingIcon={<FunnelIcon size={16} weight="duotone" />}
          />
          <AppSelect
            className="history-filter-select history-filter-select--position"
            value={String(position)}
            onValueChange={(value) =>
              setPosition(value === 'all' ? 'all' : (Number(value) as Position))
            }
            options={positionOptions}
            label={text('Позиция', 'Position')}
            leadingIcon={<TargetIcon size={16} weight="duotone" />}
          />
        </div>
        <div className="history-toolbar__summary" aria-live="polite">
          <strong>{items.length}</strong>
          <span>{text('результатов · сначала новые', 'results · newest first')}</span>
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
          title={search ? text('Ничего не найдено', 'Nothing found') : text('История пока пуста', 'History is empty')}
          description={
            search
              ? text('Измените запрос или сбросьте фильтры.', 'Change the query or reset the filters.')
              : text('Включите ассистента на главной — первый результат появится здесь.', 'Turn on the assistant on the home page and your first result will appear here.')
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
            {text('Показать ещё', 'Show more')}
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
