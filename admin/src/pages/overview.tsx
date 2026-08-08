import { AlertTriangle, CheckCircle2, MessageSquareText, ScanLine, Users } from 'lucide-react';
import type { PageResource } from '../App';
import { ActivityChart } from '../components/charts';
import { Button, EmptyState, Panel, SegmentedControl } from '../components/ui';
import { formatCount, formatNumber, formatPercent, formatRelativeTime } from '../lib/format';
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

  const terminalAnalyses = overview.totals.completed + overview.totals.failed;
  const successRate = terminalAnalyses
    ? (overview.totals.completed / terminalAnalyses) * 100
    : 0;
  const periodAnalyses = overview.daily.reduce((sum, item) => sum + item.analyses, 0);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Обновлено {formatRelativeTime(overview.generatedAt)}</span>
          <h1>Обзор</h1>
          <p>Только показатели, рассчитанные по данным серверной базы.</p>
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
        <MetricCard label="Проверки" value={formatNumber(overview.totals.analyses)} hint={`${formatCount(overview.totals.processing, ['проверка', 'проверки', 'проверок'])} сейчас в обработке`} icon={<ScanLine size={18} />} featured />
        <MetricCard label="Пользователи" value={formatNumber(overview.totals.users)} hint={`${formatCount(overview.totals.registered, ['аккаунт', 'аккаунта', 'аккаунтов'])} · ${formatCount(overview.totals.guests, ['гость', 'гостя', 'гостей'])}`} icon={<Users size={18} />} />
        <MetricCard label="Успешно" value={formatPercent(successRate, 1)} hint={`${formatCount(overview.totals.failed, ['ошибка', 'ошибки', 'ошибок'])} за всё время`} icon={<CheckCircle2 size={18} />} />
        <MetricCard label="Отзывы" value={formatNumber(overview.totals.reviews)} hint={`${formatCount(overview.totals.pro, ['пользователь', 'пользователя', 'пользователей'])} с Pro`} icon={<MessageSquareText size={18} />} />
      </div>

      <div className="overview-grid overview-grid--production">
        <Panel className="chart-panel production-chart-panel" ariaLabel="Динамика проверок, пользователей и ошибок">
          <div className="panel-heading">
            <div><h2>Динамика продукта</h2><p>Проверки, активные пользователи и ошибки по дням, UTC.</p></div>
            <div className="chart-total"><strong>{formatNumber(periodAnalyses)}</strong><span>за {overview.range.days} дней</span></div>
          </div>
          {periodAnalyses ? (
            <ActivityChart metrics={overview.daily} />
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
          ) : <p className="muted-message">В базе пока нет событий.</p>}
        </Panel>
      </div>
    </div>
  );
}
