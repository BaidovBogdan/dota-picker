import { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ImageOff,
  MousePointer2,
  RadioTower,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { PageResource } from '../App';
import {
  Button,
  CustomSelect,
  Drawer,
  EmptyState,
  IconButton,
  Panel,
  SearchInput,
  SegmentedControl,
  StatusBadge,
  TableRowButton,
} from '../components/ui';
import {
  formatAnalysisSource,
  formatCount,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelativeTime,
} from '../lib/format';
import { useDebouncedValue } from '../lib/use-debounced-value';
import type {
  AdminAnalysesQuery,
  AdminAnalysesResponse,
  AdminAnalysis,
  AdminAnalysisRecommendation,
  AdminHeroMeta,
  AnalysisSource,
  AnalysisStatus,
  HeroCatalogResponse,
} from '../types';

const pageSize = 20;

const statusLabel: Record<AnalysisStatus, string> = { completed: 'Готово', failed: 'Ошибка', processing: 'В процессе' };
const statusTone: Record<AnalysisStatus, 'positive' | 'negative' | 'warning'> = { completed: 'positive', failed: 'negative', processing: 'warning' };
const confidenceLabel = { low: 'Низкая', medium: 'Средняя', high: 'Высокая' } as const;
const reasonLabel: Record<string, string> = {
  strong_counter: 'Сильный контрпик',
  good_role_fit: 'Подходит позиции',
  meta_favorite: 'Силен в мете',
  fills_team_need: 'Закрывает потребность команды',
  strong_synergy: 'Сильная синергия',
  stable_across_draft: 'Стабилен против драфта',
  limited_matchup_data: 'Ограниченная выборка',
};

function recommendations(analysis: AdminAnalysis) {
  return analysis.result?.recommendations ?? [];
}

function accountLabel(analysis: AdminAnalysis) {
  return analysis.account.email ?? `Гость ${analysis.account.id.slice(0, 8)}`;
}

function durationLabel(analysis: AdminAnalysis) {
  if (analysis.durationKind === 'in_progress') return 'В процессе';
  const value = formatDuration(analysis.durationMs);
  return analysis.durationKind === 'session_to_latest_revision'
    ? `До rev ${analysis.revision}: ${value}`
    : `${analysis.status === 'failed' ? 'До ошибки' : 'До результата'}: ${value}`;
}

function durationTitle(analysis: AdminAnalysis) {
  if (analysis.durationKind === 'session_to_latest_revision') return 'От создания до последней ревизии';
  if (analysis.durationKind === 'in_progress') return 'Состояние';
  return analysis.status === 'failed' ? 'От создания до ошибки' : 'От создания до результата';
}

function HeroReferences({
  heroIds,
  heroes,
  emptyLabel,
}: {
  heroIds: number[];
  heroes: Map<number, AdminHeroMeta>;
  emptyLabel: string;
}) {
  if (!heroIds.length) return <span className="review-empty-value">{emptyLabel}</span>;
  return (
    <div className="analysis-hero-references">
      {heroIds.map((heroId) => {
        const hero = heroes.get(heroId);
        return (
          <span key={heroId}>
            {hero ? <img src={hero.iconUrl} alt="" loading="lazy" /> : <i aria-hidden="true">#{heroId}</i>}
            <span><strong>{hero?.localizedName ?? `Герой #${heroId}`}</strong><small>ID {heroId}</small></span>
          </span>
        );
      })}
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: AdminAnalysisRecommendation }) {
  const evidence = recommendation.evidence;
  return (
    <article className="analysis-recommendation-card">
      <div className="analysis-recommendation-card__hero">
        <img src={recommendation.hero.imageUrl} alt="" loading="lazy" />
        <div><strong>{recommendation.hero.localizedName}</strong><small>{recommendation.hero.roles.join(' · ')}</small></div>
        <span>{recommendation.score}</span>
      </div>
      <div className="analysis-recommendation-card__badges">
        <StatusBadge tone={recommendation.confidence === 'high' ? 'positive' : recommendation.confidence === 'medium' ? 'info' : 'warning'}>
          Уверенность: {confidenceLabel[recommendation.confidence]}
        </StatusBadge>
        {recommendation.reasons.map((reason) => <span key={reason}>{reasonLabel[reason] ?? reason}</span>)}
      </div>
      <dl className="analysis-metric-grid">
        <div><dt>Роль</dt><dd>{formatPercent(recommendation.metrics.roleFit * 100, 0)}</dd></div>
        <div><dt>Контрпик</dt><dd>{formatPercent(recommendation.metrics.counter * 100, 0)}</dd></div>
        <div><dt>Мета</dt><dd>{formatPercent(recommendation.metrics.meta * 100, 0)}</dd></div>
        <div><dt>Синергия</dt><dd>{formatPercent(recommendation.metrics.synergy * 100, 0)}</dd></div>
        <div><dt>Надёжность</dt><dd>{recommendation.metrics.reliability === undefined ? '—' : formatPercent(recommendation.metrics.reliability * 100, 0)}</dd></div>
      </dl>
      {evidence ? (
        <div className="analysis-evidence-line">
          <span>Матчапы: {evidence.matchups.opponentsCovered}/{evidence.matchups.opponentsTotal} · {formatCount(evidence.matchups.games, ['игра', 'игры', 'игр'])}</span>
          <span>Мета: {formatCount(evidence.meta.games, ['игра', 'игры', 'игр'])} · {evidence.meta.rankScoped ? 'по рангу' : 'все ранги'}</span>
        </div>
      ) : <p className="muted-message">Подробная доказательная выборка отсутствует в сохранённом результате.</p>}
    </article>
  );
}

export function AnalysesPage({
  resource,
  heroCatalog,
  initialQuery,
  onRetry,
  onHeroCatalogRetry,
  onQueryChange,
}: {
  resource: PageResource<AdminAnalysesResponse>;
  heroCatalog: PageResource<HeroCatalogResponse>;
  initialQuery: AdminAnalysesQuery;
  onRetry: () => void;
  onHeroCatalogRetry: () => void;
  onQueryChange: (query: AdminAnalysesQuery) => void;
}) {
  const [query, setQuery] = useState(() => initialQuery.q ?? '');
  const [status, setStatus] = useState<'all' | AnalysisStatus>(() => initialQuery.status ?? 'all');
  const [source, setSource] = useState<'all' | AnalysisSource>(() => initialQuery.source ?? 'all');
  const [page, setPage] = useState(() => Math.floor(initialQuery.offset / pageSize) + 1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const items = resource.data?.items ?? [];
  const total = resource.data?.pagination.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pages);
  const heroById = useMemo(() => new Map((heroCatalog.data?.heroes ?? []).map((hero) => [hero.id, hero])), [heroCatalog.data]);
  const scopedAnalysisId = initialQuery.id;
  const scopedAccountId = initialQuery.accountId;

  useEffect(() => {
    onQueryChange({
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      q: debouncedQuery || undefined,
      id: scopedAnalysisId,
      accountId: scopedAccountId,
      status: status === 'all' ? undefined : status,
      source: source === 'all' ? undefined : source,
    });
  }, [currentPage, debouncedQuery, onQueryChange, scopedAccountId, scopedAnalysisId, source, status]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  useEffect(() => {
    if (selectedId && !items.some((analysis) => analysis.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  const selected = items.find((analysis) => analysis.id === selectedId) ?? null;
  const clearScope = () => {
    setPage(1);
    onQueryChange({
      limit: pageSize,
      offset: 0,
      q: debouncedQuery || undefined,
      status: status === 'all' ? undefined : status,
      source: source === 'all' ? undefined : source,
    });
  };

  if (resource.loading && !resource.data) return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--table" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Проверки недоступны" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!resource.data) return <EmptyState title="Нет данных" text="API не вернул проверки." action={<Button onClick={onRetry}>Обновить</Button>} />;

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div><span className="eyebrow">Журнал анализов</span><h1>Проверки</h1><p>{formatCount(resource.data.pagination.total, ['запись', 'записи', 'записей'])} по текущим фильтрам.</p></div>
      </header>
      {resource.error ? <div className="inline-error"><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}
      {scopedAccountId || scopedAnalysisId ? (
        <div className="scope-banner" role="status">
          <span><ShieldCheck size={16} />{scopedAnalysisId ? `Точная проверка ${scopedAnalysisId}` : `История аккаунта ${scopedAccountId}`}</span>
          <button type="button" onClick={clearScope}>Показать все</button>
        </div>
      ) : null}

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ID, email, патч или ошибка" ariaLabel="Поиск проверок" />
          <div className="table-toolbar__filters">
            <SegmentedControl value={status} onChange={(value) => { setStatus(value); setPage(1); }} ariaLabel="Статус" options={[{ value: 'all', label: 'Все' }, { value: 'completed', label: 'Готово' }, { value: 'failed', label: 'Ошибки' }, { value: 'processing', label: 'Процесс' }]} />
            <CustomSelect value={source} onChange={(value) => { setSource(value); setPage(1); }} ariaLabel="Источник" label="Источник" options={[{ value: 'all', label: 'Все источники' }, { value: 'photo', label: 'Фото' }, { value: 'manual', label: 'Вручную' }, { value: 'overwolf', label: 'Overwolf Live' }]} />
          </div>
        </div>

        {items.length ? (
          <div className={`data-table-wrap ${resource.loading ? 'is-loading' : ''}`} aria-busy={resource.loading}>
            <table className="data-table">
              <thead><tr><th>ID</th><th>Пользователь</th><th>Статус</th><th>Источник</th><th>Результат</th><th>Патч</th><th>Период записи</th><th>Создана</th><th><span className="sr-only">Открыть</span></th></tr></thead>
              <tbody>
                {items.map((analysis) => {
                  const result = recommendations(analysis);
                  return (
                    <tr key={analysis.id} onClick={() => setSelectedId(analysis.id)}>
                      <td><code className="table-id">{analysis.id.slice(0, 8)}</code><small className="table-subvalue">rev {analysis.revision}</small></td>
                      <td><strong>{accountLabel(analysis)}</strong></td>
                      <td><StatusBadge tone={statusTone[analysis.status]}>{statusLabel[analysis.status]}</StatusBadge></td>
                      <td><span className="source-label">{analysis.source === 'photo' ? <Camera size={14} /> : analysis.source === 'overwolf' ? <RadioTower size={14} /> : <MousePointer2 size={14} />}{formatAnalysisSource(analysis.source)}</span></td>
                      <td>{analysis.errorCode ? <code className="error-code">{analysis.errorCode}</code> : analysis.dataQuality.result === 'legacy_invalid' ? <code className="error-code">LEGACY_PAYLOAD</code> : result.length ? <div className="analysis-table-heroes">{result.map(({ hero }) => <span key={hero.id}><img src={hero.iconUrl} alt="" loading="lazy" />{hero.localizedName}</span>)}</div> : '—'}</td>
                      <td>{analysis.patch ?? '—'}</td>
                      <td><span className="table-date">{durationLabel(analysis)}</span></td>
                      <td><span className="table-date">{formatRelativeTime(analysis.createdAt)}</span></td>
                      <td onClick={(event) => event.stopPropagation()}><TableRowButton label={`Открыть ${analysis.id}`} onClick={() => setSelectedId(analysis.id)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Проверок не найдено" text={query || status !== 'all' || source !== 'all' || scopedAccountId || scopedAnalysisId ? 'Измените фильтры или снимите ограничение истории.' : 'В базе пока нет анализов.'} />}

        <footer className="table-footer"><span>{total ? `${resource.data.pagination.offset + 1}–${resource.data.pagination.offset + items.length} из ${total}` : '0 записей'}</span><div><IconButton label="Предыдущая страница" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></IconButton><span>{currentPage} / {pages}</span><IconButton label="Следующая страница" disabled={currentPage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight size={17} /></IconButton></div></footer>
      </Panel>

      <Drawer open={Boolean(selected)} title={selected ? `Проверка ${selected.id.slice(0, 8)}` : 'Проверка'} eyebrow={selected?.id} onClose={() => setSelectedId(null)}>
        {selected ? (
          <div className="analysis-drawer">
            <div className="analysis-outcome"><span>{selected.status === 'completed' ? '✓' : selected.status === 'failed' ? '!' : '…'}</span><div><small>{statusLabel[selected.status]}</small><strong>{selected.errorCode ?? (recommendations(selected).map(({ hero }) => hero.localizedName).join(', ') || 'Результат формируется')}</strong><p>{accountLabel(selected)} · {formatDateTime(selected.createdAt)}</p></div></div>

            {selected.dataQuality.input === 'legacy_invalid' || selected.dataQuality.result === 'legacy_invalid' ? (
              <section className="drawer-section">
                <div className="drawer-section__heading"><h3>Качество сохранённых данных</h3><StatusBadge tone="warning">Legacy payload</StatusBadge></div>
                <div className="data-availability-note data-availability-note--stacked"><span>Одна из старых записей не соответствует текущей схеме. Страница продолжает работать; невалидный payload доступен ниже без попытки выдать его за нормализованный результат.</span><ul>{selected.dataQuality.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>
                {selected.dataQuality.input === 'legacy_invalid' ? <details className="analysis-json-details"><summary>Raw input</summary><pre>{JSON.stringify(selected.rawInput, null, 2)}</pre></details> : null}
                {selected.dataQuality.result === 'legacy_invalid' ? <details className="analysis-json-details"><summary>Raw result</summary><pre>{JSON.stringify(selected.rawResult, null, 2)}</pre></details> : null}
              </section>
            ) : null}

            <section className="drawer-section">
              <div className="drawer-section__heading"><h3>Драфт</h3><StatusBadge tone={selected.input ? 'info' : 'warning'}>{selected.input ? `Позиция ${selected.input.position}` : 'Legacy input'}</StatusBadge></div>
              {heroCatalog.loading && !heroCatalog.data ? <p className="muted-message">Загружаем справочник героев для подписей и изображений…</p> : null}
              {heroCatalog.error ? <div className="data-availability-note"><span>Справочник героев сейчас недоступен. Ниже сохранены точные числовые ID из анализа.</span><button type="button" onClick={onHeroCatalogRetry}>Повторить</button></div> : null}
              {selected.input ? <div className="analysis-draft-groups"><div><span>Союзники</span><HeroReferences heroIds={selected.input.allyHeroIds} heroes={heroById} emptyLabel="Нет" /></div><div><span>Противники</span><HeroReferences heroIds={selected.input.enemyHeroIds} heroes={heroById} emptyLabel="Нет" /></div><div><span>Баны</span><HeroReferences heroIds={selected.input.bannedHeroIds} heroes={heroById} emptyLabel="Нет" /></div></div> : <p className="muted-message">Нормализованный драфт недоступен; сохранённый raw input показан в блоке качества данных.</p>}
            </section>

            <section className="drawer-section">
              <div className="drawer-section__heading"><h3>Рекомендации</h3><StatusBadge tone={selected.result ? 'positive' : 'warning'}>{selected.result ? selected.result.recommendations.length : 0}</StatusBadge></div>
              {selected.result ? (
                <div className="analysis-recommendation-list">
                  {selected.result.recommendations.map((recommendation) => <RecommendationCard key={recommendation.hero.id} recommendation={recommendation} />)}
                  <div className="analysis-provenance">
                    <Sparkles size={17} />
                    <div><strong>{selected.result.provenance?.engineVersion ?? 'Версия движка не сохранена'}</strong><p>{selected.result.provenance ? `${selected.result.provenance.scoringVersion} · ${selected.result.provenance.aiAssisted ? `AI ${selected.result.provenance.model ?? ''}`.trim() : 'детерминированный расчёт'}` : 'Старый результат без provenance metadata'}</p></div>
                  </div>
                  <details className="analysis-json-details"><summary>Полный сохранённый result payload</summary><pre>{JSON.stringify(selected.result, null, 2)}</pre></details>
                </div>
              ) : <p className="muted-message">{selected.dataQuality.result === 'legacy_invalid' ? 'Нормализованный результат недоступен; сохранённый raw result показан в блоке качества данных.' : 'Для незавершённой или ошибочной проверки результат в базе отсутствует.'}</p>}
            </section>

            <section className="drawer-section">
              <div className="drawer-section__heading"><h3>Исходное изображение</h3><ImageOff size={18} /></div>
              <div className="source-image-status"><span><ImageOff size={18} /></span><div><strong>{selected.sourceImage.status === 'not_stored' ? 'Исходник не хранится' : 'Изображение не применимо'}</strong><p>{selected.sourceImage.detail}</p></div></div>
            </section>

            <section className="drawer-section drawer-section--details">
              <h3>Технические данные</h3>
              <dl>
                <div><dt>Источник</dt><dd>{formatAnalysisSource(selected.source)}</dd></div>
                <div><dt>Патч</dt><dd>{selected.patch ?? '—'}</dd></div>
                <div><dt>Ранг</dt><dd>{selected.input?.rank ?? 'Не указан'}</dd></div>
                <div><dt>Ревизия</dt><dd>{selected.revision}</dd></div>
                <div><dt>{durationTitle(selected)}</dt><dd>{selected.durationKind === 'in_progress' ? 'В процессе' : formatDuration(selected.durationMs)}</dd></div>
                <div><dt>Обновлена</dt><dd>{formatDateTime(selected.updatedAt)}</dd></div>
                <div><dt>Код ошибки</dt><dd>{selected.errorCode ?? 'Нет'}</dd></div>
                <div><dt>Метаданные меты</dt><dd>{selected.result ? formatDateTime(selected.result.metaFetchedAt) : 'Нет результата'}</dd></div>
              </dl>
              {selected.errorCode ? <p className="data-availability-note">В базе хранится код ошибки. Stack trace не сохраняется в анализе и доступен только в структурированных runtime-логах.</p> : null}
            </section>

            <section className="drawer-section">
              <div className="drawer-section__heading"><h3>История квоты</h3><CircleDollarSign size={18} /></div>
              {selected.quotaEvents.length ? <div className="quota-event-list">{selected.quotaEvents.map((event) => <div key={event.id}><span>{event.delta > 0 ? `+${event.delta}` : event.delta}</span><p><strong>{event.reason === 'analysis' ? 'Списание за анализ' : 'Возврат'}</strong><small>{formatDateTime(event.createdAt)} · {event.id}</small></p></div>)}</div> : <p className="muted-message">Связанных событий квоты в базе нет.</p>}
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
