import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircleIcon,
  PaperPlaneTiltIcon,
  StarIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';

import { desktop } from '../bridge';
import { AppSelect } from '../components/app-select';
import { formatDateTime, heroName } from '../format';
import { AsyncState, Button, HeroIcon, InputField, Page } from '../components/ui';

const reviewSchema = z.object({
  analysisId: z.string().min(1, 'Выберите результат'),
  rating: z.number().int().min(1, 'Поставьте оценку').max(5),
  selectedHeroIds: z.array(z.number().int().positive()).max(3),
  comment: z.string().trim().max(500, 'Не более 500 символов'),
});

type ReviewForm = z.infer<typeof reviewSchema>;

export function ReviewsPage() {
  const [params] = useSearchParams();
  const requestedAnalysisId = params.get('analysis');
  const queryClient = useQueryClient();

  const reviewsQuery = useQuery({
    queryKey: ['reviews'],
    queryFn: () => desktop.data.reviews({ limit: 30 }),
  });
  const historyQuery = useQuery({
    queryKey: ['history', 'review-picker'],
    queryFn: () => desktop.data.history({ limit: 30 }),
  });
  const form = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      analysisId: requestedAnalysisId ?? '',
      rating: 0,
      selectedHeroIds: [],
      comment: '',
    },
  });

  const selectedAnalysisId = form.watch('analysisId');
  const selectedAnalysis = useMemo(
    () => historyQuery.data?.items.find((item) => item.id === selectedAnalysisId),
    [historyQuery.data?.items, selectedAnalysisId],
  );
  const analysisOptions = useMemo(
    () =>
      historyQuery.data?.items.map((analysis) => {
        const hero = analysis.result.recommendations[0]?.hero;
        return {
          value: analysis.id,
          label: heroName(hero),
          description: formatDateTime(analysis.createdAt),
          icon: <HeroIcon hero={hero} />,
        };
      }) ?? [],
    [historyQuery.data?.items],
  );

  useEffect(() => {
    if (!requestedAnalysisId || !historyQuery.data?.items.some((item) => item.id === requestedAnalysisId)) {
      return;
    }
    form.setValue('analysisId', requestedAnalysisId);
  }, [form, historyQuery.data?.items, requestedAnalysisId]);

  const saveMutation = useMutation({
    mutationFn: (input: ReviewForm) =>
      desktop.data.upsertReview(input.analysisId, {
        rating: input.rating,
        selectedHeroIds: input.selectedHeroIds,
        ...(input.comment ? { comment: input.comment } : {}),
      }),
    onSuccess: () => {
      form.reset({
        analysisId: '',
        rating: 0,
        selectedHeroIds: [],
        comment: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: desktop.data.deleteReview,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reviews'] }),
  });

  return (
    <Page
      title="Ваши оценки"
      description="Отмечайте полезные рекомендации. Комментарий и выбранный герой помогают точнее проверять алгоритм."
      className="reviews-page"
    >
      <section className="reviews-layout" data-reveal>
        <section className="review-composer" aria-labelledby="review-composer-title">
          <div className="section-heading">
            <div>
              <h2 id="review-composer-title">Оценить рекомендацию</h2>
              <p>Оценку всегда можно изменить позже</p>
            </div>
          </div>
          <form onSubmit={form.handleSubmit((value) => saveMutation.mutate(value))} noValidate>
            <InputField
              label="Результат"
              error={form.formState.errors.analysisId?.message}
            >
              <Controller
                control={form.control}
                name="analysisId"
                render={({ field }) => (
                  <AppSelect
                    className="review-analysis-select"
                    label="Результат анализа"
                    placeholder="Выберите расчёт"
                    value={field.value}
                    options={analysisOptions}
                    disabled={historyQuery.isPending || !analysisOptions.length}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </InputField>

            <InputField label="Насколько полезен ответ?" error={form.formState.errors.rating?.message}>
              <Controller
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <div className="rating-input" aria-label="Оценка от 1 до 5">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={field.value >= value ? 'is-active' : ''}
                        aria-label={`${value} из 5`}
                        aria-pressed={field.value === value}
                        onClick={() => field.onChange(value)}
                      >
                        <StarIcon
                          size={24}
                          weight={field.value >= value ? 'fill' : 'regular'}
                          aria-hidden
                        />
                      </button>
                    ))}
                    <span>{field.value ? `${field.value}/5` : 'Без оценки'}</span>
                  </div>
                )}
              />
            </InputField>

            {selectedAnalysis?.result.recommendations.length ? (
              <InputField label="Кого вы выбрали?">
                <Controller
                  control={form.control}
                  name="selectedHeroIds"
                  render={({ field }) => (
                    <div className="review-hero-picker">
                      {selectedAnalysis.result.recommendations.map((item) => {
                        const selected = field.value.includes(item.hero.id);
                        return (
                          <button
                            type="button"
                            key={item.hero.id}
                            className={selected ? 'is-active' : ''}
                            aria-pressed={selected}
                            onClick={() =>
                              field.onChange(
                                selected
                                  ? field.value.filter((id) => id !== item.hero.id)
                                  : [...field.value, item.hero.id].slice(0, 3),
                              )
                            }
                          >
                            <HeroIcon hero={item.hero} />
                            <span>{heroName(item.hero)}</span>
                            {selected ? (
                              <CheckCircleIcon size={17} weight="duotone" aria-hidden />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </InputField>
            ) : null}

            <InputField
              label="Комментарий"
              error={form.formState.errors.comment?.message}
              hint={`${form.watch('comment').length}/500`}
            >
              <textarea
                rows={4}
                placeholder="Что оказалось полезным или неточным?"
                {...form.register('comment')}
              />
            </InputField>

            {saveMutation.isError ? (
              <p className="form-error" role="alert">
                Не удалось сохранить оценку. Попробуйте ещё раз.
              </p>
            ) : null}
            {saveMutation.isSuccess ? (
              <p className="form-success" role="status">
                <CheckCircleIcon size={16} weight="duotone" aria-hidden />
                Оценка сохранена
              </p>
            ) : null}
            <Button type="submit" loading={saveMutation.isPending}>
              <PaperPlaneTiltIcon size={16} aria-hidden />
              Сохранить оценку
            </Button>
          </form>
        </section>

        <section className="review-history" aria-labelledby="review-history-title">
          <div className="section-heading">
            <div>
              <h2 id="review-history-title">Последние отзывы</h2>
              <p>Ваши оценки и заметки к расчётам</p>
            </div>
            <span aria-label={`Всего отзывов: ${reviewsQuery.data?.total ?? 0}`}>
              {reviewsQuery.data?.total ?? 0}
            </span>
          </div>
          {reviewsQuery.isPending ? (
            <AsyncState status="loading" />
          ) : reviewsQuery.isError ? (
            <AsyncState status="error" onRetry={() => void reviewsQuery.refetch()} />
          ) : reviewsQuery.data?.items.length ? (
            <div className="review-list">
              {reviewsQuery.data.items.map((review) => (
                <article className="review-card" key={review.id}>
                  <div className="review-card__head">
                    <span className="review-card__rating">
                      <StarIcon size={15} weight="fill" aria-hidden />
                      {review.rating}/5
                    </span>
                    <span>{formatDateTime(review.updatedAt)}</span>
                    <button
                      type="button"
                      aria-label="Удалить отзыв"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (globalThis.confirm('Удалить этот отзыв?')) {
                          deleteMutation.mutate(review.id);
                        }
                      }}
                    >
                      <TrashIcon size={16} aria-hidden />
                    </button>
                  </div>
                  {review.analysis?.recommendations[0] ? (
                    <Link to={`/result/${review.analysisId}`} className="review-card__analysis">
                      <HeroIcon hero={review.analysis.recommendations[0]} />
                      <span>
                        <strong>{heroName(review.analysis.recommendations[0])}</strong>
                        <small>Патч {review.analysis.patch}</small>
                      </span>
                    </Link>
                  ) : null}
                  <p>{review.comment || 'Без текстового комментария'}</p>
                </article>
              ))}
            </div>
          ) : (
            <AsyncState
              status="empty"
              title="Отзывов пока нет"
              description="Выберите один из результатов и поставьте первую оценку."
            />
          )}
        </section>
      </section>
    </Page>
  );
}
