import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
  Star,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import {
  ConfirmDialog,
  CustomSelect,
  EmptyState,
  IconButton,
  Panel,
  SearchInput,
  UserAvatar,
} from '../components/ui';
import { formatDateTime, formatNumber, formatRelativeTime } from '../lib/format';
import type { AdminAnalysis, AdminReview, AdminUser } from '../types';

type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';

type ReviewsPageProps = {
  reviews: AdminReview[];
  users: AdminUser[];
  analyses: AdminAnalysis[];
  onDelete: (review: AdminReview) => void;
};

const pageSize = 12;

function RatingStars({ value }: { value: number }) {
  return (
    <span className="review-stars" aria-label={`${value} из 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={14} fill={star <= value ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

export function ReviewsPage({
  reviews,
  users,
  analyses,
  onDelete,
}: ReviewsPageProps) {
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState<RatingFilter>('all');
  const [page, setPage] = useState(1);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminReview | null>(null);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const analysesById = useMemo(
    () => new Map(analyses.map((analysis) => [analysis.id, analysis])),
    [analyses],
  );
  const average = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
  const commentsCount = reviews.filter((review) => review.comment).length;
  const positiveCount = reviews.filter((review) => review.rating >= 4).length;
  const distribution = [5, 4, 3, 2, 1].map((value) => ({
    rating: value,
    count: reviews.filter((review) => review.rating === value).length,
  }));

  const filteredReviews = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reviews
      .filter((review) => rating === 'all' || review.rating === Number(rating))
      .filter((review) => {
        if (!normalizedQuery) return true;
        const user = usersById.get(review.userId);
        return review.id.toLowerCase().includes(normalizedQuery)
          || review.analysisId.toLowerCase().includes(normalizedQuery)
          || review.comment?.toLowerCase().includes(normalizedQuery)
          || user?.displayName.toLowerCase().includes(normalizedQuery)
          || user?.email?.toLowerCase().includes(normalizedQuery)
          || review.selectedHeroes.some((hero) => hero.name.toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [query, rating, reviews, usersById]);

  const pages = Math.max(1, Math.ceil(filteredReviews.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleReviews = filteredReviews.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => setPage(1), [query, rating]);
  useEffect(() => setPage((current) => Math.min(current, pages)), [pages]);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Качество рекомендаций</span>
          <h1>Отзывы</h1>
          <p>{formatNumber(reviews.length)} отзывов в текущем демо-наборе.</p>
        </div>
      </header>

      <div className="review-metrics">
        <article className="metric-card metric-card--featured">
          <div className="metric-card__top">
            <span className="metric-card__label">Средняя оценка</span>
            <span className="metric-card__icon"><Star size={17} /></span>
          </div>
          <strong>{average.toFixed(2)}</strong>
          <div className="metric-card__footer"><RatingStars value={Math.round(average)} /></div>
        </article>
        <article className="metric-card">
          <div className="metric-card__top">
            <span className="metric-card__label">Всего отзывов</span>
            <span className="metric-card__icon"><MessageSquareText size={17} /></span>
          </div>
          <strong>{formatNumber(reviews.length)}</strong>
          <div className="metric-card__footer">{commentsCount} с комментарием</div>
        </article>
        <article className="metric-card">
          <div className="metric-card__top">
            <span className="metric-card__label">Положительные</span>
            <span className="metric-card__icon"><UserRoundCheck size={17} /></span>
          </div>
          <strong>{reviews.length ? `${Math.round((positiveCount / reviews.length) * 100)}%` : '0%'}</strong>
          <div className="metric-card__footer">Оценки 4 и 5</div>
        </article>
        <Panel className="review-distribution">
          <strong>Распределение</strong>
          <div>
            {distribution.map((item) => (
              <span key={item.rating}>
                <small>{item.rating}</small>
                <Star size={10} fill="currentColor" />
                <i><b style={{ width: `${reviews.length ? (item.count / reviews.length) * 100 : 0}%` }} /></i>
                <em>{item.count}</em>
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Пользователь, отзыв, анализ или герой"
            ariaLabel="Поиск отзывов"
          />
          <div className="table-toolbar__filters">
            <CustomSelect
              value={rating}
              onChange={setRating}
              ariaLabel="Оценка отзыва"
              label="Оценка"
              options={[
                { value: 'all', label: 'Все оценки' },
                { value: '5', label: '5 звёзд' },
                { value: '4', label: '4 звезды' },
                { value: '3', label: '3 звезды' },
                { value: '2', label: '2 звезды' },
                { value: '1', label: '1 звезда' },
              ]}
            />
          </div>
        </div>

        {visibleReviews.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table review-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Оценка</th>
                  <th>Выбранные герои</th>
                  <th>Комментарий</th>
                  <th>Анализ</th>
                  <th>Дата</th>
                  <th><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleReviews.map((review) => {
                  const user = usersById.get(review.userId);
                  const analysis = analysesById.get(review.analysisId);
                  return (
                    <tr key={review.id}>
                      <td>
                        <div className="table-user table-user--compact">
                          <UserAvatar name={user?.displayName ?? 'Deleted'} size="sm" />
                          <span>
                            <strong>{user?.displayName ?? 'Удалённый аккаунт'}</strong>
                            <small>{user?.email ?? review.userId}</small>
                          </span>
                        </div>
                      </td>
                      <td><RatingStars value={review.rating} /></td>
                      <td>
                        {review.selectedHeroes.length > 0 ? (
                          <div className="review-heroes">
                            {review.selectedHeroes.map((hero) => (
                              <span key={hero.id} title={hero.name}>
                                <img src={hero.imageUrl} alt="" loading="lazy" />
                                <small>{hero.name}</small>
                              </span>
                            ))}
                          </div>
                        ) : <span className="review-empty-value">Не выбраны</span>}
                      </td>
                      <td>
                        <p className="review-comment">{review.comment ?? 'Без комментария'}</p>
                      </td>
                      <td>
                        <span className="review-analysis">
                          <strong>{review.analysisId}</strong>
                          <small>{analysis ? `${analysis.source === 'photo' ? 'Фото' : 'Вручную'} · патч ${analysis.patch}` : 'Анализ удалён'}</small>
                        </span>
                      </td>
                      <td>
                        <span className="table-date" title={formatDateTime(review.updatedAt)}>
                          {formatRelativeTime(review.updatedAt)}
                        </span>
                      </td>
                      <td>
                        <IconButton
                          label={`Удалить отзыв ${review.id}`}
                          className="review-delete"
                          onClick={() => setDeleteCandidate(review)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Отзывы не найдены"
            text="Измени запрос или выбери другую оценку."
          />
        )}

        <footer className="table-footer">
          <span>
            {filteredReviews.length
              ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredReviews.length)} из ${filteredReviews.length}`
              : '0 записей'}
          </span>
          <div>
            <IconButton label="Предыдущая страница" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft size={17} />
            </IconButton>
            <span>{currentPage} / {pages}</span>
            <IconButton label="Следующая страница" disabled={currentPage === pages} onClick={() => setPage((value) => value + 1)}>
              <ChevronRight size={17} />
            </IconButton>
          </div>
        </footer>
      </Panel>

      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="Удалить отзыв?"
        description="Отзыв исчезнет из демо-набора административной панели. Отменить это действие нельзя."
        confirmLabel="Удалить отзыв"
        onConfirm={() => {
          if (deleteCandidate) onDelete(deleteCandidate);
          setDeleteCandidate(null);
        }}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  );
}
