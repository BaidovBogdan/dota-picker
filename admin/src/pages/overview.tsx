import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  Download,
  MousePointer2,
  ScanLine,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import {
  Button,
  ChartTooltip,
  Panel,
  SegmentedControl,
  StatusBadge,
  UserAvatar,
} from '../components/ui';
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatShortDate,
} from '../lib/format';
import type { ActivityEvent, AdminAnalysis, AdminUser, DailyMetric } from '../types';

type Period = '7d' | '30d';

type OverviewProps = {
  users: AdminUser[];
  analyses: AdminAnalysis[];
  metrics: DailyMetric[];
  activity: ActivityEvent[];
  onExport: () => void;
  onOpenUser: (id: string) => void;
};

function MetricCard({
  label,
  value,
  delta,
  hint,
  icon,
  featured = false,
}: {
  label: string;
  value: string;
  delta: number;
  hint: string;
  icon: React.ReactNode;
  featured?: boolean;
}) {
  const positive = delta >= 0;
  return (
    <article className={`metric-card ${featured ? 'metric-card--featured' : ''}`}>
      <div className="metric-card__top">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-card__footer">
        <span className={positive ? 'trend trend--positive' : 'trend trend--negative'}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(delta).toFixed(1)}%
        </span>
        <span>{hint}</span>
      </div>
    </article>
  );
}

