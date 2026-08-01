import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  BookOpenTextIcon,
  BrainIcon,
  CaretDownIcon,
  ChartBarIcon,
  DatabaseIcon,
  GaugeIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  SparkleIcon,
  StackIcon,
  SwordIcon,
  TargetIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { desktop } from '../bridge';
import {
  confidenceName,
  formatDateTime,
  formatPercent,
  heroName,
  reasonName,
} from '../format';
import { useI18n } from '../i18n';
import { PositionLabel, RankLabel } from '../components/dota-taxonomy';
import {
  AsyncState,
  Badge,
  HeroArtwork,
  HeroIcon,
  Page,
  TextLink,
} from '../components/ui';
import type { Language, RecommendationMetrics, ScoreBreakdown } from '../types';

const metricLabels: Record<Language, Record<keyof RecommendationMetrics, string>> = {
  ru: {
    roleFit: 'Соответствие роли',
    counter: 'Сила контрпика',
    meta: 'Актуальность в мете',
    synergy: 'Синергия команды',
    reliability: 'Надёжность данных',
    coverage: 'Покрытие драфта',
    worstMatchup: 'Самое сложное противостояние',
  },
  en: {
    roleFit: 'Role fit',
    counter: 'Counter strength',
    meta: 'Meta relevance',
    synergy: 'Team synergy',
    reliability: 'Data reliability',
    coverage: 'Draft coverage',
    worstMatchup: 'Toughest matchup',
  },
};

const primaryMetricKeys = ['counter', 'roleFit', 'synergy', 'meta'] as const;

const breakdownLabels: Record<Language, Record<keyof ScoreBreakdown, string>> = {
  ru: {
    role: 'Соответствие роли',
    matchup: 'Противостояния',
    meta: 'Мета',
    teamFit: 'Состав команды',
    reliability: 'Надёжность данных',
    advisor: 'ИИ-корректировка',
    diversity: 'Разнообразие вариантов',
    total: 'Итог',
  },
  en: {
    role: 'Role fit',
    matchup: 'Matchups',
    meta: 'Meta',
    teamFit: 'Team composition',
    reliability: 'Data reliability',
    advisor: 'AI adjustment',
    diversity: 'Option diversity',
    total: 'Total',
  },
};

function Freshness({
  isStale,
}: {
  isStale: boolean | undefined;
}) {
  const { text } = useI18n();
  if (typeof isStale !== 'boolean') {
    return (
      <span className="evidence-freshness">
        {text('Не записана', 'Not recorded')}
      </span>
    );
  }

  return (
    <span className={`evidence-freshness ${isStale ? 'is-stale' : 'is-current'}`}>
      <SealCheckIcon size={14} weight="fill" aria-hidden />
      {isStale ? text('Устарела', 'Outdated') : text('Актуальна', 'Current')}
    </span>
  );
}

