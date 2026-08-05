import { BarChart3, Database, LockKeyhole } from 'lucide-react';
import type { PageResource } from '../App';
import { Button, EmptyState, Panel, StatusBadge } from '../components/ui';
import type { AdminSystem } from '../types';

export function MetaPage({ resource, onRetry }: { resource: PageResource<AdminSystem>; onRetry: () => void }) {
  if (resource.loading && !resource.data) return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--panel" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Статус меты недоступен" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;

  const allItems = resource.data
    ? [...resource.data.groups.connected, ...resource.data.groups.connectable, ...resource.data.groups.blocked]
    : [];
  const meta = allItems.find((item) => item.id.toLowerCase().includes('meta') || item.name.toLowerCase().includes('meta') || item.name.toLowerCase().includes('мета'));

  return (
    <div className="page-stack">
      <header className="page-heading"><div><span className="eyebrow">Без демонстрационных показателей</span><h1>Мета</h1><p>Раздел намеренно не строит графики, пока backend не отдаёт проверяемый административный контракт.</p></div></header>
      <Panel className="meta-unavailable-panel">
        <span className="meta-unavailable-panel__icon"><BarChart3 size={28} /></span>
        <div><StatusBadge tone="warning">Недоступно</StatusBadge><h2>Реальный admin endpoint для меты ещё не подключён</h2><p>{meta?.detail ?? 'Публичные игровые endpoint не дают административной панели полный проверяемый снимок с источником, временем обновления и качеством выборки.'}</p></div>
        <dl>
          <div><dt><Database size={16} /> Что нужно</dt><dd>{meta?.missing.length ? meta.missing.join(' · ') : 'Контракт snapshot, источник данных, fetchedAt и признаки stale/availability'}</dd></div>
          <div><dt><LockKeyhole size={16} /> Почему нет данных</dt><dd>{meta?.reason ?? 'Показывать вычисленные в браузере или моковые винрейты в production-консоли небезопасно.'}</dd></div>
        </dl>
        <Button onClick={onRetry} disabled={resource.loading}>Обновить аудит</Button>
      </Panel>
    </div>
  );
}
