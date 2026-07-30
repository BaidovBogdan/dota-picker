import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ClockIcon,
  PackageIcon,
  ShieldCheckIcon,
  SwordIcon,
  TrendUpIcon,
} from '@phosphor-icons/react';
import { Link, useParams } from 'react-router';

import { desktop } from '../bridge';
import { FavoriteButton } from '../components/favorite-button';
import { RankLabel } from '../components/dota-taxonomy';
import { formatDateTime, formatPercent, heroName } from '../format';
import { AsyncState, Badge, HeroArtwork, Page, Panel, Stat } from '../components/ui';

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

export function HeroPage() {
  const params = useParams();
  const id = Number(params.id);
  const query = useQuery({
    queryKey: ['hero', id],
    queryFn: () => desktop.data.hero(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  if (query.isPending) {
    return (
      <main className="page" id="main-content">
        <AsyncState status="loading" title="Загружаем статистику героя" />
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="page" id="main-content">
        <AsyncState
          status="error"
          title="Герой не найден"
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  const detail = query.data;
  const bestRank =
    detail.rankWinRates
      .filter((item) => item.winRate !== null)
      .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))
      .map((item) => item.rank)[0] ?? null;
  const sampleGames = detail.rankWinRates.reduce((total, item) => total + item.games, 0);

  return (
    <Page
      eyebrow={`Патч ${detail.patch.name}`}
      title={heroName(detail.hero)}
      description={`Обновлено ${formatDateTime(detail.generatedAt)} · статистика и популярные сборки`}
      actions={
        <>
          <Link className="button button--secondary" to="/meta">
            <ArrowLeftIcon size={16} aria-hidden />
            Мета
          </Link>
          <FavoriteButton
            heroId={id}
            className="button button--secondary hero-favorite-button"
            size={17}
            showLabel
          />
        </>
      }
      className="hero-page"
    >
      <section className="hero-masthead" data-reveal>
        <div className="hero-masthead__media">
          <HeroArtwork hero={detail.hero} eager />
          <div className="hero-masthead__veil" />
          <div className="hero-masthead__status">
            <Badge tone={detail.isStale ? 'warning' : 'success'}>
              {detail.isStale ? 'Кэш обновляется' : 'Данные актуальны'}
            </Badge>
          </div>
          <p className="hero-masthead__roles">
            {detail.hero.roles?.join(' · ') || 'Роли уточняются'}
          </p>
        </div>
        <aside className="hero-rank-panel" aria-label="Процент побед по группам рангов">
          <div className="hero-rank-panel__head">
            <strong>Процент побед</strong>
            <span>Rolling 7 дней</span>
          </div>
          <div className="rank-rate-grid">
            {detail.rankWinRates.map((item) => (
              <div key={item.rank}>
                <RankLabel rank={item.rank} variant="compact" />
                <strong>{formatPercent(item.winRate)}</strong>
                <small>{item.games.toLocaleString('ru-RU')} игр</small>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <Panel className="hero-stat-strip" data-reveal aria-label="Ключевые показатели героя">
        <div className="hero-stat-strip__item">
          <TrendUpIcon size={21} weight="duotone" aria-hidden />
          <Stat
            label="Лучшая группа"
            value={
              bestRank ? (
                <RankLabel rank={bestRank} variant="compact" />
              ) : (
                'Недостаточно данных'
              )
            }
            helper="По rolling 7d"
          />
        </div>
        <div className="hero-stat-strip__item">
          <SwordIcon size={21} weight="duotone" aria-hidden />
          <Stat
            label="Матчей в выборке"
            value={sampleGames.toLocaleString('ru-RU')}
            helper="Сумма по группам рангов"
          />
        </div>
        <div className="hero-stat-strip__item">
          <PackageIcon size={21} weight="duotone" aria-hidden />
          <Stat
            label="Сборок найдено"
            value={detail.builds.length}
            helper={`${detail.buildSampleSize.toLocaleString('ru-RU')} разобранных матчей`}
          />
        </div>
      </Panel>

      <section className="builds-section" data-reveal>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Популярные сборки</p>
            <h2>Предметы и тайминги</h2>
          </div>
          <Badge tone={detail.availability.builds === 'ready' ? 'success' : 'warning'}>
            {detail.availability.builds === 'ready'
              ? 'Готово'
              : detail.availability.builds === 'collecting'
                ? 'Собираем'
                : 'Недоступно'}
          </Badge>
        </div>
        {detail.builds.length ? (
          <div className="build-grid">
            {detail.builds.map((build) => (
              <Panel className="build-card" key={build.id}>
                <div className="build-card__head">
                  <span>Порядок покупки</span>
                  <strong>{formatPercent(build.winRate)} WR</strong>
                </div>
                <div className="build-card__items">
                  {build.items.map((item) => (
                    <div key={`${build.id}-${item.order}-${item.id}`}>
                      <span className="build-card__image">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <PackageIcon size={18} weight="duotone" />}
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          <ClockIcon size={13} weight="duotone" aria-hidden />
                          {formatDuration(item.medianPurchaseSec)}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="build-card__footer">
                  <span>
                    <ShieldCheckIcon size={15} weight="duotone" aria-hidden />
                    {build.games.toLocaleString('ru-RU')} матчей
                  </span>
                  <span>{build.wins.toLocaleString('ru-RU')} побед</span>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <AsyncState
            status="empty"
            title="Сборки ещё не готовы"
            description="Основная статистика доступна, предметы появятся после обработки матчей."
          />
        )}
      </section>
    </Page>
  );
}
