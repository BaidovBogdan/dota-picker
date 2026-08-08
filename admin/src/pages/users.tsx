import { useEffect, useState } from 'react';
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
import { formatCount, formatDateTime, formatPercent, formatRelativeTime } from '../lib/format';
import { useDebouncedValue } from '../lib/use-debounced-value';
import type { AdminUser, AdminUsersQuery, AdminUsersResponse, Plan } from '../types';

const pageSize = 20;

function userLabel(user: AdminUser) {
  return user.email ?? `Гость ${user.id.slice(0, 8)}`;
}

export function UsersPage({
  resource,
  initialQuery,
  onRetry,
  onQueryChange,
  onGrantProAll,
}: {
  resource: PageResource<AdminUsersResponse>;
  initialQuery: AdminUsersQuery;
  onRetry: () => void;
  onQueryChange: (query: AdminUsersQuery) => void;
  onGrantProAll: () => Promise<void>;
}) {
  const [query, setQuery] = useState(() => initialQuery.q ?? '');
  const [kind, setKind] = useState<'all' | 'user' | 'guest'>(() => initialQuery.kind ?? 'all');
  const [plan, setPlan] = useState<'all' | Plan>(() => initialQuery.plan ?? 'all');
  const [page, setPage] = useState(() => Math.floor(initialQuery.offset / pageSize) + 1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 280);

  const items = resource.data?.items ?? [];
  const total = resource.data?.pagination.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pages);

  useEffect(() => {
    onQueryChange({
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      q: debouncedQuery || undefined,
      kind: kind === 'all' ? undefined : kind,
      plan: plan === 'all' ? undefined : plan,
    });
  }, [currentPage, debouncedQuery, kind, onQueryChange, plan]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  useEffect(() => {
    if (selectedId && !items.some((user) => user.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

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
          <span className="eyebrow">Аккаунты серверной базы</span>
          <h1>Пользователи</h1>
          <p>{formatCount(resource.data.pagination.total, ['аккаунт', 'аккаунта', 'аккаунтов'])} по текущим фильтрам.</p>
        </div>
        <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => { setActionError(''); setGrantOpen(true); }}>Выдать Pro всем</Button>
      </header>

      {resource.error ? <div className="inline-error" role="status"><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Email, устройство или ID" ariaLabel="Поиск пользователей" />
          <div className="table-toolbar__filters">
            <SegmentedControl
              value={kind}
              onChange={(value) => { setKind(value); setPage(1); }}
              ariaLabel="Тип аккаунта"
              options={[{ value: 'all', label: 'Все' }, { value: 'user', label: 'Аккаунты' }, { value: 'guest', label: 'Гости' }]}
            />
            <CustomSelect
              value={plan}
              onChange={(value) => { setPlan(value); setPage(1); }}
              ariaLabel="Тариф"
              label="Тариф"
              options={[{ value: 'all', label: 'Все тарифы' }, { value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }]}
            />
          </div>
        </div>

        {items.length ? (
          <div className={`data-table-wrap ${resource.loading ? 'is-loading' : ''}`} aria-busy={resource.loading}>
            <table className="data-table">
              <thead><tr><th>Пользователь</th><th>Тариф</th><th>Проверки</th><th>Успешность</th><th>Квота</th><th>Последняя проверка</th><th><span className="sr-only">Открыть</span></th></tr></thead>
              <tbody>
                {items.map((user) => {
                  return (
                    <tr key={user.id} onClick={() => setSelectedId(user.id)}>
                      <td><div className="table-user"><UserAvatar name={userLabel(user)} size="sm" /><span><strong>{userLabel(user)}</strong><small>{user.kind === 'guest' ? 'Гостевой аккаунт' : user.id}</small></span></div></td>
                      <td><StatusBadge tone={user.plan === 'pro' ? 'info' : 'neutral'}>{user.plan === 'pro' ? (user.complimentaryPro ? 'Pro · подарок' : 'Pro') : 'Free'}</StatusBadge></td>
                      <td><strong className="table-number">{user.analysesCount}</strong><small className="table-subvalue">{formatCount(user.failedCount, ['ошибка', 'ошибки', 'ошибок'])}</small></td>
                      <td><strong className="table-number">{user.successRate === null ? '—' : formatPercent(user.successRate * 100, 0)}</strong></td>
                      <td><strong className="table-number">{user.quotaBalance}</strong></td>
                      <td><span className="table-date">{user.lastAnalysisAt ? formatRelativeTime(user.lastAnalysisAt) : 'Ещё не было'}</span></td>
                      <td onClick={(event) => event.stopPropagation()}><TableRowButton label={`Открыть ${userLabel(user)}`} onClick={() => setSelectedId(user.id)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Пользователей не найдено" text={query || kind !== 'all' || plan !== 'all' ? 'Измените фильтры или поисковый запрос.' : 'В базе пока нет аккаунтов.'} />}

        <footer className="table-footer">
          <span>{total ? `${resource.data.pagination.offset + 1}–${resource.data.pagination.offset + items.length} из ${total}` : '0 записей'}</span>
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
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={grantOpen}
        title="Выдать Pro всем пользователям?"
        description="Это реальная массовая операция в подключённой базе. Backend выполнит её идемпотентно и запишет результат в аудит. Отменить изменение автоматически нельзя."
        confirmLabel={grantBusy ? 'Выдаём Pro…' : 'Подтвердить выдачу'}
        onConfirm={() => void grantAll()}
        onCancel={() => { if (!grantBusy) setGrantOpen(false); }}
      />
      {actionError ? <div className="action-error-toast" role="alert"><ShieldCheck size={17} /><span>{actionError}</span><button type="button" onClick={() => setActionError('')}>Закрыть</button></div> : null}
    </div>
  );
}
