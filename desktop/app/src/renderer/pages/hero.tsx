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
import { formatDateTime, formatPercent, heroName, roleName } from '../format';
import { useI18n } from '../i18n';
import { AsyncState, Badge, HeroArtwork, Page, Panel, Stat } from '../components/ui';
import type { HeroDetail } from '../types';

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const summarizeRanks = (items: HeroDetail['rankWinRates']) => {
  let bestRank: number | null = null;
  let bestWinRate: number | null = null;
  let sampleGames = 0;

  for (const item of items) {
    sampleGames += item.games;
    if (
      item.winRate !== null
      && (bestWinRate === null || item.winRate > bestWinRate)
    ) {
      bestRank = item.rank;
      bestWinRate = item.winRate;
    }
  }

  return { bestRank, sampleGames };
};

export function HeroPage() {
  const { language, locale, text } = useI18n();
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
        <AsyncState status="loading" title={text('Загружаем статистику героя', 'Loading hero statistics')} />
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="page" id="main-content">
        <AsyncState
          status="error"
          title={text('Герой не найден', 'Hero not found')}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  const detail = query.data;
  const { bestRank, sampleGames } = summarizeRanks(detail.rankWinRates);

  return (
    <Page
      eyebrow={`${text('Патч', 'Patch')} ${detail.patch.name}`}
      title={heroName(detail.hero, language)}
      description={`${text('Обновлено', 'Updated')} ${formatDateTime(detail.generatedAt, language)} · ${text('статистика и популярные сборки', 'statistics and popular builds')}`}
      actions={
        <>
          <Link className="button button--secondary" to="/meta">
            <ArrowLeftIcon size={16} aria-hidden />
            {text('Мета', 'Meta')}
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
              {detail.isStale ? text('Кэш обновляется', 'Refreshing cache') : text('Данные актуальны', 'Data is current')}
            </Badge>
          </div>
          <p className="hero-masthead__roles">
            {detail.hero.roles?.map((role) => roleName(role, language)).join(' · ') || text('Роли уточняются', 'Roles pending')}
          </p>
        </div>
        <aside className="hero-rank-panel" aria-label={text('Процент побед по группам рангов', 'Win rate by rank group')}>
          <div className="hero-rank-panel__head">
            <strong>{text('Процент побед', 'Win rate')}</strong>
            <span>{text('Rolling 7 дней', 'Rolling 7 days')}</span>
          </div>
          <div className="rank-rate-grid">
            {detail.rankWinRates.map((item) => (
              <div key={item.rank}>
                <RankLabel rank={item.rank} variant="compact" />
                <strong>{formatPercent(item.winRate, 1, language)}</strong>
                <small>{item.games.toLocaleString(locale)} {text('игр', 'games')}</small>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <Panel className="hero-stat-strip" data-reveal aria-label={text('Ключевые показатели героя', 'Hero key metrics')}>
        <div className="hero-stat-strip__item">
          <TrendUpIcon size={21} weight="duotone" aria-hidden />
          <Stat
            label={text('Лучшая группа', 'Best rank group')}
            value={
              bestRank ? (
                <RankLabel rank={bestRank} variant="compact" />
              ) : (
                text('Недостаточно данных', 'Not enough data')
              )
            }
            helper={text('По rolling 7d', 'Based on rolling 7d')}
          />
        </div>
        <div className="hero-stat-strip__item">
          <SwordIcon size={21} weight="duotone" aria-hidden />
          <Stat
            label={text('Матчей в выборке', 'Matches in sample')}
            value={sampleGames.toLocaleString(locale)}
            helper={text('Сумма по группам рангов', 'Total across rank groups')}
          />
        </div>
        <div className="hero-stat-strip__item">
          <PackageIcon size={21} weight="duotone" aria-hidden />
          <Stat
            label={text('Сборок найдено', 'Builds found')}
            value={detail.builds.length}
            helper={`${detail.buildSampleSize.toLocaleString(locale)} ${text('разобранных матчей', 'analyzed matches')}`}
          />
        </div>
      </Panel>

      <section className="builds-section" data-reveal>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{text('Популярные сборки', 'Popular builds')}</p>
            <h2>{text('Предметы и тайминги', 'Items and timings')}</h2>
          </div>
          <Badge tone={detail.availability.builds === 'ready' ? 'success' : 'warning'}>
            {detail.availability.builds === 'ready'
              ? text('Готово', 'Ready')
              : detail.availability.builds === 'collecting'
                ? text('Собираем', 'Collecting')
                : text('Недоступно', 'Unavailable')}
          </Badge>
        </div>
        {detail.builds.length ? (
          <div className="build-grid">
            {detail.builds.map((build) => (
              <Panel className="build-card" key={build.id}>
                <div className="build-card__head">
                  <span>{text('Порядок покупки', 'Purchase order')}</span>
                  <strong>{formatPercent(build.winRate, 1, language)} {text('побед', 'WR')}</strong>
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
                    {build.games.toLocaleString(locale)} {text('матчей', 'matches')}
                  </span>
                  <span>{build.wins.toLocaleString(locale)} {text('побед', 'wins')}</span>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <AsyncState
            status="empty"
            title={text('Сборки ещё не готовы', 'Builds are not ready yet')}
            description={text('Основная статистика доступна, предметы появятся после обработки матчей.', 'Core statistics are available. Items will appear after match processing.')}
          />
        )}
      </section>
    </Page>
  );
}
