import { CheckCircle2, CircleDashed, Database, Link2, LockKeyhole, Server, TriangleAlert } from 'lucide-react';
import type { PageResource } from '../App';
import { Button, EmptyState, Panel, StatusBadge } from '../components/ui';
import { formatRelativeTime } from '../lib/format';
import type { AdminSystem, AdminSystemItem } from '../types';

function IntegrationList({ items, tone }: { items: AdminSystemItem[]; tone: 'positive' | 'warning' | 'negative' }) {
  if (!items.length) return <p className="muted-message">В этой группе нет элементов.</p>;
  return (
    <div className="integration-list">
      {items.map((item) => (
        <article key={item.id}>
          <span className={`integration-list__mark integration-list__mark--${tone}`}>
            {tone === 'positive' ? <CheckCircle2 size={18} /> : tone === 'warning' ? <CircleDashed size={18} /> : <LockKeyhole size={18} />}
          </span>
          <div><strong>{item.name}</strong><p>{item.detail}</p>{item.reason ? <small>{item.reason}</small> : null}</div>
          <StatusBadge tone={tone}>{tone === 'positive' ? 'Подключено' : tone === 'warning' ? 'Можно подключить' : 'Не подключено'}</StatusBadge>
          {item.missing.length ? <ul>{item.missing.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
        </article>
      ))}
    </div>
  );
}

export function SystemPage({ resource, onRetry }: { resource: PageResource<AdminSystem>; onRetry: () => void }) {
  if (resource.loading && !resource.data) return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--panel" /><div className="page-skeleton page-skeleton--panel" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Система недоступна" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!resource.data) return <EmptyState title="Нет системного аудита" text="Backend не вернул карту интеграций." action={<Button onClick={onRetry}>Обновить</Button>} />;

  const system = resource.data;
  return (
    <div className="page-stack">
      <header className="page-heading"><div><span className="eyebrow">Аудит backend · {formatRelativeTime(system.generatedAt)}</span><h1>Система</h1><p>Честная карта того, что работает, что можно подключить сейчас и для чего сначала нужны данные.</p></div><Button onClick={onRetry} disabled={resource.loading}>Проверить снова</Button></header>
      {resource.error ? <div className="inline-error"><TriangleAlert size={16} /><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <div className="system-summary-grid">
        <Panel><span><Server size={18} /></span><div><small>API</small><strong>{system.summary.api.status === 'connected' ? 'Подключён' : system.summary.api.status}</strong></div></Panel>
        <Panel><span><Database size={18} /></span><div><small>База данных</small><strong>{system.summary.database.status === 'connected' ? `Подключена · ${system.summary.database.latencyMs} мс` : 'Недоступна'}</strong></div></Panel>
        <Panel><span><Link2 size={18} /></span><div><small>Интеграции</small><strong>Подключено: {system.summary.connected} · готовы: {system.summary.connectable}</strong></div></Panel>
      </div>

      <section className="system-audit-group">
        <div className="system-audit-group__heading"><div><span className="system-audit-group__icon system-audit-group__icon--positive"><CheckCircle2 size={19} /></span><div><h2>Подключено</h2><p>Есть рабочий код и конфигурация; runtime-проверки указаны в деталях.</p></div></div><strong>{system.groups.connected.length}</strong></div>
        <Panel><IntegrationList items={system.groups.connected} tone="positive" /></Panel>
      </section>

      <section className="system-audit-group">
        <div className="system-audit-group__heading"><div><span className="system-audit-group__icon system-audit-group__icon--warning"><CircleDashed size={19} /></span><div><h2>Можно подключить сейчас</h2><p>Контракт или источник уже есть; перечислены недостающие шаги конфигурации.</p></div></div><strong>{system.groups.connectable.length}</strong></div>
        <Panel><IntegrationList items={system.groups.connectable} tone="warning" /></Panel>
      </section>

      <section className="system-audit-group">
        <div className="system-audit-group__heading"><div><span className="system-audit-group__icon system-audit-group__icon--negative"><LockKeyhole size={19} /></span><div><h2>Пока нельзя подключить</h2><p>Сначала нужна схема базы, endpoint, аудит действий или отдельная телеметрия.</p></div></div><strong>{system.groups.blocked.length}</strong></div>
        <Panel><IntegrationList items={system.groups.blocked} tone="negative" /></Panel>
      </section>
    </div>
  );
}
