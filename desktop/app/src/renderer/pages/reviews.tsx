import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChartLineUpIcon,
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
import { useI18n } from '../i18n';
import { AsyncState, Button, HeroIcon, InputField, Page } from '../components/ui';

type ReviewForm = {
  analysisId: string;
  rating: number;
  selectedHeroIds: number[];
  comment: string;
};

export function ReviewsPage() {
  const { language, text } = useI18n();
  const [params] = useSearchParams();
  const requestedAnalysisId = params.get('analysis');
  const queryClient = useQueryClient();
  const reviewSchema = useMemo(() => z.object({
    analysisId: z.string().min(1, text('Выберите результат', 'Select a result')),
    rating: z.number().int().min(1, text('Поставьте оценку', 'Add a rating')).max(5),
    selectedHeroIds: z.array(z.number().int().positive()).max(3),
    comment: z.string().trim().max(500, text('Не более 500 символов', 'No more than 500 characters')),
  }), [text]);

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
          label: heroName(hero, language),
          description: formatDateTime(analysis.createdAt, language),
          icon: <HeroIcon hero={hero} />,
        };
      }) ?? [],
    [historyQuery.data?.items, language],
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
      title={text('Ваши оценки', 'Your ratings')}
      description={text('Отмечайте полезные рекомендации. Комментарий и выбранный герой помогают точнее проверять алгоритм.', 'Rate useful recommendations. Your comment and selected hero help us evaluate the algorithm more accurately.')}
      className="reviews-page"
    >
      <section className="reviews-layout" data-reveal>
        <section className="review-composer" aria-label={text('Оценка рекомендаций', 'Recommendation ratings')}>
          {historyQuery.isPending ? (
            <AsyncState
              status="loading"
              title={text('Загружаем результаты', 'Loading results')}
              description={text('Проверяем, какие рекомендации уже можно оценить.', 'Checking which recommendations are ready to rate.')}
            />
          ) : historyQuery.isError ? (
            <AsyncState status="error" onRetry={() => void historyQuery.refetch()} />
          ) : analysisOptions.length ? (
            <>
              <div className="section-heading">
                <div>
                  <h2 id="review-composer-title">{text('Оценить рекомендацию', 'Rate a recommendation')}</h2>
                  <p>{text('Оценку всегда можно изменить позже', 'You can change your rating later')}</p>
                </div>
              </div>
              <form onSubmit={form.handleSubmit((value) => saveMutation.mutate(value))} noValidate>
                <InputField
                  label={text('Результат', 'Result')}
                  error={form.formState.errors.analysisId?.message}
                >
                  <Controller
                    control={form.control}
                    name="analysisId"
                    render={({ field }) => (
                      <AppSelect
                        className="review-analysis-select"
                        label={text('Результат анализа', 'Analysis result')}
                        placeholder={text('Выберите расчёт', 'Select a result')}
                        value={field.value}
                        options={analysisOptions}
                        disabled={historyQuery.isPending || !analysisOptions.length}
                        onValueChange={field.onChange}
                      />
                    )}
                  />
                </InputField>

                <InputField label={text('Насколько полезен ответ?', 'How useful was this answer?')} error={form.formState.errors.rating?.message}>
                  <Controller
                    control={form.control}
                    name="rating"
                    render={({ field }) => (
                      <div className="rating-input" aria-label={text('Оценка от 1 до 5', 'Rating from 1 to 5')}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            type="button"
                            key={value}
                            className={field.value >= value ? 'is-active' : ''}
                            aria-label={text(`${value} из 5`, `${value} out of 5`)}
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
                        <span>{field.value ? `${field.value}/5` : text('Без оценки', 'Not rated')}</span>
                      </div>
                    )}
                  />
                </InputField>

                {selectedAnalysis?.result.recommendations.length ? (
                  <InputField label={text('Кого вы выбрали?', 'Who did you pick?')}>
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
                                <span>{heroName(item.hero, language)}</span>
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
                  label={text('Комментарий', 'Comment')}
                  error={form.formState.errors.comment?.message}
                  hint={`${form.watch('comment').length}/500`}
                >
                  <textarea
                    rows={4}
                    placeholder={text('Что оказалось полезным или неточным?', 'What was useful or inaccurate?')}
                    {...form.register('comment')}
                  />
                </InputField>

                {saveMutation.isError ? (
                  <p className="form-error" role="alert">
                    {text('Не удалось сохранить оценку. Попробуйте ещё раз.', 'Could not save the rating. Try again.')}
                  </p>
                ) : null}
                {saveMutation.isSuccess ? (
                  <p className="form-success" role="status">
                    <CheckCircleIcon size={16} weight="duotone" aria-hidden />
                    {text('Оценка сохранена', 'Rating saved')}
                  </p>
                ) : null}
                <Button type="submit" loading={saveMutation.isPending}>
                  <PaperPlaneTiltIcon size={16} aria-hidden />
                  {text('Сохранить оценку', 'Save rating')}
                </Button>
              </form>
            </>
          ) : (
            <AsyncState
              status="empty"
              icon={<ChartLineUpIcon size={25} weight="duotone" />}
              title={text('Пока нечего оценивать', 'Nothing to rate yet')}
              description={text('Завершите первый анализ на главной странице. Когда рекомендации будут готовы, здесь появится форма оценки.', 'Complete your first analysis on the home page. Once recommendations are ready, the rating form will appear here.')}
            />
          )}
        </section>

        <section className="review-history" aria-labelledby="review-history-title">
          <div className="section-heading">
            <div>
              <h2 id="review-history-title">{text('Последние отзывы', 'Recent reviews')}</h2>
              <p>{text('Ваши оценки и заметки к расчётам', 'Your ratings and notes')}</p>
            </div>
            <span aria-label={text(`Всего отзывов: ${reviewsQuery.data?.total ?? 0}`, `Total reviews: ${reviewsQuery.data?.total ?? 0}`)}>
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
                    <span>{formatDateTime(review.updatedAt, language)}</span>
                    <button
                      type="button"
                      aria-label={text('Удалить отзыв', 'Delete review')}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (globalThis.confirm(text('Удалить этот отзыв?', 'Delete this review?'))) {
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
                        <strong>{heroName(review.analysis.recommendations[0], language)}</strong>
                        <small>{text('Патч', 'Patch')} {review.analysis.patch}</small>
                      </span>
                    </Link>
                  ) : null}
                  <p>{review.comment || text('Без текстового комментария', 'No written comment')}</p>
                </article>
              ))}
            </div>
          ) : (
            <AsyncState
              status="empty"
              title={text('Отзывов пока нет', 'No reviews yet')}
              description={text('После первой оценки ваши отзывы появятся здесь.', 'Your reviews will appear here after you submit your first rating.')}
            />
          )}
        </section>
      </section>
    </Page>
  );
}
