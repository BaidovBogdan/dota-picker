import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, DatabaseZap, Layers3, ShieldCheck, Target, TriangleAlert } from 'lucide-react';
import type { PageResource } from '../App';
import { Button, ChartTooltip, CustomSelect, Drawer, EmptyState, Panel, StatusBadge } from '../components/ui';
import { formatCount, formatNumber, formatPercent, formatRelativeTime } from '../lib/format';
import type {
  AdminHeroMeta,
  AdminHeroPositionStat,
  AdminMeta,
  HeroPosition,
  RankBracket,
} from '../types';

type RankValue = 'all' | `${RankBracket}`;

type Leader = {
  hero: AdminHeroMeta;
  stat: AdminHeroPositionStat;
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
  1: { short: 'P1', title: 'Carry', detail: 'Основной фарм' },
  2: { short: 'P2', title: 'Mid', detail: 'Центральная линия' },
  3: { short: 'P3', title: 'Offlane', detail: 'Сложная линия' },
  4: { short: 'P4', title: 'Soft support', detail: 'Активная поддержка' },
  5: { short: 'P5', title: 'Hard support', detail: 'Полная поддержка' },
};

function leadersFor(meta: AdminMeta) {
  const heroById = new Map(meta.heroes.map((hero) => [hero.id, hero]));
  const byPosition = new Map<HeroPosition, AdminHeroPositionStat>();
  for (const stat of meta.positionStats) {
    if (!heroById.has(stat.heroId)) continue;
    const current = byPosition.get(stat.position);
    if (
      !current
      || stat.winRate > current.winRate
      || (stat.winRate === current.winRate && stat.picks > current.picks)
      || (stat.winRate === current.winRate && stat.picks === current.picks && stat.heroId < current.heroId)
    ) {
      byPosition.set(stat.position, stat);
    }
  }
  return ([1, 2, 3, 4, 5] as const).flatMap((position) => {
    const stat = byPosition.get(position);
    const hero = stat ? heroById.get(stat.heroId) : null;
    return stat && hero ? [{ stat, hero }] : [];
  });
}

