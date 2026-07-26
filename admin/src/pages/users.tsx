import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  Button,
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
import {
  downloadCsv,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from '../lib/format';
import type { AdminAnalysis, AdminUser, Plan } from '../types';

type UserFilter = 'all' | 'user' | 'guest';
type SortKey = 'recent' | 'checks' | 'created';

type UsersPageProps = {
  users: AdminUser[];
  analyses: AdminAnalysis[];
  selectedUser: AdminUser | null;
  onSelectUser: (id: string) => void;
  onCloseUser: () => void;
  onUpdateUser: (id: string, patch: Partial<AdminUser>) => void;
  onRequestDelete: (user: AdminUser) => void;
  onNotify: (message: string) => void;
};

const pageSize = 10;

const planTone = (plan: Plan) => (plan === 'pro' ? 'info' : 'neutral');

export function UsersPage({
  users,
  analyses,
  selectedUser,
  onSelectUser,
  onCloseUser,
  onUpdateUser,
  onRequestDelete,
  onNotify,
}: UsersPageProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<UserFilter>('all');
  const [plan, setPlan] = useState<'all' | Plan>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [page, setPage] = useState(1);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users
      .filter((user) => kind === 'all' || user.kind === kind)
      .filter((user) => plan === 'all' || user.plan === plan)
      .filter((user) =>
        !normalizedQuery
        || user.displayName.toLowerCase().includes(normalizedQuery)
        || user.email?.toLowerCase().includes(normalizedQuery)
        || user.id.toLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => {
        if (sort === 'checks') return b.analysesCount - a.analysesCount;
        if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
        return b.lastActiveAt.localeCompare(a.lastActiveAt);
      });
  }, [kind, plan, query, sort, users]);

  useEffect(() => {
    setPage(1);
  }, [kind, plan, query, sort]);

  const pages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const selectedAnalyses = selectedUser
    ? analyses.filter((analysis) => analysis.userId === selectedUser.id).slice(0, 5)
    : [];

  const exportUsers = () => {
    downloadCsv('counterpick-users.csv', [
      ['ID', 'Имя', 'Email', 'Тип', 'Тариф', 'Статус', 'Проверки', 'Квота', 'Создан'],
      ...filteredUsers.map((user) => [
        user.id,
        user.displayName,
        user.email ?? '',
        user.kind,
        user.plan,
        user.status,
        user.analysesCount,
        user.quotaBalance,
        user.createdAt,
      ]),
    ]);
    onNotify('CSV пользователей сохранён');
  };

  const updatePlan = (nextPlan: Plan) => {
    if (!selectedUser) return;
    onUpdateUser(selectedUser.id, {
      plan: nextPlan,
      quotaBalance: nextPlan === 'pro' ? Math.max(25, selectedUser.quotaBalance) : Math.min(3, selectedUser.quotaBalance),
      planExpiresAt: nextPlan === 'pro'
        ? new Date('2026-08-26T16:35:00.000Z').toISOString()
        : null,
    });
    onNotify(nextPlan === 'pro' ? 'Пользователю включён Pro' : 'Пользователь переведён на Free');
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Управление доступом и квотами</span>
          <h1>Пользователи</h1>
          <p>{formatNumber(users.length)} аккаунта в демо-наборе.</p>
        </div>
        <Button icon={<Download size={16} />} onClick={exportUsers}>
          Экспорт CSV
        </Button>
      </header>

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Имя, email или ID"
            ariaLabel="Поиск пользователей"
          />
          <div className="table-toolbar__filters">
            <SegmentedControl
              value={kind}
              onChange={setKind}
              ariaLabel="Тип пользователя"
              options={[
                { value: 'all', label: 'Все' },
                { value: 'user', label: 'Аккаунты' },
                { value: 'guest', label: 'Гости' },
              ]}
            />
            <CustomSelect
              value={plan}
              onChange={setPlan}
              ariaLabel="Тариф"
              label="Тариф"
              options={[
                { value: 'all', label: 'Все тарифы' },
                { value: 'free', label: 'Free' },
                { value: 'pro', label: 'Pro' },
              ]}
            />
            <CustomSelect
              value={sort}
              onChange={setSort}
              ariaLabel="Сортировка"
              icon={<ArrowDownUp size={15} />}
              className="custom-select--sort"
              options={[
                { value: 'recent', label: 'Недавно активные' },
                { value: 'checks', label: 'Больше проверок' },
                { value: 'created', label: 'Сначала новые' },
              ]}
            />
          </div>
        </div>

        {visibleUsers.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Тариф</th>
                  <th>Статус</th>
                  <th>Проверки</th>
                  <th>Квота</th>
                  <th>Последняя активность</th>
                  <th><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id} onClick={() => onSelectUser(user.id)}>
                    <td>
                      <div className="table-user">
                        <UserAvatar name={user.displayName} size="sm" />
                        <span>
                          <strong>{user.displayName}</strong>
                          <small>{user.email ?? `${user.device} · ${user.id}`}</small>
                        </span>
                      </div>
                    </td>
                    <td><StatusBadge tone={planTone(user.plan)}>{user.plan === 'pro' ? 'Pro' : 'Free'}</StatusBadge></td>
                    <td>
                      <span className={`presence presence--${user.status}`}>
                        <i />
                        {user.status === 'active' ? 'Активен' : 'Ограничен'}
                      </span>
                    </td>
                    <td>
                      <strong className="table-number">{user.analysesCount}</strong>
                      <small className="table-subvalue">{formatPercent(user.successRate, 0)} успешно</small>
                    </td>
                    <td><strong className="table-number">{user.quotaBalance}</strong></td>
                    <td>
                      <span className="table-date">{formatRelativeTime(user.lastActiveAt)}</span>
                      <small className="table-subvalue">{user.country} · {user.device}</small>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <TableRowButton label={`Открыть ${user.displayName}`} onClick={() => onSelectUser(user.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Никого не нашли"
            text="Измените запрос или сбросьте один из фильтров."
            action={<Button onClick={() => { setQuery(''); setKind('all'); setPlan('all'); }}>Сбросить фильтры</Button>}
          />
        )}

        <footer className="table-footer">
          <span>
            {filteredUsers.length
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredUsers.length)} из ${filteredUsers.length}`
              : '0 записей'}
          </span>
          <div>
            <IconButton label="Предыдущая страница" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft size={17} />
            </IconButton>
            <span>{page} / {pages}</span>
            <IconButton label="Следующая страница" disabled={page === pages} onClick={() => setPage((value) => value + 1)}>
              <ChevronRight size={17} />
            </IconButton>
          </div>
        </footer>
      </Panel>

      <Drawer
        open={Boolean(selectedUser)}
        title={selectedUser?.displayName ?? 'Пользователь'}
        eyebrow={selectedUser?.id}
        onClose={onCloseUser}
      >
        {selectedUser ? (
          <div className="user-drawer">
            <div className="user-identity">
              <UserAvatar name={selectedUser.displayName} size="lg" />
              <div>
                <div>
                  <StatusBadge tone={planTone(selectedUser.plan)}>
                    {selectedUser.plan === 'pro' ? 'Pro' : 'Free'}
                  </StatusBadge>
                  <span className={`presence presence--${selectedUser.status}`}><i />{selectedUser.status === 'active' ? 'Активен' : 'Ограничен'}</span>
                </div>
                <p>{selectedUser.email ?? 'Гостевой аккаунт'}</p>
              </div>
            </div>

            <div className="drawer-stat-grid">
              <div><span>Проверки</span><strong>{selectedUser.analysesCount}</strong></div>
              <div><span>Успешность</span><strong>{formatPercent(selectedUser.successRate, 0)}</strong></div>
              <div><span>Остаток</span><strong>{selectedUser.quotaBalance}</strong></div>
            </div>

            <section className="drawer-section">
              <h3>Управление</h3>
              <div className="action-list">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateUser(selectedUser.id, { quotaBalance: selectedUser.quotaBalance + 5 });
                    onNotify('Добавлено 5 проверок');
                  }}
                >
                  <span><Plus size={17} /></span>
                  <p><strong>Добавить 5 проверок</strong><small>Ручная корректировка квоты</small></p>
                  <ChevronRight size={17} />
                </button>
                <button type="button" onClick={() => updatePlan(selectedUser.plan === 'pro' ? 'free' : 'pro')}>
                  <span><ShieldCheck size={17} /></span>
                  <p>
                    <strong>{selectedUser.plan === 'pro' ? 'Перевести на Free' : 'Выдать Pro на месяц'}</strong>
                    <small>Демо-действие без RevenueCat</small>
                  </p>
                  <ChevronRight size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextStatus = selectedUser.status === 'active' ? 'suspended' : 'active';
                    onUpdateUser(selectedUser.id, { status: nextStatus });
                    onNotify(nextStatus === 'active' ? 'Ограничение снято' : 'Доступ пользователя ограничен');
                  }}
                >
                  <span><Ban size={17} /></span>
                  <p>
                    <strong>{selectedUser.status === 'active' ? 'Ограничить доступ' : 'Восстановить доступ'}</strong>
                    <small>Сессии и новые запросы</small>
                  </p>
                  <ChevronRight size={17} />
                </button>
                <button type="button" onClick={() => onNotify('Все активные сессии отозваны')}>
                  <span><KeyRound size={17} /></span>
                  <p><strong>Выйти на всех устройствах</strong><small>Отозвать refresh-токены</small></p>
                  <ChevronRight size={17} />
                </button>
              </div>
            </section>

            <section className="drawer-section">
              <div className="drawer-section__heading">
                <h3>Последние проверки</h3>
                <span>{selectedAnalyses.length}</span>
              </div>
              <div className="drawer-analysis-list">
                {selectedAnalyses.length ? selectedAnalyses.map((analysis) => (
                  <div key={analysis.id}>
                    <span className={`analysis-state analysis-state--${analysis.status}`} />
                    <p>
                      <strong>{analysis.recommendation ?? analysis.errorCode ?? 'В обработке'}</strong>
                      <small>{analysis.source === 'photo' ? 'По фото' : 'Вручную'} · {formatDateTime(analysis.createdAt)}</small>
                    </p>
                    <StatusBadge tone={analysis.status === 'completed' ? 'positive' : analysis.status === 'failed' ? 'negative' : 'warning'}>
                      {analysis.status === 'completed' ? 'Готово' : analysis.status === 'failed' ? 'Ошибка' : 'Процесс'}
                    </StatusBadge>
                  </div>
                )) : (
                  <p className="muted-message">У пользователя ещё нет проверок.</p>
                )}
              </div>
            </section>

            <section className="drawer-section drawer-section--details">
              <h3>Детали аккаунта</h3>
              <dl>
                <div><dt>Создан</dt><dd>{formatDateTime(selectedUser.createdAt)}</dd></div>
                <div><dt>Устройство</dt><dd>{selectedUser.device}</dd></div>
                <div><dt>Страна</dt><dd>{selectedUser.country}</dd></div>
                <div><dt>Тип</dt><dd>{selectedUser.kind === 'guest' ? 'Гость' : 'Аккаунт'}</dd></div>
              </dl>
            </section>

            <div className="danger-zone">
              <div>
                <Trash2 size={18} />
                <p><strong>Удалить пользователя</strong><small>Аккаунт и связанные данные будут удалены.</small></p>
              </div>
              <Button variant="danger" size="sm" onClick={() => onRequestDelete(selectedUser)}>
                Удалить
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
