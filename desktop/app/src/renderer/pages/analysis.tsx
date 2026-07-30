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
import { PositionLabel, RankLabel } from '../components/dota-taxonomy';
import {
  AsyncState,
  Badge,
  HeroArtwork,
  HeroIcon,
  Page,
  TextLink,
} from '../components/ui';
import type { RecommendationMetrics, ScoreBreakdown } from '../types';

const metricLabels: Record<keyof RecommendationMetrics, string> = {
  roleFit: 'Соответствие роли',
  counter: 'Сила контрпика',
  meta: 'Актуальность в мете',
  synergy: 'Синергия команды',
  reliability: 'Надёжность данных',
  coverage: 'Покрытие драфта',
  worstMatchup: 'Самое сложное противостояние',
};

const primaryMetricKeys = ['counter', 'roleFit', 'synergy', 'meta'] as const;

const breakdownLabels: Record<keyof ScoreBreakdown, string> = {
  role: 'Соответствие роли',
  matchup: 'Противостояния',
  meta: 'Мета',
  teamFit: 'Состав команды',
  reliability: 'Надёжность данных',
  advisor: 'ИИ-корректировка',
  diversity: 'Разнообразие вариантов',
  total: 'Итог',
};

function Freshness({
  isStale,
}: {
  isStale: boolean | undefined;
}) {
  if (typeof isStale !== 'boolean') {
    return <span className="evidence-freshness">Не записана</span>;
  }

  return (
    <span className={`evidence-freshness ${isStale ? 'is-stale' : 'is-current'}`}>
      <SealCheckIcon size={14} weight="fill" aria-hidden />
      {isStale ? 'Устарела' : 'Актуальна'}
    </span>
  );
}

