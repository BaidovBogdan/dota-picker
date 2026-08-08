import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, MessageSquareText, ShieldCheck, Star, Trash2 } from 'lucide-react';
import type { PageResource } from '../App';
import { RatingDistributionChart } from '../components/charts';
import {
  Button,
  ConfirmDialog,
  CustomSelect,
  Drawer,
  EmptyState,
  IconButton,
  Panel,
  SearchInput,
  StatusBadge,
  TableRowButton,
} from '../components/ui';
import { formatAnalysisSource, formatCount, formatDateTime, formatRelativeTime } from '../lib/format';
import { useDebouncedValue } from '../lib/use-debounced-value';
import type { AdminReview, AdminReviewsQuery, AdminReviewsResponse } from '../types';

const pageSize = 20;

function accountLabel(review: AdminReview) {
  return review.account.email ?? `Гость ${review.account.id.slice(0, 8)}`;
}

function Stars({ rating }: { rating: number }) {
  return <span className="review-stars" aria-label={`${rating} из 5`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < rating ? 'currentColor' : 'none'} />)}</span>;
}

export function ReviewsPage({
  resource,
  initialQuery,
  onRetry,
  onQueryChange,
  onDelete,
  onOpenAnalysis,
}: {
  resource: PageResource<AdminReviewsResponse>;
  initialQuery: AdminReviewsQuery;
  onRetry: () => void;
  onQueryChange: (query: AdminReviewsQuery) => void;
  onDelete: (reviewId: string) => Promise<void>;
  onOpenAnalysis: (analysisId: string) => void;
}) {
  const [query, setQuery] = useState(() => initialQuery.q ?? '');
  const [rating, setRating] = useState<'all' | '1' | '2' | '3' | '4' | '5'>(() => initialQuery.rating ? String(initialQuery.rating) as '1' | '2' | '3' | '4' | '5' : 'all');
  const [hasComment, setHasComment] = useState<'all' | 'true' | 'false'>(() => initialQuery.hasComment ?? 'all');
  const [page, setPage] = useState(() => Math.floor(initialQuery.offset / pageSize) + 1);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const items = resource.data?.items ?? [];
  const total = resource.data?.pagination.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pages);

  useEffect(() => {
    onQueryChange({
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      q: debouncedQuery || undefined,
      accountId: initialQuery.accountId,
      rating: rating === 'all' ? undefined : Number(rating) as 1 | 2 | 3 | 4 | 5,
      hasComment: hasComment === 'all' ? undefined : hasComment,
    });
  }, [currentPage, debouncedQuery, hasComment, initialQuery.accountId, onQueryChange, rating]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  useEffect(() => {
    if (selectedId && !items.some((review) => review.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  const selectedReview = items.find((review) => review.id === selectedId) ?? null;
  const clearScope = () => {
    setPage(1);
    onQueryChange({
      limit: pageSize,
      offset: 0,
      q: debouncedQuery || undefined,
      rating: rating === 'all' ? undefined : Number(rating) as 1 | 2 | 3 | 4 | 5,
      hasComment: hasComment === 'all' ? undefined : hasComment,
    });
  };

  if (resource.loading && !resource.data) return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--table" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Отзывы недоступны" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!resource.data) return <EmptyState title="Нет данных" text="API не вернул отзывы." action={<Button onClick={onRetry}>Обновить</Button>} />;

  const confirmDelete = async () => {
    if (!deleteCandidate || deleting) return;
    setDeleting(true);
    setActionError('');
    try {
      await onDelete(deleteCandidate.id);
      setDeleteCandidate(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось удалить отзыв.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-heading"><div><span className="eyebrow">Модерация из базы</span><h1>Отзывы</h1><p>{formatCount(resource.data.pagination.total, ['отзыв', 'отзыва', 'отзывов'])} по текущим фильтрам.</p></div></header>
      {resource.error ? <div className="inline-error"><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}
      {initialQuery.accountId ? <div className="scope-banner" role="status"><span><ShieldCheck size={16} />Отзывы аккаунта {initialQuery.accountId}</span><button type="button" onClick={clearScope}>Показать все</button></div> : null}

      <div className="review-metrics review-metrics--production">
        <Panel className="review-score-card"><span>Средняя оценка</span><strong>{resource.data.summary.averageRating?.toFixed(2) ?? '—'}</strong><Stars rating={Math.round(resource.data.summary.averageRating ?? 0)} /><small>{formatCount(resource.data.summary.count, ['оценка', 'оценки', 'оценок'])}</small></Panel>
        <Panel className="review-distribution" ariaLabel="Распределение оценок">
          <div className="review-distribution__heading"><strong>Распределение</strong><small>Нажмите строку, чтобы отфильтровать таблицу</small></div>
          <RatingDistributionChart
            distribution={resource.data.summary.distribution}
            total={resource.data.summary.count}
            selectedRating={rating === 'all' ? null : Number(rating) as 1 | 2 | 3 | 4 | 5}
            onSelect={(value) => { setRating(value === null ? 'all' : String(value) as '1' | '2' | '3' | '4' | '5'); setPage(1); }}
          />
        </Panel>
        <Panel className="review-score-card"><span>Пять звёзд</span><strong>{resource.data.summary.distribution[5]}</strong><MessageSquareText size={20} /><small>в текущей выборке</small></Panel>
      </div>

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Комментарий, email или ID" ariaLabel="Поиск отзывов" />
          <div className="table-toolbar__filters">
            <CustomSelect value={rating} onChange={(value) => { setRating(value); setPage(1); }} ariaLabel="Оценка" label="Оценка" options={[{ value: 'all', label: 'Все оценки' }, { value: '5', label: '5 звёзд' }, { value: '4', label: '4 звезды' }, { value: '3', label: '3 звезды' }, { value: '2', label: '2 звезды' }, { value: '1', label: '1 звезда' }]} />
            <CustomSelect value={hasComment} onChange={(value) => { setHasComment(value); setPage(1); }} ariaLabel="Наличие комментария" label="Комментарий" options={[{ value: 'all', label: 'Любой' }, { value: 'true', label: 'Есть' }, { value: 'false', label: 'Нет' }]} />
          </div>
        </div>

        {items.length ? (
          <div className={`data-table-wrap ${resource.loading ? 'is-loading' : ''}`} aria-busy={resource.loading}><table className="data-table review-table"><thead><tr><th>Пользователь</th><th>Оценка</th><th>Выбранные герои</th><th>Комментарий</th><th>Анализ</th><th>Дата</th><th><span className="sr-only">Удалить</span></th></tr></thead><tbody>
            {items.map((review) => {
              const selected = review.analysis.recommendations.filter((hero) => review.selectedHeroIds.includes(hero.id));
              return (
                <tr key={review.id} onClick={() => setSelectedId(review.id)}>
                  <td><strong>{accountLabel(review)}</strong><small className="table-subvalue">{review.account.kind === 'guest' ? 'Гость' : 'Аккаунт'}</small></td>
                  <td><Stars rating={review.rating} /></td>
                  <td>{selected.length ? <div className="review-heroes">{selected.map((hero) => <span key={hero.id}><img src={hero.iconUrl} alt="" /><small>{hero.localizedName}</small></span>)}</div> : review.selectedHeroIds.length ? <span className="review-empty-value">Сохранены ID: {review.selectedHeroIds.join(', ')}</span> : <span className="review-empty-value">Не выбраны</span>}</td>
                  <td><p className="review-comment">{review.comment ?? 'Без комментария'}</p></td>
                  <td><div className="review-analysis"><strong>{review.analysis.patch ?? 'Патч не сохранён'}</strong><small>{formatAnalysisSource(review.analysis.source)} · {review.analysisId.slice(0, 8)}</small></div></td>
                  <td><span className="table-date">{formatRelativeTime(review.updatedAt)}</span></td>
                  <td onClick={(event) => event.stopPropagation()}><div className="table-row-actions"><TableRowButton label={`Открыть отзыв ${review.id}`} onClick={() => setSelectedId(review.id)} /><IconButton label={`Удалить отзыв ${review.id}`} onClick={() => { setActionError(''); setDeleteCandidate(review); }}><Trash2 size={16} /></IconButton></div></td>
                </tr>
              );
            })}
          </tbody></table></div>
        ) : <EmptyState title="Отзывов не найдено" text={query || rating !== 'all' || hasComment !== 'all' || initialQuery.accountId ? 'Измените фильтр или снимите ограничение истории.' : 'Пользователи ещё не оставили отзывов.'} />}

        <footer className="table-footer"><span>{total ? `${resource.data.pagination.offset + 1}–${resource.data.pagination.offset + items.length} из ${total}` : '0 записей'}</span><div><IconButton label="Предыдущая страница" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></IconButton><span>{currentPage} / {pages}</span><IconButton label="Следующая страница" disabled={currentPage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight size={17} /></IconButton></div></footer>
      </Panel>

      <Drawer open={Boolean(selectedReview)} title={selectedReview ? `Отзыв ${selectedReview.id.slice(0, 8)}` : 'Отзыв'} eyebrow={selectedReview?.id} onClose={() => setSelectedId(null)}>
        {selectedReview ? (
          <div className="review-drawer">
            <div className="review-drawer__score"><Stars rating={selectedReview.rating} /><strong>{selectedReview.rating}/5</strong><StatusBadge tone={selectedReview.account.plan === 'pro' ? 'info' : 'neutral'}>{selectedReview.account.plan === 'pro' ? 'Pro' : 'Free'}</StatusBadge></div>
            <section className="drawer-section"><h3>Комментарий</h3><p className="review-drawer__comment">{selectedReview.comment ?? 'Пользователь не оставил комментарий.'}</p></section>
            {selectedReview.analysis.dataQuality.result !== 'valid' ? (
              <section className="drawer-section">
                <div className="drawer-section__heading"><h3>Качество результата</h3><StatusBadge tone="warning">{selectedReview.analysis.dataQuality.result === 'absent' ? 'Результат отсутствует' : 'Legacy payload'}</StatusBadge></div>
                <div className="data-availability-note data-availability-note--stacked">
                  <span>{selectedReview.analysis.dataQuality.result === 'absent' ? 'У связанного анализа нет сохранённого результата. Герои не восстановлены.' : 'Старый result payload не соответствует текущей схеме. Герои и изображения не подменяются фиктивными данными.'}</span>
                  {selectedReview.selectedHeroIds.length ? <code>Выбранные Hero ID: {selectedReview.selectedHeroIds.join(', ')}</code> : null}
                  {selectedReview.analysis.dataQuality.issues.length ? <ul>{selectedReview.analysis.dataQuality.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
                </div>
                {selectedReview.analysis.dataQuality.result === 'legacy_invalid' ? <details className="analysis-json-details"><summary>Raw result</summary><pre>{JSON.stringify(selectedReview.analysis.rawResult, null, 2)}</pre></details> : null}
              </section>
            ) : null}
            <section className="drawer-section">
              <div className="drawer-section__heading"><h3>Рекомендации анализа</h3><StatusBadge tone="info">{selectedReview.analysis.recommendations.length}</StatusBadge></div>
              {selectedReview.analysis.recommendations.length ? <div className="review-drawer__heroes">{selectedReview.analysis.recommendations.map((hero) => {
                const isSelected = selectedReview.selectedHeroIds.includes(hero.id);
                return <div className={isSelected ? 'is-selected' : ''} key={hero.id}><img src={hero.imageUrl} alt="" loading="lazy" /><span><strong>{hero.localizedName}</strong><small>{isSelected ? 'Выбран пользователем' : `Hero ID ${hero.id}`}</small></span></div>;
              })}</div> : <p className="data-availability-note">В текущем сохранённом результате нет валидных рекомендаций.</p>}
            </section>
            <section className="drawer-section drawer-section--details"><h3>Связи и даты</h3><dl><div><dt>Account ID</dt><dd className="drawer-code-value"><code>{selectedReview.account.id}</code></dd></div><div><dt>Analysis ID</dt><dd className="drawer-code-value"><code>{selectedReview.analysisId}</code></dd></div><div><dt>Источник</dt><dd>{formatAnalysisSource(selectedReview.analysis.source)}</dd></div><div><dt>Патч</dt><dd>{selectedReview.analysis.patch ?? 'Не сохранён'}</dd></div><div><dt>Создан</dt><dd>{formatDateTime(selectedReview.createdAt)}</dd></div><div><dt>Обновлён</dt><dd>{formatDateTime(selectedReview.updatedAt)}</dd></div></dl></section>
            <Button icon={<ExternalLink size={16} />} onClick={() => onOpenAnalysis(selectedReview.analysisId)}>Открыть связанный анализ</Button>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog open={Boolean(deleteCandidate)} title="Удалить отзыв?" description={deleteCandidate ? `Отзыв ${deleteCandidate.id} будет безвозвратно удалён из подключённой базы. Пользователь: ${accountLabel(deleteCandidate)}. Создан ${formatDateTime(deleteCandidate.createdAt)}.` : ''} confirmLabel={deleting ? 'Удаляем…' : 'Удалить отзыв'} onConfirm={() => void confirmDelete()} onCancel={() => { if (!deleting) setDeleteCandidate(null); }} />
      {actionError ? <div className="action-error-toast" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError('')}>Закрыть</button></div> : null}
    </div>
  );
}
