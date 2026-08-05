import { AlertTriangle, CheckCircle2, MessageSquareText, ScanLine, Users } from 'lucide-react';
import type { PageResource } from '../App';
import { Button, EmptyState, Panel, SegmentedControl, StatusBadge } from '../components/ui';
import { formatNumber, formatPercent, formatRelativeTime, formatShortDate } from '../lib/format';
import type { AdminOverview } from '../types';

function MetricCard({
  label,
  value,
  hint,
  icon,
  featured = false,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <article className={`metric-card ${featured ? 'metric-card--featured' : ''}`}>
      <div className="metric-card__top"><span className="metric-card__label">{label}</span><span className="metric-card__icon">{icon}</span></div>
      <strong>{value}</strong>
      <div className="metric-card__footer"><span>{hint}</span></div>
    </article>
  );
}

function LoadingOverview() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="Загрузка обзора">
      <div className="page-skeleton page-skeleton--heading" />
      <div className="metric-grid">{Array.from({ length: 4 }, (_, index) => <div className="page-skeleton page-skeleton--metric" key={index} />)}</div>
      <div className="page-skeleton page-skeleton--panel" />
    </div>
  );
}

export function OverviewPage({
  resource,
  days,
  onDaysChange,
  onRetry,
}: {
  resource: PageResource<AdminOverview>;
  days: 7 | 30;
  onDaysChange: (days: 7 | 30) => void;
  onRetry: () => void;
}) {
  if (resource.loading && !resource.data) return <LoadingOverview />;
  if (resource.error && !resource.data) {
    return <EmptyState title="Обзор недоступен" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  }

  const overview = resource.data;
  if (!overview) return <EmptyState title="Нет данных" text="API не вернул обзор продукта." action={<Button onClick={onRetry}>Обновить</Button>} />;

  const successRate = overview.totals.analyses
    ? (overview.totals.completed / overview.totals.analyses) * 100
    : 0;
  const maxDaily = Math.max(1, ...overview.daily.map((item) => item.analyses));

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Обновлено {formatRelativeTime(overview.generatedAt)}</span>
          <h1>Обзор</h1>
          <p>Только показатели, рассчитанные по данным production-базы.</p>
        </div>
        <SegmentedControl
          value={`${days}d` as '7d' | '30d'}
          onChange={(value) => onDaysChange(value === '7d' ? 7 : 30)}
          ariaLabel="Период обзора"
          options={[{ value: '7d', label: '7 дней' }, { value: '30d', label: '30 дней' }]}
        />
      </header>

      {resource.error ? <div className="inline-error" role="status"><AlertTriangle size={16} /><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <div className="metric-grid">
        <MetricCard label="Проверки" value={formatNumber(overview.totals.analyses)} hint={`${overview.totals.processing} сейчас в обработке`} icon={<ScanLine size={18} />} featured />
        <MetricCard label="Пользователи" value={formatNumber(overview.totals.users)} hint={`${overview.totals.registered} аккаунтов · ${overview.totals.guests} гостей`} icon={<Users size={18} />} />
        <MetricCard label="Успешно" value={formatPercent(successRate, 1)} hint={`${overview.totals.failed} ошибок в выбранном периоде`} icon={<CheckCircle2 size={18} />} />
        <MetricCard label="Отзывы" value={formatNumber(overview.totals.reviews)} hint={`${overview.totals.pro} пользователей с Pro`} icon={<MessageSquareText size={18} />} />
      </div>

      <div className="overview-grid overview-grid--production">
        <Panel className="production-chart-panel" ariaLabel="Проверки по дням">
          <div className="panel-heading">
            <div><h2>Проверки по дням</h2><p>Активность за {overview.range.days} дней, UTC.</p></div>
            <StatusBadge tone="info">{overview.range.days} дней</StatusBadge>
          </div>
          {overview.daily.length ? (
            <div className="production-bars">
              {overview.daily.map((item) => (
                <div className="production-bar" key={item.date} title={`${formatShortDate(item.date)}: ${item.analyses} проверок`}>
                  <div><i style={{ height: `${Math.max(4, (item.analyses / maxDaily) * 100)}%` }} /></div>
                  <span>{formatShortDate(item.date)}</span>
                  <strong>{item.analyses}</strong>
                </div>
              ))}
            </div>
          ) : <EmptyState title="Проверок пока нет" text="За выбранный период в базе нет анализов." />}
        </Panel>

        <Panel className="live-panel" ariaLabel="Последние события">
          <div className="panel-heading panel-heading--compact">
            <div><span className="live-label"><i />Из базы</span><h2>Последние события</h2></div>
            <span className="activity-count">{overview.recentActivity.length}</span>
          </div>
          {overview.recentActivity.length ? (
            <div className="activity-rail">
              {overview.recentActivity.map((event) => (
                <article className="activity-item" key={event.id}>
                  <span className={`activity-item__dot activity-item__dot--${event.tone}`} />
                  <div><strong>{event.title}</strong><p>{event.detail}</p><time>{formatRelativeTime(event.createdAt)}</time></div>
                </article>
              ))}
            </div>
          ) : <p className="muted-message">Событий за период пока нет.</p>}
        </Panel>
      </div>
    </div>
  );
}
