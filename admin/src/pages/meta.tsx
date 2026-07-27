import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Boxes,
  Clock3,
  DatabaseZap,
  Layers3,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { CustomSelect, Drawer, EmptyState, Panel, StatusBadge } from '../components/ui';
import { formatNumber, formatPercent, formatRelativeTime } from '../lib/format';
import type {
  AdminHeroDetail,
  AdminHeroPositionStat,
  AdminMetaSnapshot,
  HeroPosition,
  RankBracket,
} from '../types';

type RankValue = 'all' | `${RankBracket}`;

type MetaPageProps = {
  snapshots: AdminMetaSnapshot[];
  heroDetails: AdminHeroDetail[];
};

const ranks: Array<{ value: RankValue; label: string }> = [
  { value: 'all', label: 'Все ранги' },
  { value: '1', label: 'Рекрут' },
  { value: '2', label: 'Страж' },
  { value: '3', label: 'Рыцарь' },
  { value: '4', label: 'Герой' },
  { value: '5', label: 'Легенда' },
  { value: '6', label: 'Властелин' },
  { value: '7', label: 'Божество' },
  { value: '8', label: 'Титан' },
];

const positionMeta: Record<HeroPosition, { short: string; title: string; detail: string }> = {
  1: { short: 'P1', title: 'Carry', detail: 'Safe lane core' },
  2: { short: 'P2', title: 'Mid', detail: 'Middle lane' },
  3: { short: 'P3', title: 'Offlane', detail: 'Hard lane core' },
  4: { short: 'P4', title: 'Soft support', detail: 'Roaming support' },
  5: { short: 'P5', title: 'Hard support', detail: 'Safe lane support' },
};

const buildAvailability = {
  ready: { label: 'Сборки готовы', tone: 'positive' as const },
  collecting: { label: 'Собираем выборку', tone: 'warning' as const },
  unavailable: { label: 'Сборки недоступны', tone: 'negative' as const },
};