function ActivityChart({ metrics }: { metrics: DailyMetric[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 900;
  const height = 274;
  const padding = { top: 18, right: 16, bottom: 34, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.ceil(Math.max(...metrics.map((item) => item.checks)) / 25) * 25;
  const min = Math.max(0, Math.floor(Math.min(...metrics.map((item) => item.checks)) / 25) * 25 - 25);
  const range = Math.max(1, max - min);
  const points = metrics.map((item, index) => ({
    ...item,
    x: padding.left + (index / Math.max(1, metrics.length - 1)) * innerWidth,
    y: padding.top + innerHeight - ((item.checks - min) / range) * innerHeight,
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${path} L ${points.at(-1)?.x ?? 0} ${padding.top + innerHeight} L ${points[0]?.x ?? 0} ${padding.top + innerHeight} Z`;
  const yTicks = Array.from({ length: 4 }, (_, index) => min + (range / 3) * index).reverse();
  const xTickIndexes = metrics.length <= 7
    ? metrics.map((_, index) => index)
    : [0, Math.floor((metrics.length - 1) / 3), Math.floor(((metrics.length - 1) * 2) / 3), metrics.length - 1];
  const activePoint = activeIndex === null ? null : points[activeIndex];

  return (
    <div className="activity-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График выполненных проверок">
        <defs>
          <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#635bff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#635bff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = padding.top + innerHeight - ((tick - min) / range) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="chart-label">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#activity-fill)" />
        <path d={path} className="chart-line" />
        {activePoint ? (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={padding.top}
            y2={padding.top + innerHeight}
            className="chart-guide"
          />
        ) : null}
        {points.map((point) => (
          <circle
            key={`dot-${point.date}`}
            cx={point.x}
            cy={point.y}
            r={activePoint?.date === point.date ? 5 : 3.5}
            className={`chart-dot ${activePoint?.date === point.date ? 'is-active' : ''}`}
          />
        ))}
        {points.map((point, index) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r="11"
            className="chart-hit"
            tabIndex={0}
            role="button"
            aria-label={`${formatShortDate(point.date)}: ${point.checks} проверок, ${point.users} пользователей, ${point.failures} ошибок`}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
          />
        ))}
        {xTickIndexes.map((index) => (
          <text
            key={metrics[index].date}
            x={points[index].x}
            y={height - 7}
            textAnchor={index === 0 ? 'start' : index === metrics.length - 1 ? 'end' : 'middle'}
            className="chart-label"
          >
            {formatShortDate(metrics[index].date)}
          </text>
        ))}
      </svg>
      {activePoint ? (
        <ChartTooltip
          title={formatShortDate(activePoint.date)}
          value={`${formatNumber(activePoint.checks)} проверок`}
          detail={`${activePoint.users} пользователей · ${activePoint.failures} ошибок`}
          className={`chart-tooltip--point is-visible ${
            activeIndex === 0 ? 'is-start' : activeIndex === points.length - 1 ? 'is-end' : ''
          }`}
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${(activePoint.y / height) * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}

export function OverviewPage({
  users,
  analyses,
  metrics,
  activity,
  onExport,
  onOpenUser,
}: OverviewProps) {
  const [period, setPeriod] = useState<Period>('30d');
  const visibleMetrics = period === '7d' ? metrics.slice(-7) : metrics;
  const checkCount = visibleMetrics.reduce((sum, item) => sum + item.checks, 0);
  const failures = visibleMetrics.reduce((sum, item) => sum + item.failures, 0);
  const successRate = checkCount ? ((checkCount - failures) / checkCount) * 100 : 0;
  const proCount = users.filter((user) => user.plan === 'pro').length;
  const registeredCount = users.filter((user) => user.kind === 'user').length;
  const photoCount = analyses.filter((analysis) => analysis.source === 'photo').length;
  const photoShare = analyses.length ? (photoCount / analyses.length) * 100 : 0;
  const recentUsers = useMemo(
    () => [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [users],
  );

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">26 июля · данные обновлены сейчас</span>
          <h1>Обзор</h1>
          <p>Главные показатели продукта и события, требующие внимания.</p>
        </div>
        <div className="page-heading__actions">
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            ariaLabel="Период статистики"
            options={[
              { value: '7d', label: '7 дней' },
              { value: '30d', label: '30 дней' },
            ]}
          />
          <Button icon={<Download size={16} />} onClick={onExport}>
            Экспорт
          </Button>
        </div>
      </header>

      <div className="metric-grid">
        <MetricCard
          label="Проверки"
          value={formatCompact(checkCount)}
          delta={18.4}
          hint={period === '7d' ? 'к прошлой неделе' : 'к прошлому периоду'}
          icon={<ScanLine size={18} />}
          featured
        />
        <MetricCard
          label="Пользователи"
          value={formatNumber(users.length)}
          delta={12.8}
          hint={`${registeredCount} зарегистрированы`}
          icon={<Users size={18} />}
        />
        <MetricCard
          label="Успешно"
          value={formatPercent(successRate, 1)}
          delta={2.1}
          hint={`${failures} ошибок за период`}
          icon={<CheckCircle2 size={18} />}
        />
        <MetricCard
          label="Активный Pro"
          value={formatNumber(proCount)}
          delta={8.6}
          hint={`${formatPercent((proCount / Math.max(1, registeredCount)) * 100, 0)} от аккаунтов`}
          icon={<Sparkles size={18} />}
        />
      </div>

      <div className="overview-grid">
        <Panel className="chart-panel" ariaLabel="Динамика проверок">
          <div className="panel-heading">
            <div>
              <h2>Проверки по дням</h2>
              <p>Завершённые анализы, включая ручной выбор и фото.</p>
            </div>
            <div className="chart-total">
              <strong>{formatNumber(visibleMetrics.at(-1)?.checks ?? 0)}</strong>
              <span>сегодня</span>
            </div>
          </div>
          <ActivityChart metrics={visibleMetrics} />
          <div className="chart-legend">
            <span><i className="legend-dot legend-dot--primary" />Проверки</span>
            <span><i className="legend-dot legend-dot--muted" />Суточный итог, UTC</span>
          </div>
        </Panel>

        <Panel className="live-panel" ariaLabel="События в реальном времени">
          <div className="panel-heading panel-heading--compact">
            <div>
              <span className="live-label"><i />В реальном времени</span>
              <h2>Лента событий</h2>
            </div>
            <span className="activity-count">{activity.length}</span>
          </div>
          <div className="activity-rail">
            {activity.map((event) => (
              <article className="activity-item" key={event.id}>
                <span className={`activity-item__dot activity-item__dot--${event.tone}`} />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                  <time>{formatRelativeTime(event.createdAt)}</time>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="overview-bottom-grid">
        <Panel className="source-panel" ariaLabel="Источники проверок">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Откуда начинают проверку</h2>
              <p>Фото остаётся основным сценарием.</p>
            </div>
          </div>
          <div className="source-breakdown">
            <div
              className="source-donut"
              style={{ '--photo-share': `${photoShare}%` } as React.CSSProperties}
              tabIndex={0}
              aria-label={`Фото: ${formatPercent(photoShare, 0)}, вручную: ${formatPercent(100 - photoShare, 0)}`}
            >
              <div>
                <strong>{formatPercent(photoShare, 0)}</strong>
                <span>по фото</span>
              </div>
              <ChartTooltip
                title="Источники"
                value={`${photoCount} по фото`}
                detail={`${analyses.length - photoCount} вручную`}
                className="chart-tooltip--floating"
              />
            </div>
            <div className="source-list">
              <div>
                <span className="source-icon source-icon--photo"><Camera size={17} /></span>
                <p><strong>Фото</strong><span>{photoCount} проверок</span></p>
                <b>{formatPercent(photoShare, 0)}</b>
              </div>
              <div>
                <span className="source-icon source-icon--manual"><MousePointer2 size={17} /></span>
                <p><strong>Вручную</strong><span>{analyses.length - photoCount} проверок</span></p>
                <b>{formatPercent(100 - photoShare, 0)}</b>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="funnel-panel" ariaLabel="Воронка продукта">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Путь до постоянного использования</h2>
              <p>Доля пользователей от первого запуска.</p>
            </div>
            <StatusBadge tone="info">30 дней</StatusBadge>
          </div>
          <div className="funnel-list">
            {[
              { label: 'Первый запуск', value: 100, count: users.length },
              { label: 'Первая проверка', value: 76, count: Math.round(users.length * 0.76) },
              { label: 'Третья проверка', value: 48, count: Math.round(users.length * 0.48) },
              { label: 'Перешли на Pro', value: 21, count: proCount },
            ].map((item) => (
              <div
                className="funnel-row chart-tooltip-anchor"
                key={item.label}
                tabIndex={0}
                aria-label={`${item.label}: ${item.count} пользователей, ${item.value}% от первого запуска`}
              >
                <span className="funnel-row__label">{item.label}</span>
                <div><i style={{ width: `${item.value}%` }} /></div>
                <strong>{item.count}</strong>
                <ChartTooltip
                  title={item.label}
                  value={`${item.count} пользователей`}
                  detail={`${item.value}% от первого запуска`}
                  className="chart-tooltip--floating"
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="recent-users-panel" ariaLabel="Новые пользователи">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Новые пользователи</h2>
              <p>Последние созданные аккаунты.</p>
            </div>
            <UserRoundCheck size={19} className="panel-heading__icon" />
          </div>
          <div className="mini-user-list">
            {recentUsers.map((user) => (
              <button key={user.id} type="button" onClick={() => onOpenUser(user.id)}>
                <UserAvatar name={user.displayName} size="sm" />
                <span>
                  <strong>{user.displayName}</strong>
                  <small>{user.email ?? user.device}</small>
                </span>
                <time>{formatRelativeTime(user.createdAt)}</time>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
