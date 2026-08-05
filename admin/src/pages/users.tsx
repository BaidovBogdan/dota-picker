import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ShieldCheck, Sparkles } from 'lucide-react';
import type { PageResource } from '../App';
import {
  Button,
  ConfirmDialog,
  CustomSelect,
  Drawer,
  EmptyState,
  IconButton,
  Panel,
  SearchInput,
  SegmentedControl,
  StatusBadge,
  TableRowButton,
  UserAvatar,
} from '../components/ui';
import { formatDateTime, formatNumber, formatPercent, formatRelativeTime } from '../lib/format';
import type { AdminUser, AdminUsersResponse, Plan } from '../types';

const pageSize = 12;

function userLabel(user: AdminUser) {
  return user.email ?? `Гость ${user.id.slice(0, 8)}`;
}

export function UsersPage({
  resource,
  onRetry,
  onGrantProAll,
}: {
  resource: PageResource<AdminUsersResponse>;
  onRetry: () => void;
  onGrantProAll: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'user' | 'guest'>('all');
  const [plan, setPlan] = useState<'all' | Plan>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const items = resource.data?.items ?? [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((user) => (
      (kind === 'all' || user.kind === kind)
      && (plan === 'all' || user.plan === plan)
      && (!normalized || user.id.toLowerCase().includes(normalized) || user.email?.toLowerCase().includes(normalized))
    ));
  }, [items, kind, plan, query]);

  useEffect(() => setPage(1), [kind, plan, query]);
  useEffect(() => {
    if (selectedId && !items.some((user) => user.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = items.find((user) => user.id === selectedId) ?? null;

  if (resource.loading && !resource.data) {
    return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--table" /></div>;
  }
  if (resource.error && !resource.data) return <EmptyState title="Пользователи недоступны" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!resource.data) return <EmptyState title="Нет данных" text="API не вернул список пользователей." action={<Button onClick={onRetry}>Обновить</Button>} />;

  const grantAll = async () => {
    if (grantBusy) return;
    setGrantBusy(true);
    setActionError('');
    try {
      await onGrantProAll();
      setGrantOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось выдать Pro.');
    } finally {
      setGrantBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Аккаунты production-базы</span>
          <h1>Пользователи</h1>
          <p>{formatNumber(resource.data.pagination.total)} аккаунтов. Загружено {items.length}.</p>
        </div>
        <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => { setActionError(''); setGrantOpen(true); }}>Выдать Pro всем</Button>
      </header>

      {resource.error ? <div className="inline-error" role="status"><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Email или ID" ariaLabel="Поиск пользователей" />
          <div className="table-toolbar__filters">
            <SegmentedControl
              value={kind}
              onChange={setKind}
              ariaLabel="Тип аккаунта"
              options={[{ value: 'all', label: 'Все' }, { value: 'user', label: 'Аккаунты' }, { value: 'guest', label: 'Гости' }]}
            />
            <CustomSelect
              value={plan}
              onChange={setPlan}
              ariaLabel="Тариф"
              label="Тариф"
              options={[{ value: 'all', label: 'Все тарифы' }, { value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }]}
            />
          </div>
        </div>

        {visible.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Пользователь</th><th>Тариф</th><th>Проверки</th><th>Успешность</th><th>Квота</th><th>Последняя проверка</th><th><span className="sr-only">Открыть</span></th></tr></thead>
              <tbody>
                {visible.map((user) => {
                  const successRate = user.analysesCount ? (user.completedCount / user.analysesCount) * 100 : 0;
                  return (
                    <tr key={user.id} onClick={() => setSelectedId(user.id)}>
                      <td><div className="table-user"><UserAvatar name={userLabel(user)} size="sm" /><span><strong>{userLabel(user)}</strong><small>{user.kind === 'guest' ? 'Гостевой аккаунт' : user.id}</small></span></div></td>
                      <td><StatusBadge tone={user.plan === 'pro' ? 'info' : 'neutral'}>{user.plan === 'pro' ? (user.complimentaryPro ? 'Pro · подарок' : 'Pro') : 'Free'}</StatusBadge></td>
                      <td><strong className="table-number">{user.analysesCount}</strong><small className="table-subvalue">{user.failedCount} ошибок</small></td>
                      <td><strong className="table-number">{formatPercent(successRate, 0)}</strong></td>
                      <td><strong className="table-number">{user.quotaBalance}</strong></td>
                      <td><span className="table-date">{user.lastAnalysisAt ? formatRelativeTime(user.lastAnalysisAt) : 'Ещё не было'}</span></td>
                      <td onClick={(event) => event.stopPropagation()}><TableRowButton label={`Открыть ${userLabel(user)}`} onClick={() => setSelectedId(user.id)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Пользователей не найдено" text={items.length ? 'Измените фильтры или поисковый запрос.' : 'В production-базе пока нет аккаунтов.'} />}

        <footer className="table-footer">
          <span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} из ${filtered.length}` : '0 записей'}{resource.data.pagination.total > items.length ? ` · всего в базе ${resource.data.pagination.total}` : ''}</span>
          <div><IconButton label="Предыдущая страница" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></IconButton><span>{currentPage} / {pages}</span><IconButton label="Следующая страница" disabled={currentPage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight size={17} /></IconButton></div>
        </footer>
      </Panel>

      <Drawer open={Boolean(selected)} title={selected ? userLabel(selected) : 'Пользователь'} eyebrow={selected?.id} onClose={() => setSelectedId(null)}>
        {selected ? (
          <div className="user-drawer">
            <div className="user-identity"><UserAvatar name={userLabel(selected)} size="lg" /><div><div><StatusBadge tone={selected.plan === 'pro' ? 'info' : 'neutral'}>{selected.plan === 'pro' ? (selected.complimentaryPro ? 'Подарочный Pro' : 'Pro') : 'Free'}</StatusBadge><StatusBadge tone="neutral">{selected.kind === 'guest' ? 'Гость' : 'Аккаунт'}</StatusBadge></div><p>{selected.email ?? 'Email отсутствует'}</p></div></div>
            <div className="drawer-stat-grid"><div><span>Проверки</span><strong>{selected.analysesCount}</strong></div><div><span>Успешно</span><strong>{selected.completedCount}</strong></div><div><span>Квота</span><strong>{selected.quotaBalance}</strong></div></div>
            <section className="drawer-section drawer-section--details">
              <h3>Детали аккаунта</h3>
              <dl>
                <div><dt>Создан</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
                <div><dt>Обновлён</dt><dd>{formatDateTime(selected.updatedAt)}</dd></div>
                <div><dt>Отзывов</dt><dd>{selected.reviewsCount}</dd></div>
                <div><dt>Pro до</dt><dd>{selected.complimentaryPro ? 'Бессрочно' : selected.planExpiresAt ? formatDateTime(selected.planExpiresAt) : 'Не задано'}</dd></div>
              </dl>
            </section>
            <section className="drawer-section unavailable-actions">
              <div className="drawer-section__heading"><h3>Управление аккаунтом</h3><StatusBadge tone="warning">Нет endpoint</StatusBadge></div>
              <p>Изменение квоты, блокировка, отзыв сессий и удаление аккаунта отключены: backend пока не предоставляет защищённые команды и аудит для этих операций.</p>
            </section>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={grantOpen}
        title="Выдать Pro всем пользователям?"
        description="Это реальная массовая операция в production-базе. Backend выполнит её идемпотентно и запишет результат в аудит. Отменить изменение автоматически нельзя."
        confirmLabel={grantBusy ? 'Выдаём Pro…' : 'Подтвердить выдачу'}
        onConfirm={() => void grantAll()}
        onCancel={() => { if (!grantBusy) setGrantOpen(false); }}
      />
      {actionError ? <div className="action-error-toast" role="alert"><ShieldCheck size={17} /><span>{actionError}</span><button type="button" onClick={() => setActionError('')}>Закрыть</button></div> : null}
    </div>
  );
}