export function MetaPage({ snapshots, heroDetails }: MetaPageProps) {
  const [rank, setRank] = useState<RankValue>('all');
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);
  const selectedRank = rank === 'all' ? null : Number(rank) as RankBracket;
  const snapshot = snapshots.find((item) => item.rank === selectedRank) ?? null;
  const heroById = useMemo(
    () => new Map(snapshot?.heroes.map((hero) => [hero.id, hero]) ?? []),
    [snapshot],
  );
  const leaders = useMemo(
    () => {
      const byPosition = new Map<HeroPosition, AdminHeroPositionStat>();
      for (const stat of snapshot?.positionStats ?? []) {
        if (!heroById.has(stat.heroId)) continue;
        const current = byPosition.get(stat.position);
        if (
          !current
          || stat.winRate > current.winRate
          || (stat.winRate === current.winRate && stat.picks > current.picks)
          || (
            stat.winRate === current.winRate
            && stat.picks === current.picks
            && stat.heroId < current.heroId
          )
        ) {
          byPosition.set(stat.position, stat);
        }
      }
      return ([1, 2, 3, 4, 5] as const).flatMap((position) => {
        const leader = byPosition.get(position);
        return leader ? [leader] : [];
      });
    },
    [heroById, snapshot?.positionStats],
  );
  const selectedHero = selectedHeroId === null ? null : heroById.get(selectedHeroId) ?? null;
  const selectedDetail = selectedHeroId === null
    ? null
    : heroDetails.find((detail) => detail.heroId === selectedHeroId) ?? null;
  const selectedPosition = selectedHeroId === null
    ? null
    : leaders.find((stat) => stat.heroId === selectedHeroId) ?? null;
  const maxPicks = Math.max(1, ...leaders.map((stat) => stat.picks));
  const approximateCount = leaders.filter((stat) => stat.isApproximate).length;

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">OpenDota · динамические данные продукта</span>
          <h1>Мета</h1>
          <p>Лидеры P1–P5, качество выборки и готовность данных карточек героев.</p>
        </div>
        <CustomSelect
          value={rank}
          onChange={setRank}
          ariaLabel="Ранг снимка меты"
          label="Ранг"
          icon={<Target size={15} />}
          options={ranks}
          className="meta-rank-select"
        />
      </header>

      {snapshot ? (
        <>
          <Panel className="meta-passport" ariaLabel="Паспорт снимка меты">
            <div className="meta-passport__lead">
              <span className="meta-passport__patch">{snapshot.patch}</span>
              <div>
                <span>Текущий патч</span>
                <strong>{snapshot.availability === 'ready' ? 'Снимок готов' : 'Собираем данные'}</strong>
              </div>
            </div>
            <dl>
              <div>
                <dt>Окно</dt>
                <dd>Текущий патч · 30 дней</dd>
              </div>
              <div>
                <dt>Фильтр</dt>
                <dd>{snapshot.rankFilter === 'all_ranks' ? 'Все матчи' : 'Средний ранг матча'}</dd>
              </div>
              <div>
                <dt>Минимум игр</dt>
                <dd>{snapshot.minimumGames}</dd>
              </div>
              <div>
                <dt>Обновлено</dt>
                <dd>{formatRelativeTime(snapshot.fetchedAt)}</dd>
              </div>
            </dl>
            <StatusBadge tone={snapshot.isStale ? 'warning' : 'positive'}>
              {snapshot.isStale ? 'Устарел' : 'Актуален'}
            </StatusBadge>
          </Panel>

          <div className="meta-layout">
            <Panel className="meta-leaders-panel" ariaLabel="Лидеры ролей">
              <div className="panel-heading">
                <div>
                  <h2>Лидеры ролей</h2>
                  <p>Сортировка по винрейту, затем по количеству игр.</p>
                </div>
                <StatusBadge tone="info">P1–P5</StatusBadge>
              </div>
              <div className="meta-role-list">
                {leaders.map((stat) => {
                  const hero = heroById.get(stat.heroId);
                  const position = positionMeta[stat.position];
                  if (!hero) return null;
                  return (
                    <button
                      type="button"
                      className="meta-role-row"
                      key={`${stat.position}-${stat.heroId}`}
                      onClick={() => setSelectedHeroId(hero.id)}
                    >
                      <span className="meta-role-row__position">
                        <b>{position.short}</b>
                        <small>{position.title}</small>
                      </span>
                      <span className="meta-role-row__hero">
                        <span className="meta-hero-image">
                          <img src={hero.imageUrl} alt="" loading="lazy" />
                        </span>
                        <span>
                          <strong>{hero.localizedName}</strong>
                          <small>{position.detail}</small>
                        </span>
                      </span>
                      <span className="meta-role-row__rate">
                        <strong>{formatPercent(stat.winRate * 100, 1)}</strong>
                        <small>{formatNumber(stat.picks)} игр</small>
                      </span>
                      <span className="meta-role-row__sample" aria-hidden="true">
                        <i style={{ width: `${Math.max(8, (stat.picks / maxPicks) * 100)}%` }} />
                      </span>
                      <StatusBadge tone={stat.isApproximate ? 'warning' : 'positive'}>
                        {stat.isApproximate ? '≈ роль' : 'точно'}
                      </StatusBadge>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <div className="meta-side-stack">
              <Panel className="meta-quality-panel">
                <div className="panel-heading panel-heading--compact">
                  <div>
                    <h2>Качество покрытия</h2>
                    <p>Что увидит пользователь в блоке меты.</p>
                  </div>
                  <ShieldCheck size={19} className="panel-heading__icon" />
                </div>
                <div className="meta-quality-score">
                  <strong>{leaders.length}/5</strong>
                  <span>ролей представлены</span>
                </div>
                <div className="meta-quality-list">
                  <div><span><DatabaseZap size={16} />Точные роли</span><b>{5 - approximateCount}</b></div>
                  <div><span><Activity size={16} />Приблизительные</span><b>{approximateCount}</b></div>
                  <div><span><Boxes size={16} />Детали героев</span><b>{heroDetails.length}/5</b></div>
                </div>
              </Panel>

              <Panel className="meta-contract-panel">
                <div className="panel-heading panel-heading--compact">
                  <div>
                    <h2>Доступность данных</h2>
                    <p>Фактическое покрытие backend-контрактами.</p>
                  </div>
                  <Layers3 size={19} className="panel-heading__icon" />
                </div>
                <div className="meta-contract-list">
                  <div>
                    <span className="meta-contract-list__icon meta-contract-list__icon--ready"><BarChart3 size={17} /></span>
                    <p><strong>Мета и карточки</strong><small>Доступны через API героев</small></p>
                    <StatusBadge tone="positive">Готово</StatusBadge>
                  </div>
                  <div>
                    <span className="meta-contract-list__icon"><Sparkles size={17} /></span>
                    <p><strong>Wishlist</strong><small>Хранится только на устройстве</small></p>
                    <StatusBadge tone="neutral">Нет метрик</StatusBadge>
                  </div>
                  <div>
                    <span className="meta-contract-list__icon"><MousePointer2 size={17} /></span>
                    <p><strong>Ручной сценарий</strong><small>Backend видит только завершённый шаг 4</small></p>
                    <StatusBadge tone="warning">Без воронки</StatusBadge>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </>
      ) : (
        <Panel>
          <EmptyState
            title="Снимок ещё не создан"
            text="Для этого ранга backend пока не вернул данные P1–P5."
          />
        </Panel>
      )}

      <Drawer
        open={Boolean(selectedHero)}
        title={selectedHero?.localizedName ?? 'Герой'}
        eyebrow={selectedDetail ? `Данные ${formatRelativeTime(selectedDetail.generatedAt)}` : undefined}
        onClose={() => setSelectedHeroId(null)}
      >
        {selectedHero && selectedPosition ? (
          <div className="meta-hero-drawer">
            <div className="meta-hero-drawer__cover">
              <img src={selectedHero.imageUrl} alt="" />
              <div>
                <span>{positionMeta[selectedPosition.position].short} · {positionMeta[selectedPosition.position].title}</span>
                <strong>{formatPercent(selectedPosition.winRate * 100, 1)}</strong>
                <small>{formatNumber(selectedPosition.picks)} игр на патче {snapshot?.patch}</small>
              </div>
            </div>

            {selectedDetail ? (
              <>
                <section className="drawer-section">
                  <div className="drawer-section__heading">
                    <h3>Винрейт по рангам</h3>
                    <StatusBadge tone={selectedDetail.isStale ? 'warning' : 'positive'}>
                      {selectedDetail.isStale ? 'Устарел' : '7 дней'}
                    </StatusBadge>
                  </div>
                  <div className="meta-rank-grid">
                    {selectedDetail.rankWinRates.map((item) => (
                      <div key={item.rank}>
                        <span>R{item.rank}</span>
                        <strong>{item.winRate === null ? '—' : formatPercent(item.winRate * 100, 1)}</strong>
                        <small>{formatNumber(item.games)} игр</small>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="drawer-section">
                  <div className="drawer-section__heading">
                    <h3>Варианты сборок</h3>
                    <StatusBadge tone={buildAvailability[selectedDetail.availability.builds].tone}>
                      {buildAvailability[selectedDetail.availability.builds].label}
                    </StatusBadge>
                  </div>
                  <div className="meta-build-list">
                    {selectedDetail.builds.map((build) => (
                      <div key={build.id}>
                        <span><Clock3 size={15} /></span>
                        <p>
                          <strong>{build.itemNames.join(' → ')}</strong>
                          <small>{formatNumber(build.games)} игр · {formatPercent(build.winRate * 100, 1)} WR</small>
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="drawer-section drawer-section--details">
                  <h3>Качество данных</h3>
                  <dl>
                    <div><dt>Метод роли</dt><dd>{selectedPosition.method}</dd></div>
                    <div><dt>Приблизительно</dt><dd>{selectedPosition.isApproximate ? 'Да' : 'Нет'}</dd></div>
                    <div><dt>Выборка сборок</dt><dd>{formatNumber(selectedDetail.buildSampleSize)}</dd></div>
                    <div><dt>Состояние</dt><dd>{buildAvailability[selectedDetail.availability.builds].label}</dd></div>
                  </dl>
                </section>
              </>
            ) : (
              <div className="muted-message">Для героя ещё нет детального снимка.</div>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