function MetaLeaders({ leaders, onSelect }: { leaders: Leader[]; onSelect: (heroId: number) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Leader | null>(null);
  const [tooltip, setTooltip] = useState<{ left: string; top: string; edge: 'start' | 'middle' | 'end' } | null>(null);
  const maxPicks = Math.max(1, ...leaders.map(({ stat }) => stat.picks));

  const showFocus = (leader: Leader, index: number) => {
    setActive(leader);
    setTooltip({ left: '68%', top: `${58 + index * 78}px`, edge: 'middle' });
  };

  return (
    <div className="meta-role-list meta-role-list--interactive" ref={rootRef}>
      {leaders.map((leader, index) => {
        const position = positionMeta[leader.stat.position];
        return (
          <button
            type="button"
            className="meta-role-row"
            aria-label={`${position.title}: ${leader.hero.localizedName}, винрейт ${formatPercent(leader.stat.winRate * 100, 1)}, ${formatCount(leader.stat.picks, ['игра', 'игры', 'игр'])}`}
            onClick={() => onSelect(leader.hero.id)}
            onFocus={() => showFocus(leader, index)}
            onBlur={() => {
              setActive(null);
              setTooltip(null);
            }}
            onPointerMove={(event) => {
              const bounds = rootRef.current?.getBoundingClientRect();
              if (!bounds) return;
              const x = event.clientX - bounds.left;
              const y = event.clientY - bounds.top;
              const edge = x < 110 ? 'start' : x > bounds.width - 110 ? 'end' : 'middle';
              setActive(leader);
              setTooltip({
                left: edge === 'start' ? '8px' : edge === 'end' ? `${bounds.width - 8}px` : `${x}px`,
                top: `${Math.max(70, y)}px`,
                edge,
              });
            }}
            onPointerLeave={(event) => {
              if (document.activeElement === event.currentTarget) showFocus(leader, index);
              else {
                setActive(null);
                setTooltip(null);
              }
            }}
            key={`${leader.stat.position}-${leader.hero.id}`}
          >
            <span className="meta-role-row__position"><b>{position.short}</b><small>{position.title}</small></span>
            <span className="meta-role-row__hero">
              <span className="meta-hero-image"><img src={leader.hero.imageUrl} alt="" loading="lazy" /></span>
              <span><strong>{leader.hero.localizedName}</strong><small>{position.detail}</small></span>
            </span>
            <span className="meta-role-row__rate"><strong>{formatPercent(leader.stat.winRate * 100, 1)}</strong><small>{formatCount(leader.stat.picks, ['игра', 'игры', 'игр'])}</small></span>
            <span className="meta-role-row__sample" aria-hidden="true"><i style={{ width: `${Math.max(8, (leader.stat.picks / maxPicks) * 100)}%` }} /></span>
            <StatusBadge tone={leader.stat.isApproximate ? 'warning' : 'positive'}>{leader.stat.isApproximate ? 'Оценка роли' : 'Точная роль'}</StatusBadge>
          </button>
        );
      })}
      {active && tooltip ? (
        <ChartTooltip
          title={`${positionMeta[active.stat.position].short} · ${active.hero.localizedName}`}
          value={formatPercent(active.stat.winRate * 100, 1)}
          detail={`${formatCount(active.stat.wins, ['победа', 'победы', 'побед'])} · ${formatCount(active.stat.picks, ['игра', 'игры', 'игр'])}`}
          className={`chart-tooltip--point is-visible ${tooltip.edge === 'middle' ? '' : `is-${tooltip.edge}`}`}
          style={{ left: tooltip.left, top: tooltip.top }}
        />
      ) : null}
    </div>
  );
}

export function MetaPage({
  resource,
  rank,
  onRankChange,
  onRetry,
}: {
  resource: PageResource<AdminMeta>;
  rank: RankBracket | null;
  onRankChange: (rank: RankBracket | null) => void;
  onRetry: () => void;
}) {
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);
  const meta = resource.data;
  const leaders = useMemo(() => meta ? leadersFor(meta) : [], [meta]);
  const selectedHero = selectedHeroId === null ? null : meta?.heroes.find((hero) => hero.id === selectedHeroId) ?? null;
  const selectedStats = selectedHeroId === null
    ? []
    : (meta?.positionStats.filter((stat) => stat.heroId === selectedHeroId).sort((left, right) => left.position - right.position) ?? []);

  useEffect(() => {
    if (selectedHeroId !== null && !meta?.heroes.some((hero) => hero.id === selectedHeroId)) setSelectedHeroId(null);
  }, [meta, selectedHeroId]);

  if (resource.loading && !resource.data) return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--panel" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Мета недоступна" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!meta) return <EmptyState title="Нет снимка меты" text="API не вернул данные текущего патча." action={<Button onClick={onRetry}>Обновить</Button>} />;

  const approximateCount = leaders.filter(({ stat }) => stat.isApproximate).length;
  const rankValue: RankValue = rank === null ? 'all' : String(rank) as RankValue;
  const selectedRankLabel = meta.rank === null
    ? null
    : ranks.find((option) => option.value === String(meta.rank))?.label ?? `Ранг ${meta.rank}`;
  const usesAllRanksFallback = meta.rank !== null && meta.rankFilter === 'all_ranks';

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div><span className="eyebrow">OpenDota · текущий патч</span><h1>Мета</h1><p>Лидеры ролей и качество реальной выборки за 30 дней.</p></div>
        <CustomSelect
          value={rankValue}
          onChange={(value) => onRankChange(value === 'all' ? null : Number(value) as RankBracket)}
          ariaLabel="Ранг снимка меты"
          label="Ранг"
          icon={<Target size={15} />}
          options={ranks}
          className="meta-rank-select"
        />
      </header>
      {resource.error ? <div className="inline-error" role="status"><TriangleAlert size={16} /><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <Panel className="meta-passport" ariaLabel="Паспорт снимка меты">
        <div className="meta-passport__lead">
          <span className="meta-passport__patch">{meta.patch}</span>
          <div><span>Текущий патч</span><strong>{meta.availability === 'ready' ? 'Снимок готов' : 'Выборка собирается'}</strong></div>
        </div>
        <dl>
          <div><dt>Окно</dt><dd>Текущий патч · 30 дней</dd></div>
          <div><dt>Фильтр</dt><dd>{usesAllRanksFallback ? `Все матчи · fallback вместо ${selectedRankLabel}` : meta.rankFilter === 'all_ranks' ? 'Все матчи' : selectedRankLabel}</dd></div>
          <div><dt>Минимум игр</dt><dd>{formatNumber(meta.minimumGames)}</dd></div>
          <div><dt>Обновлено</dt><dd>{formatRelativeTime(meta.fetchedAt)}</dd></div>
        </dl>
        <StatusBadge tone={meta.isStale || usesAllRanksFallback ? 'warning' : 'positive'}>{meta.isStale ? 'Устарел' : usesAllRanksFallback ? 'Fallback по рангу' : 'Актуален'}</StatusBadge>
      </Panel>

      <div className="meta-layout">
        <Panel className="meta-leaders-panel" ariaLabel="Лидеры ролей">
          <div className="panel-heading">
            <div><h2>Лидеры ролей</h2><p>Винрейт, затем объём выборки. Карточка следует за курсором.</p></div>
            <StatusBadge tone="info">P1–P5</StatusBadge>
          </div>
          {leaders.length ? <MetaLeaders leaders={leaders} onSelect={setSelectedHeroId} /> : <EmptyState title="Данных пока недостаточно" text={`OpenDota ещё не собрала минимум ${meta.minimumGames} игр для выбранного ранга.`} />}
        </Panel>

        <div className="meta-side-stack">
          <Panel className="meta-quality-panel">
            <div className="panel-heading panel-heading--compact"><div><h2>Качество покрытия</h2><p>Фактическая полнота текущего снимка.</p></div><ShieldCheck size={19} className="panel-heading__icon" /></div>
            <div className="meta-quality-score"><strong>{leaders.length}/5</strong><span>покрытие ролей</span></div>
            <div className="meta-quality-list">
              <div><span><DatabaseZap size={16} />Точные роли</span><b>{leaders.length - approximateCount}</b></div>
              <div><span><Activity size={16} />Приблизительные</span><b>{approximateCount}</b></div>
              <div><span><BarChart3 size={16} />Героев в снимке</span><b>{formatNumber(meta.heroes.length)}</b></div>
            </div>
          </Panel>

          <Panel className="meta-contract-panel">
            <div className="panel-heading panel-heading--compact"><div><h2>Источник данных</h2><p>Параметры ответа backend без браузерных вычислений.</p></div><Layers3 size={19} className="panel-heading__icon" /></div>
            <div className="meta-contract-list">
              <div><span className="meta-contract-list__icon meta-contract-list__icon--ready"><BarChart3 size={17} /></span><p><strong>OpenDota</strong><small>Данные прошли серверный кеш и валидацию</small></p><StatusBadge tone="positive">API</StatusBadge></div>
              <div><span className="meta-contract-list__icon"><Target size={17} /></span><p><strong>Роли</strong><small>{formatCount(meta.positionStats.length, ['валидное сочетание', 'валидных сочетания', 'валидных сочетаний'])} герой–позиция</small></p><StatusBadge tone="info">{meta.rankFilter === 'all_ranks' ? 'Все ранги' : `R${meta.rank}`}</StatusBadge></div>
            </div>
          </Panel>
        </div>
      </div>

      <Drawer open={Boolean(selectedHero)} title={selectedHero?.localizedName ?? 'Герой'} eyebrow={selectedHero ? `${selectedHero.attackType} · ${selectedHero.roles.join(', ')}` : undefined} onClose={() => setSelectedHeroId(null)}>
        {selectedHero ? (
          <div className="meta-hero-drawer">
            <div className="meta-hero-drawer__cover">
              <img src={selectedHero.imageUrl} alt="" />
              <div><span>Общий показатель выбранного ранга</span><strong>{formatPercent(selectedHero.winRate * 100, 1)}</strong><small>{formatCount(selectedHero.wins, ['победа', 'победы', 'побед'])} · {formatCount(selectedHero.picks, ['игра', 'игры', 'игр'])}</small></div>
            </div>
            <section className="drawer-section">
              <div className="drawer-section__heading"><h3>Позиции героя</h3><StatusBadge tone="info">{selectedStats.length}</StatusBadge></div>
              {selectedStats.length ? (
                <div className="meta-build-list">
                  {selectedStats.map((stat) => <div key={stat.position}><span>{positionMeta[stat.position].short}</span><p><strong>{positionMeta[stat.position].title} · {formatPercent(stat.winRate * 100, 1)}</strong><small>{formatCount(stat.wins, ['победа', 'победы', 'побед'])} · {formatCount(stat.picks, ['игра', 'игры', 'игр'])} · {stat.isApproximate ? 'оценка роли' : 'точная роль'}</small></p></div>)}
                </div>
              ) : <p className="muted-message">Герой есть в общем снимке, но не прошёл минимальную выборку ни на одной позиции.</p>}
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
