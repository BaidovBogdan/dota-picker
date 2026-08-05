import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquareText, Star, Trash2 } from 'lucide-react';
import type { PageResource } from '../App';
import {
  Button,
  ConfirmDialog,
  CustomSelect,
  EmptyState,
  IconButton,
  Panel,
  SearchInput,
} from '../components/ui';
import { formatDateTime, formatNumber, formatRelativeTime } from '../lib/format';
import type { AdminReview, AdminReviewsResponse } from '../types';

const pageSize = 10;

function accountLabel(review: AdminReview) {
  return review.account.email ?? `Гость ${review.account.id.slice(0, 8)}`;
}

function Stars({ rating }: { rating: number }) {
  return <span className="review-stars" aria-label={`${rating} из 5`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < rating ? 'currentColor' : 'none'} />)}</span>;
}

export function ReviewsPage({
  resource,
  onRetry,
  onDelete,
}: {
  resource: PageResource<AdminReviewsResponse>;
  onRetry: () => void;
  onDelete: (reviewId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all');
  const [page, setPage] = useState(1);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const items = resource.data?.items ?? [];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((review) => (
      (rating === 'all' || review.rating === Number(rating))
      && (!normalized
        || review.id.toLowerCase().includes(normalized)
        || review.analysisId.toLowerCase().includes(normalized)
        || review.account.email?.toLowerCase().includes(normalized)
        || review.comment?.toLowerCase().includes(normalized))
    ));
  }, [items, query, rating]);

  useEffect(() => setPage(1), [query, rating]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
      <header className="page-heading"><div><span className="eyebrow">Реальная модерация</span><h1>Отзывы</h1><p>{formatNumber(resource.data.pagination.total)} отзывов в production-базе.</p></div></header>
      {resource.error ? <div className="inline-error"><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <div className="review-metrics review-metrics--production">
        <Panel className="review-score-card"><span>Средняя оценка</span><strong>{resource.data.summary.averageRating?.toFixed(2) ?? '—'}</strong><Stars rating={Math.round(resource.data.summary.averageRating ?? 0)} /><small>{resource.data.summary.count} оценок</small></Panel>
        <Panel className="review-distribution">
          <strong>Распределение</strong>
          <div>{([5, 4, 3, 2, 1] as const).map((value) => { const count = resource.data!.summary.distribution[value]; const share = resource.data!.summary.count ? (count / resource.data!.summary.count) * 100 : 0; return <div key={value}><small>{value}</small><span><i style={{ width: `${share}%` }} /></span><em>{count}</em></div>; })}</div>
        </Panel>
        <Panel className="review-score-card"><span>С комментариями</span><strong>{items.filter((review) => Boolean(review.comment)).length}</strong><MessageSquareText size={20} /><small>среди загруженных записей</small></Panel>
      </div>

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Комментарий, email или ID" ariaLabel="Поиск отзывов" />
          <CustomSelect value={rating} onChange={setRating} ariaLabel="Оценка" label="Оценка" options={[{ value: 'all', label: 'Все оценки' }, { value: '5', label: '5 звёзд' }, { value: '4', label: '4 звезды' }, { value: '3', label: '3 звезды' }, { value: '2', label: '2 звезды' }, { value: '1', label: '1 звезда' }]} />
        </div>

        {visible.length ? (
          <div className="data-table-wrap"><table className="data-table review-table"><thead><tr><th>Пользователь</th><th>Оценка</th><th>Выбранные герои</th><th>Комментарий</th><th>Анализ</th><th>Дата</th><th><span className="sr-only">Удалить</span></th></tr></thead><tbody>
            {visible.map((review) => {
              const selected = review.analysis.recommendations.filter((hero) => review.selectedHeroIds.includes(hero.id));
              return (
                <tr key={review.id}>
                  <td><strong>{accountLabel(review)}</strong><small className="table-subvalue">{review.account.kind === 'guest' ? 'Гость' : 'Аккаунт'}</small></td>
                  <td><Stars rating={review.rating} /></td>
                  <td>{selected.length ? <div className="review-heroes">{selected.map((hero) => <span key={hero.id}><img src={hero.iconUrl} alt="" /><small>{hero.localizedName}</small></span>)}</div> : <span className="review-empty-value">Не выбраны</span>}</td>
                  <td><p className="review-comment">{review.comment ?? 'Без комментария'}</p></td>
                  <td><div className="review-analysis"><strong>{review.analysis.patch}</strong><small>{review.analysis.source === 'photo' ? 'Фото' : 'Вручную'} · {review.analysisId.slice(0, 8)}</small></div></td>
                  <td><span className="table-date">{formatRelativeTime(review.updatedAt)}</span></td>
                  <td><IconButton label={`Удалить отзыв ${review.id}`} onClick={() => { setActionError(''); setDeleteCandidate(review); }}><Trash2 size={16} /></IconButton></td>
                </tr>
              );
            })}
          </tbody></table></div>
        ) : <EmptyState title="Отзывов не найдено" text={items.length ? 'Измените фильтр или поисковый запрос.' : 'Пользователи ещё не оставили отзывов.'} />}

        <footer className="table-footer"><span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} из ${filtered.length}` : '0 записей'}{resource.data.pagination.total > items.length ? ` · всего в базе ${resource.data.pagination.total}` : ''}</span><div><IconButton label="Предыдущая страница" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></IconButton><span>{currentPage} / {pages}</span><IconButton label="Следующая страница" disabled={currentPage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight size={17} /></IconButton></div></footer>
      </Panel>

      <ConfirmDialog open={Boolean(deleteCandidate)} title="Удалить отзыв из production?" description={deleteCandidate ? `Отзыв ${deleteCandidate.id} будет безвозвратно удалён из базы. Пользователь: ${accountLabel(deleteCandidate)}. Создан ${formatDateTime(deleteCandidate.createdAt)}.` : ''} confirmLabel={deleting ? 'Удаляем…' : 'Удалить отзыв'} onConfirm={() => void confirmDelete()} onCancel={() => { if (!deleting) setDeleteCandidate(null); }} />
      {actionError ? <div className="action-error-toast" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError('')}>Закрыть</button></div> : null}
    </div>
  );
}