export function AnalysisPage() {
  const { language, locale, text } = useI18n();
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => desktop.data.analysis(id ?? ''),
    enabled: Boolean(id),
  });
  const heroesQuery = useQuery({
    queryKey: ['heroes'],
    queryFn: desktop.data.heroes,
    staleTime: 60 * 60_000,
  });
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);
  const integerFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const percentagePointFormatter = useMemo(
    () => new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    [locale],
  );
  const scoreFormatter = useMemo(
    () => new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    [locale],
  );

  const selected = useMemo(() => {
    const recommendations = query.data?.result.recommendations ?? [];
    return (
      recommendations.find((item) => item.hero.id === selectedHeroId) ??
      recommendations[0] ??
      null
    );
  }, [query.data?.result.recommendations, selectedHeroId]);

  const heroesById = useMemo(
    () => new Map(heroesQuery.data?.map((hero) => [hero.id, hero]) ?? []),
    [heroesQuery.data],
  );

  if (query.isPending) {
    return (
      <main className="page" id="main-content">
        <AsyncState
          status="loading"
          title={text('Восстанавливаем расчёт', 'Restoring calculation')}
        />
      </main>
    );
  }

  if (query.isError || !query.data || !selected) {
    return (
      <main className="page" id="main-content">
        <AsyncState
          status="error"
          title={text('Результат не найден', 'Result not found')}
          description={text(
            'Запись могла быть удалена или сервер временно недоступен.',
            'The record may have been deleted, or the server may be temporarily unavailable.',
          )}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  const analysis = query.data;
  const evidence = selected.evidence;
  const provenance = analysis.result.provenance;
  const remainingMetrics = Object.entries(selected.metrics ?? {}).filter(
    ([key, value]) =>
      !primaryMetricKeys.includes(key as (typeof primaryMetricKeys)[number]) &&
      typeof value === 'number' &&
      Number.isFinite(value),
  ) as Array<[keyof RecommendationMetrics, number]>;
  const freshnessValues = evidence
    ? [evidence.matchups.isStale, evidence.synergy?.isStale, evidence.meta.isStale].filter(
        (value): value is boolean => typeof value === 'boolean',
      )
    : [];
  const hasStaleEvidence = freshnessValues.includes(true);

  return (
    <Page
      eyebrow={`${text('Автоматический расчёт', 'Automatic calculation')} · ${formatDateTime(analysis.createdAt, language)}`}
      title={text('Результат драфта', 'Draft result')}
      description={
        <span className="page-description__taxonomy">
          <PositionLabel position={analysis.input.position} variant="compact" />
          <span aria-hidden>·</span>
          <RankLabel rank={analysis.input.rank} variant="compact" />
          <span aria-hidden>·</span>
          <span>{text('Патч', 'Patch')} {analysis.result.patch}</span>
        </span>
      }
      actions={
        <Link className="button button--secondary" to="/history">
          <ArrowLeftIcon size={16} aria-hidden />
          {text('История', 'History')}
        </Link>
      }
      className="analysis-page"
    >
      <section className="result-command" data-reveal aria-labelledby="result-command-title">
        <div className="result-command__art">
          <HeroArtwork hero={selected.hero} eager />
          <div className="result-command__art-shade" />
          <span className="result-command__pick-label">
            {text('Основной выбор', 'Primary pick')}
          </span>
        </div>

        <div className="result-command__content">
          <div className="result-command__heading">
            <div>
              <Badge tone={selected.confidence === 'high' ? 'success' : 'warning'}>
                <SealCheckIcon size={15} weight="duotone" aria-hidden />
                {text('Уверенность', 'Confidence')}:{' '}
                {confidenceName(selected.confidence, language)}
              </Badge>
              <h2 id="result-command-title">{heroName(selected.hero, language)}</h2>
            </div>
            <div
              className="result-command__score"
              aria-label={text(
                `Итоговая оценка ${Math.round(selected.score)} из 100`,
                `Final score ${Math.round(selected.score)} out of 100`,
              )}
            >
              <strong>{Math.round(selected.score)}</strong>
              <span>{text('из 100', 'out of 100')}</span>
            </div>
          </div>

          {selected.reasons.length ? (
            <ul
              className="result-command__reasons"
              aria-label={text('Причины рекомендации', 'Recommendation reasons')}
            >
              {selected.reasons.map((reason) => (
                <li key={reason}>
                  <ShieldCheckIcon size={16} weight="duotone" aria-hidden />
                  {reasonName(reason, language)}
                </li>
              ))}
            </ul>
          ) : null}

          {selected.metrics ? (
            <div
              className="result-command__metrics"
              aria-label={text('Ключевые метрики', 'Key metrics')}
            >
              {primaryMetricKeys.map((key) => {
                const value = selected.metrics?.[key];
                const normalizedValue =
                  typeof value === 'number' && Number.isFinite(value)
                    ? Math.max(0, Math.min(1, value))
                    : 0;

                return (
                  <div className="command-metric" key={key}>
                    <span className="command-metric__icon" aria-hidden>
                      {key === 'counter' ? <SwordIcon size={17} weight="duotone" /> : null}
                      {key === 'roleFit' ? <TargetIcon size={17} weight="duotone" /> : null}
                      {key === 'synergy' ? <UsersThreeIcon size={17} weight="duotone" /> : null}
                      {key === 'meta' ? <GaugeIcon size={17} weight="duotone" /> : null}
                    </span>
                    <span className="command-metric__copy">
                      <span>{metricLabels[language][key]}</span>
                      <strong>{formatPercent(value, 0, language)}</strong>
                    </span>
                    <i aria-hidden>
                      <span style={{ transform: `scaleX(${normalizedValue})` }} />
                    </i>
                  </div>
                );
              })}
            </div>
          ) : (
            <AsyncState
              status="empty"
              title={text('Метрики отсутствуют', 'Metrics unavailable')}
              description={text(
                'Этот старый результат был сохранён до обновления алгоритма.',
                'This older result was saved before the algorithm update.',
              )}
            />
          )}
        </div>

        <aside
          className="result-command__alternatives"
          aria-label={text('Варианты рекомендации', 'Recommendation options')}
        >
          <div className="result-command__alternatives-heading">
            <span>{text('Варианты', 'Options')}</span>
            <small>{analysis.result.recommendations.length}</small>
          </div>
          <div className="result-command__alternative-list">
            {analysis.result.recommendations.map((recommendation, index) => (
              <button
                type="button"
                key={recommendation.hero.id}
                className={recommendation.hero.id === selected.hero.id ? 'is-active' : ''}
                onClick={() => setSelectedHeroId(recommendation.hero.id)}
                aria-pressed={recommendation.hero.id === selected.hero.id}
              >
                <span className="result-command__alternative-rank">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <HeroIcon hero={recommendation.hero} />
                <span className="result-command__alternative-copy">
                  <strong>{heroName(recommendation.hero, language)}</strong>
                  <small>
                    {text('Оценка', 'Score')} {Math.round(recommendation.score)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="evidence-section" data-reveal aria-labelledby="evidence-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text('Доказательная база', 'Evidence')}</p>
            <h2 id="evidence-title">
              {text('На чём держится рекомендация', 'What supports this recommendation')}
            </h2>
          </div>
          {evidence ? (
            <Badge tone={hasStaleEvidence ? 'warning' : 'success'}>
              {hasStaleEvidence
                ? text('Часть данных устарела', 'Some data is outdated')
                : freshnessValues.length
                  ? text('Свежесть подтверждена', 'Freshness confirmed')
                  : text('Свежесть не записана', 'Freshness not recorded')}
            </Badge>
          ) : null}
        </div>

        {evidence ? (
          <div className="evidence-matrix">
            <table>
              <thead>
                <tr>
                  <th scope="col">{text('Фактор', 'Factor')}</th>
                  <th scope="col">{text('Показатель', 'Metric')}</th>
                  <th scope="col">{text('Выборка', 'Sample')}</th>
                  <th scope="col">{text('Источник', 'Source')}</th>
                  <th scope="col">{text('Свежесть', 'Freshness')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    <span className="evidence-matrix__factor">
                      <SwordIcon size={19} weight="duotone" aria-hidden />
                      <span>
                        <strong>{text('Противостояния', 'Matchups')}</strong>
                        <small>
                          {text(
                            `Покрыто ${evidence.matchups.opponentsCovered} из ${evidence.matchups.opponentsTotal}`,
                            `${evidence.matchups.opponentsCovered} of ${evidence.matchups.opponentsTotal} covered`,
                          )}
                        </small>
                      </span>
                    </span>
                  </th>
                  <td>
                    <strong className="evidence-matrix__value">
                      {formatPercent(evidence.matchups.weightedWinRate, 1, language)}
                    </strong>
                    <small>
                      {text('ожидаемо', 'expected')}{' '}
                      {formatPercent(evidence.matchups.expectedWinRate, 1, language)}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {integerFormatter.format(evidence.matchups.games)} {text('игр', 'games')}
                    </strong>
                    <small>
                      {text('минимум', 'minimum')}{' '}
                      {integerFormatter.format(evidence.matchups.minimumGames)}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {evidence.matchups.source || text('Не записан', 'Not recorded')}
                    </strong>
                    <small>
                      {evidence.matchups.rankScoped
                        ? text('выбранный ранг', 'selected rank')
                        : text(
                            'скользящая статистика по всем рангам',
                            'rolling statistics across all ranks',
                          )}
                    </small>
                  </td>
                  <td>
                    <Freshness isStale={evidence.matchups.isStale} />
                  </td>
                </tr>

                <tr className={!evidence.synergy ? 'is-unavailable' : ''}>
                  <th scope="row">
                    <span className="evidence-matrix__factor">
                      <UsersThreeIcon size={19} weight="duotone" aria-hidden />
                      <span>
                        <strong>{text('Синергия состава', 'Team synergy')}</strong>
                        <small>
                          {text(
                            `Союзники ${evidence.synergy?.alliesCovered ?? 0} из ${evidence.synergy?.alliesTotal ?? analysis.input.allyHeroIds.length}`,
                            `Allies ${evidence.synergy?.alliesCovered ?? 0} of ${evidence.synergy?.alliesTotal ?? analysis.input.allyHeroIds.length}`,
                          )}
                        </small>
                      </span>
                    </span>
                  </th>
                  <td>
                    <strong className="evidence-matrix__value">
                      {formatPercent(evidence.synergy?.pairScore, 1, language)}
                    </strong>
                    <small>
                      {text('состав', 'composition')}{' '}
                      {formatPercent(evidence.synergy?.compositionScore, 1, language)} ·{' '}
                      {text('надёжность', 'reliability')}{' '}
                      {formatPercent(evidence.synergy?.reliability, 1, language)}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {evidence.synergy
                        ? `${integerFormatter.format(evidence.synergy.games)} ${text('игр', 'games')}`
                        : text('Нет данных', 'No data')}
                    </strong>
                    <small>
                      {evidence.synergy
                        ? `${text('минимум', 'minimum')} ${integerFormatter.format(evidence.synergy.minimumGames)}`
                        : text('синергия не записана', 'synergy not recorded')}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {evidence.synergy?.source || text('Не записан', 'Not recorded')}
                    </strong>
                    <small>
                      {evidence.synergy
                        ? evidence.synergy.rankScoped
                          ? text('выбранный ранг', 'selected rank')
                          : text(
                              'скользящая статистика по всем рангам',
                              'rolling statistics across all ranks',
                            )
                        : '—'}
                    </small>
                  </td>
                  <td>
                    <Freshness isStale={evidence.synergy?.isStale} />
                  </td>
                </tr>

                <tr>
                  <th scope="row">
                    <span className="evidence-matrix__factor">
                      <GaugeIcon size={19} weight="duotone" aria-hidden />
                      <span>
                        <strong>{text('Мета позиции', 'Position meta')}</strong>
                        <small>
                          <PositionLabel position={analysis.input.position} variant="compact" />
                        </small>
                      </span>
                    </span>
                  </th>
                  <td>
                    <strong className="evidence-matrix__value">
                      {formatPercent(evidence.meta.winRate, 1, language)}
                    </strong>
                    <small>{text('доля побед', 'win rate')}</small>
                  </td>
                  <td>
                    <strong>
                      {integerFormatter.format(evidence.meta.games)} {text('игр', 'games')}
                    </strong>
                    <small>
                      {integerFormatter.format(evidence.meta.wins)} {text('побед', 'wins')}
                    </small>
                  </td>
                  <td>
                    <strong>{evidence.meta.source || text('Не записан', 'Not recorded')}</strong>
                    <small>
                      {evidence.meta.positionApproximate === null
                        ? text('точность позиции не записана', 'position accuracy not recorded')
                        : evidence.meta.positionApproximate
                          ? text('позиция определена приближённо', 'position is approximate')
                          : text('точная позиция', 'exact position')}
                    </small>
                  </td>
                  <td>
                    <Freshness isStale={evidence.meta.isStale} />
                  </td>
                </tr>
              </tbody>
            </table>

            {evidence.matchups.byOpponent?.length ? (
              <details className="evidence-opponents">
                <summary>
                  <span>
                    <SwordIcon size={18} weight="duotone" aria-hidden />
                    <span>
                      <strong>{text('Противостояния по героям', 'Matchups by hero')}</strong>
                      <small>
                        {text(
                          `${evidence.matchups.byOpponent.length} соперников в расчёте`,
                          `${evidence.matchups.byOpponent.length} opponents included`,
                        )}
                      </small>
                    </span>
                  </span>
                  <CaretDownIcon size={17} aria-hidden />
                </summary>
                <div
                  className="evidence-opponents__table"
                  role="table"
                  aria-label={text('Показатели по каждому сопернику', 'Metrics for each opponent')}
                >
                  <div className="evidence-opponents__head" role="row">
                    <span role="columnheader">{text('Соперник', 'Opponent')}</span>
                    <span role="columnheader">{text('Преимущество', 'Advantage')}</span>
                    <span role="columnheader">{text('Доля побед', 'Win rate')}</span>
                    <span role="columnheader">{text('Ожидаемо', 'Expected')}</span>
                    <span role="columnheader">{text('Надёжность', 'Reliability')}</span>
                    <span role="columnheader">{text('Выборка', 'Sample')}</span>
                  </div>
                  {evidence.matchups.byOpponent.map((pair) => {
                    const opponent = heroesById.get(pair.heroId);
                    return (
                      <div className="evidence-opponents__row" key={pair.heroId} role="row">
                        <span className="evidence-opponents__hero" role="cell">
                          <HeroIcon hero={opponent} />
                          <strong>{heroName(opponent, language)}</strong>
                        </span>
                        <strong
                          className={pair.advantage >= 0 ? 'is-positive' : 'is-negative'}
                          role="cell"
                        >
                          {pair.advantage >= 0 ? '+' : ''}
                          {percentagePointFormatter.format(pair.advantage * 100)}{' '}
                          {text('п.п.', 'pp')}
                        </strong>
                        <span role="cell">{formatPercent(pair.winRate, 1, language)}</span>
                        <span role="cell">
                          {formatPercent(pair.expectedWinRate, 1, language)}
                        </span>
                        <span role="cell">{formatPercent(pair.reliability, 1, language)}</span>
                        <span role="cell">
                          {integerFormatter.format(pair.patchGames)} {text('игр', 'games')} ·{' '}
                          {integerFormatter.format(pair.patchWins)} {text('побед', 'wins')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <AsyncState
            status="empty"
            title={text(
              'Доказательная база не записывалась',
              'Evidence was not recorded',
            )}
            description={text(
              'Это старый результат, созданный до сохранения численных доказательств. Итоговая оценка доступна, но подтверждать её пустыми метриками нельзя.',
              'This result predates numerical evidence storage. Its final score is available, but empty metrics cannot be used to verify it.',
            )}
          />
        )}
      </section>

      <section className="analysis-audit-section" data-reveal>
        <details className="analysis-audit">
          <summary>
            <span className="analysis-audit__summary-icon">
              <StackIcon size={20} weight="duotone" aria-hidden />
            </span>
            <span>
              <strong>{text('Технический аудит расчёта', 'Technical calculation audit')}</strong>
              <small>
                {text(
                  'Вклад факторов, версии алгоритма и происхождение результата',
                  'Factor contributions, algorithm versions, and result provenance',
                )}
              </small>
            </span>
            <CaretDownIcon className="analysis-audit__caret" size={18} aria-hidden />
          </summary>

          <div className="analysis-audit__body">
            <section className="analysis-audit__breakdown" aria-labelledby="breakdown-title">
              <div className="analysis-audit__heading">
                <ChartBarIcon size={18} weight="duotone" aria-hidden />
                <div>
                  <h3 id="breakdown-title">{text('Вклад факторов', 'Factor contributions')}</h3>
                  <p>
                    {text(
                      'Числа, использованные итоговой формулой',
                      'Values used by the final formula',
                    )}
                  </p>
                </div>
              </div>

              {selected.scoreBreakdown ? (
                <div className="breakdown-table">
                  {Object.entries(selected.scoreBreakdown).map(([key, value]) => (
                    <div
                      className={key === 'total' ? 'breakdown-table__total' : ''}
                      key={key}
                    >
                      <span>
                        {breakdownLabels[language][key as keyof ScoreBreakdown] ?? key}
                      </span>
                      <strong>{scoreFormatter.format(Number(value))}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <AsyncState
                  status="empty"
                  title={text('Разбивка оценки отсутствует', 'Score breakdown unavailable')}
                />
              )}

              {remainingMetrics.length ? (
                <div className="analysis-audit__secondary-metrics">
                  <h4>{text('Дополнительные метрики', 'Additional metrics')}</h4>
                  {remainingMetrics.map(([key, value]) => (
                    <div key={key}>
                      <span>{metricLabels[language][key]}</span>
                      <strong>{formatPercent(value, 1, language)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="analysis-audit__provenance" aria-labelledby="provenance-title">
              <div className="analysis-audit__heading">
                <DatabaseIcon size={18} weight="duotone" aria-hidden />
                <div>
                  <h3 id="provenance-title">
                    {text('Происхождение результата', 'Result provenance')}
                  </h3>
                  <p>{text('Версии компонентов и участие ИИ', 'Component versions and AI use')}</p>
                </div>
              </div>

              <dl>
                <div>
                  <dt>
                    <BrainIcon size={16} weight="duotone" aria-hidden />
                    {text('Алгоритм рекомендации', 'Recommendation engine')}
                  </dt>
                  <dd>{provenance?.engineVersion ?? text('Не записана', 'Not recorded')}</dd>
                </div>
                <div>
                  <dt>
                    <TargetIcon size={16} weight="duotone" aria-hidden />
                    {text('Формула оценки', 'Scoring formula')}
                  </dt>
                  <dd>{provenance?.scoringVersion ?? text('Не записана', 'Not recorded')}</dd>
                </div>
                <div>
                  <dt>
                    <SparkleIcon size={16} weight="duotone" aria-hidden />
                    {text('ИИ-корректировка', 'AI adjustment')}
                  </dt>
                  <dd>
                    {provenance?.aiAssisted
                      ? provenance.model ?? text('Использовалась', 'Used')
                      : text('Не использовалась', 'Not used')}
                  </dd>
                </div>
                <div>
                  <dt>
                    <BookOpenTextIcon size={16} weight="duotone" aria-hidden />
                    {text('Версия запроса', 'Prompt version')}
                  </dt>
                  <dd>{provenance?.promptVersion ?? text('Не применялась', 'Not applicable')}</dd>
                </div>
              </dl>
              {provenance?.fallbackReason ? (
                <p className="analysis-audit__fallback">
                  {language === 'en' && /[А-Яа-яЁё]/.test(provenance.fallbackReason)
                    ? text(
                        'При расчёте использован резервный сценарий.',
                        'A fallback calculation was used.',
                      )
                    : provenance.fallbackReason}
                </p>
              ) : null}
            </section>
          </div>
        </details>
      </section>

      <section className="result-footer" data-reveal>
        <div>
          <p className="eyebrow">{text('Насколько ответ помог?', 'How helpful was this result?')}</p>
          <h2>
            {text(
              'Оценка улучшает следующие рекомендации',
              'Your rating improves future recommendations',
            )}
          </h2>
        </div>
        <TextLink to={`/reviews?analysis=${analysis.id}`}>
          {text('Оставить отзыв', 'Leave feedback')}
        </TextLink>
      </section>
    </Page>
  );
}