export function AnalysisPage() {
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
        <AsyncState status="loading" title="Восстанавливаем расчёт" />
      </main>
    );
  }

  if (query.isError || !query.data || !selected) {
    return (
      <main className="page" id="main-content">
        <AsyncState
          status="error"
          title="Результат не найден"
          description="Запись могла быть удалена или сервер временно недоступен."
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
      eyebrow={`Автоматический расчёт · ${formatDateTime(analysis.createdAt)}`}
      title="Результат драфта"
      description={
        <span className="page-description__taxonomy">
          <PositionLabel position={analysis.input.position} variant="compact" />
          <span aria-hidden>·</span>
          <RankLabel rank={analysis.input.rank} variant="compact" />
          <span aria-hidden>·</span>
          <span>Патч {analysis.result.patch}</span>
        </span>
      }
      actions={
        <Link className="button button--secondary" to="/history">
          <ArrowLeftIcon size={16} aria-hidden />
          История
        </Link>
      }
      className="analysis-page"
    >
      <section className="result-command" data-reveal aria-labelledby="result-command-title">
        <div className="result-command__art">
          <HeroArtwork hero={selected.hero} eager />
          <div className="result-command__art-shade" />
          <span className="result-command__pick-label">Основной выбор</span>
        </div>

        <div className="result-command__content">
          <div className="result-command__heading">
            <div>
              <Badge tone={selected.confidence === 'high' ? 'success' : 'warning'}>
                <SealCheckIcon size={15} weight="duotone" aria-hidden />
                Уверенность: {confidenceName(selected.confidence)}
              </Badge>
              <h2 id="result-command-title">{heroName(selected.hero)}</h2>
            </div>
            <div
              className="result-command__score"
              aria-label={`Итоговая оценка ${Math.round(selected.score)} из 100`}
            >
              <strong>{Math.round(selected.score)}</strong>
              <span>из 100</span>
            </div>
          </div>

          {selected.reasons.length ? (
            <ul className="result-command__reasons" aria-label="Причины рекомендации">
              {selected.reasons.map((reason) => (
                <li key={reason}>
                  <ShieldCheckIcon size={16} weight="duotone" aria-hidden />
                  {reasonName(reason)}
                </li>
              ))}
            </ul>
          ) : null}

          {selected.metrics ? (
            <div className="result-command__metrics" aria-label="Ключевые метрики">
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
                      <span>{metricLabels[key]}</span>
                      <strong>{formatPercent(value, 0)}</strong>
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
              title="Метрики отсутствуют"
              description="Этот старый результат был сохранён до обновления алгоритма."
            />
          )}
        </div>

        <aside className="result-command__alternatives" aria-label="Варианты рекомендации">
          <div className="result-command__alternatives-heading">
            <span>Варианты</span>
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
                  <strong>{heroName(recommendation.hero)}</strong>
                  <small>Оценка {Math.round(recommendation.score)}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="evidence-section" data-reveal aria-labelledby="evidence-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Доказательная база</p>
            <h2 id="evidence-title">На чём держится рекомендация</h2>
          </div>
          {evidence ? (
            <Badge tone={hasStaleEvidence ? 'warning' : 'success'}>
              {hasStaleEvidence
                ? 'Часть данных устарела'
                : freshnessValues.length
                  ? 'Свежесть подтверждена'
                  : 'Свежесть не записана'}
            </Badge>
          ) : null}
        </div>

        {evidence ? (
          <div className="evidence-matrix">
            <table>
              <thead>
                <tr>
                  <th scope="col">Фактор</th>
                  <th scope="col">Показатель</th>
                  <th scope="col">Выборка</th>
                  <th scope="col">Источник</th>
                  <th scope="col">Свежесть</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    <span className="evidence-matrix__factor">
                      <SwordIcon size={19} weight="duotone" aria-hidden />
                      <span>
                        <strong>Противостояния</strong>
                        <small>
                          Покрыто {evidence.matchups.opponentsCovered} из{' '}
                          {evidence.matchups.opponentsTotal}
                        </small>
                      </span>
                    </span>
                  </th>
                  <td>
                    <strong className="evidence-matrix__value">
                      {formatPercent(evidence.matchups.weightedWinRate)}
                    </strong>
                    <small>
                      ожидаемо {formatPercent(evidence.matchups.expectedWinRate)}
                    </small>
                  </td>
                  <td>
                    <strong>{evidence.matchups.games.toLocaleString('ru-RU')} игр</strong>
                    <small>минимум {evidence.matchups.minimumGames.toLocaleString('ru-RU')}</small>
                  </td>
                  <td>
                    <strong>{evidence.matchups.source || 'Не записан'}</strong>
                    <small>
                      {evidence.matchups.rankScoped
                        ? 'выбранный ранг'
                        : 'скользящая статистика по всем рангам'}
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
                        <strong>Синергия состава</strong>
                        <small>
                          Союзники {evidence.synergy?.alliesCovered ?? 0} из{' '}
                          {evidence.synergy?.alliesTotal ?? analysis.input.allyHeroIds.length}
                        </small>
                      </span>
                    </span>
                  </th>
                  <td>
                    <strong className="evidence-matrix__value">
                      {formatPercent(evidence.synergy?.pairScore)}
                    </strong>
                    <small>
                      состав {formatPercent(evidence.synergy?.compositionScore)} · надёжность{' '}
                      {formatPercent(evidence.synergy?.reliability)}
                    </small>
                  </td>
                  <td>
                    <strong>
                      {evidence.synergy
                        ? `${evidence.synergy.games.toLocaleString('ru-RU')} игр`
                        : 'Нет данных'}
                    </strong>
                    <small>
                      {evidence.synergy
                        ? `минимум ${evidence.synergy.minimumGames.toLocaleString('ru-RU')}`
                        : 'синергия не записана'}
                    </small>
                  </td>
                  <td>
                    <strong>{evidence.synergy?.source || 'Не записан'}</strong>
                    <small>
                      {evidence.synergy
                        ? evidence.synergy.rankScoped
                          ? 'выбранный ранг'
                          : 'скользящая статистика по всем рангам'
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
                        <strong>Мета позиции</strong>
                        <small>
                          <PositionLabel position={analysis.input.position} variant="compact" />
                        </small>
                      </span>
                    </span>
                  </th>
                  <td>
                    <strong className="evidence-matrix__value">
                      {formatPercent(evidence.meta.winRate)}
                    </strong>
                    <small>доля побед</small>
                  </td>
                  <td>
                    <strong>{evidence.meta.games.toLocaleString('ru-RU')} игр</strong>
                    <small>{evidence.meta.wins.toLocaleString('ru-RU')} побед</small>
                  </td>
                  <td>
                    <strong>{evidence.meta.source || 'Не записан'}</strong>
                    <small>
                      {evidence.meta.positionApproximate === null
                        ? 'точность позиции не записана'
                        : evidence.meta.positionApproximate
                          ? 'позиция определена приближённо'
                          : 'точная позиция'}
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
                      <strong>Противостояния по героям</strong>
                      <small>{evidence.matchups.byOpponent.length} соперников в расчёте</small>
                    </span>
                  </span>
                  <CaretDownIcon size={17} aria-hidden />
                </summary>
                <div
                  className="evidence-opponents__table"
                  role="table"
                  aria-label="Показатели по каждому сопернику"
                >
                  <div className="evidence-opponents__head" role="row">
                    <span role="columnheader">Соперник</span>
                    <span role="columnheader">Преимущество</span>
                    <span role="columnheader">Доля побед</span>
                    <span role="columnheader">Ожидаемо</span>
                    <span role="columnheader">Надёжность</span>
                    <span role="columnheader">Выборка</span>
                  </div>
                  {evidence.matchups.byOpponent.map((pair) => {
                    const opponent = heroesById.get(pair.heroId);
                    return (
                      <div className="evidence-opponents__row" key={pair.heroId} role="row">
                        <span className="evidence-opponents__hero" role="cell">
                          <HeroIcon hero={opponent} />
                          <strong>{heroName(opponent)}</strong>
                        </span>
                        <strong
                          className={pair.advantage >= 0 ? 'is-positive' : 'is-negative'}
                          role="cell"
                        >
                          {pair.advantage >= 0 ? '+' : ''}
                          {(pair.advantage * 100).toFixed(1)} п.п.
                        </strong>
                        <span role="cell">{formatPercent(pair.winRate)}</span>
                        <span role="cell">{formatPercent(pair.expectedWinRate)}</span>
                        <span role="cell">{formatPercent(pair.reliability)}</span>
                        <span role="cell">
                          {pair.patchGames.toLocaleString('ru-RU')} игр ·{' '}
                          {pair.patchWins.toLocaleString('ru-RU')} побед
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
            title="Доказательная база не записывалась"
            description="Это старый результат, созданный до сохранения численных доказательств. Итоговая оценка доступна, но подтверждать её пустыми метриками нельзя."
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
              <strong>Технический аудит расчёта</strong>
              <small>Вклад факторов, версии алгоритма и происхождение результата</small>
            </span>
            <CaretDownIcon className="analysis-audit__caret" size={18} aria-hidden />
          </summary>

          <div className="analysis-audit__body">
            <section className="analysis-audit__breakdown" aria-labelledby="breakdown-title">
              <div className="analysis-audit__heading">
                <ChartBarIcon size={18} weight="duotone" aria-hidden />
                <div>
                  <h3 id="breakdown-title">Вклад факторов</h3>
                  <p>Числа, использованные итоговой формулой</p>
                </div>
              </div>

              {selected.scoreBreakdown ? (
                <div className="breakdown-table">
                  {Object.entries(selected.scoreBreakdown).map(([key, value]) => (
                    <div
                      className={key === 'total' ? 'breakdown-table__total' : ''}
                      key={key}
                    >
                      <span>{breakdownLabels[key as keyof ScoreBreakdown] ?? key}</span>
                      <strong>{Number(value).toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <AsyncState status="empty" title="Разбивка оценки отсутствует" />
              )}

              {remainingMetrics.length ? (
                <div className="analysis-audit__secondary-metrics">
                  <h4>Дополнительные метрики</h4>
                  {remainingMetrics.map(([key, value]) => (
                    <div key={key}>
                      <span>{metricLabels[key]}</span>
                      <strong>{formatPercent(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="analysis-audit__provenance" aria-labelledby="provenance-title">
              <div className="analysis-audit__heading">
                <DatabaseIcon size={18} weight="duotone" aria-hidden />
                <div>
                  <h3 id="provenance-title">Происхождение результата</h3>
                  <p>Версии компонентов и участие ИИ</p>
                </div>
              </div>

              <dl>
                <div>
                  <dt>
                    <BrainIcon size={16} weight="duotone" aria-hidden />
                    Алгоритм рекомендации
                  </dt>
                  <dd>{provenance?.engineVersion ?? 'Не записана'}</dd>
                </div>
                <div>
                  <dt>
                    <TargetIcon size={16} weight="duotone" aria-hidden />
                    Формула оценки
                  </dt>
                  <dd>{provenance?.scoringVersion ?? 'Не записана'}</dd>
                </div>
                <div>
                  <dt>
                    <SparkleIcon size={16} weight="duotone" aria-hidden />
                    ИИ-корректировка
                  </dt>
                  <dd>
                    {provenance?.aiAssisted
                      ? provenance.model ?? 'Использовалась'
                      : 'Не использовалась'}
                  </dd>
                </div>
                <div>
                  <dt>
                    <BookOpenTextIcon size={16} weight="duotone" aria-hidden />
                    Версия запроса
                  </dt>
                  <dd>{provenance?.promptVersion ?? 'Не применялась'}</dd>
                </div>
              </dl>
              {provenance?.fallbackReason ? (
                <p className="analysis-audit__fallback">{provenance.fallbackReason}</p>
              ) : null}
            </section>
          </div>
        </details>
      </section>

      <section className="result-footer" data-reveal>
        <div>
          <p className="eyebrow">Насколько ответ помог?</p>
          <h2>Оценка улучшает следующие рекомендации</h2>
        </div>
        <TextLink to={`/reviews?analysis=${analysis.id}`}>Оставить отзыв</TextLink>
      </section>
    </Page>
  );
}
