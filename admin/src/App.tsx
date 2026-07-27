import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  Command,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  ScanSearch,
  Search,
  Server,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog, IconButton, Toast, UserAvatar } from './components/ui';
import {
  dailyMetrics,
  heroDetails,
  initialActivity,
  initialAnalyses,
  initialReviews,
  initialUsers,
  metaSnapshots,
} from './data/mock-data';
import { downloadCsv } from './lib/format';
import { AnalysesPage } from './pages/analyses';
import { MetaPage } from './pages/meta';
import { OverviewPage } from './pages/overview';
import { ReviewsPage } from './pages/reviews';
import { SystemPage } from './pages/system';
import { UsersPage } from './pages/users';
import type { AdminAnalysis, AdminReview, AdminUser, PageId } from './types';

const navigation = [
  { id: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'analyses', label: 'Проверки', icon: ScanSearch },
  { id: 'reviews', label: 'Отзывы', icon: MessageSquareText },
  { id: 'meta', label: 'Мета', icon: BarChart3 },
  { id: 'system', label: 'Система', icon: Activity },
] satisfies Array<{ id: PageId; label: string; icon: typeof LayoutDashboard }>;

const pageFromHash = (): PageId => {
  const value = window.location.hash.replace(/^#\/?/, '');
  return navigation.some((item) => item.id === value) ? value as PageId : 'overview';
};

export function App() {
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [analyses, setAnalyses] = useState<AdminAnalysis[]>(initialAnalyses);
  const [reviews, setReviews] = useState<AdminReview[]>(initialReviews);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminUser | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const toastTimer = useRef<number | null>(null);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const selectedAnalysis = analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? null;

  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return users.slice(0, 4);
    return users
      .filter((user) =>
        user.displayName.toLowerCase().includes(query)
        || user.email?.toLowerCase().includes(query)
        || user.id.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [commandQuery, users]);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setSidebarOpen(false);
        setSelectedUserId(null);
        setSelectedAnalysisId(null);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/overview');
    }
  }, []);

  const navigate = (nextPage: PageId) => {
    window.location.hash = `/${nextPage}`;
    setPage(nextPage);
    setSidebarOpen(false);
    setSelectedUserId(null);
    setSelectedAnalysisId(null);
  };

  const notify = (message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToastMessage(message);
    setToastVisible(true);
    toastTimer.current = window.setTimeout(() => setToastVisible(false), 2_600);
  };

  const updateUser = (id: string, patch: Partial<AdminUser>) => {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...patch } : user));
  };

  const deleteUser = () => {
    if (!deleteCandidate) return;
    setUsers((current) => current.filter((user) => user.id !== deleteCandidate.id));
    setAnalyses((current) => current.filter((analysis) => analysis.userId !== deleteCandidate.id));
    setReviews((current) => current.filter((review) => review.userId !== deleteCandidate.id));
    setSelectedUserId(null);
    setDeleteCandidate(null);
    notify('Пользователь и связанные демо-данные удалены');
  };

  const openUser = (id: string) => {
    if (page !== 'users') navigate('users');
    window.setTimeout(() => setSelectedUserId(id), 0);
  };

  const openAnalysis = (id: string) => {
    setSelectedAnalysisId(id);
  };

  const exportOverview = () => {
    downloadCsv('counterpick-overview.csv', [
      ['Дата', 'Проверки', 'Пользователи', 'Ошибки'],
      ...dailyMetrics.map((item) => [item.date, item.checks, item.users, item.failures]),
    ]);
    notify('Отчёт за 30 дней сохранён');
  };

  return (
    <div className="admin-shell">
      <button
        type="button"
        className={`sidebar-overlay ${sidebarOpen ? 'is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-label="Закрыть меню"
      />
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <span className="brand__mark">C</span>
          <div><strong>Counterpick</strong><small>Admin console</small></div>
          <IconButton label="Закрыть меню" className="sidebar__close" onClick={() => setSidebarOpen(false)}>
            <X size={19} />
          </IconButton>
        </div>

        <div className="workspace-switcher">
          <span><Server size={16} /></span>
          <div><strong>Основной проект</strong><small>Demo workspace</small></div>
          <ChevronDown size={16} />
        </div>

        <nav className="sidebar-nav" aria-label="Основная навигация">
          <span className="sidebar-nav__label">Управление</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={page === item.id ? 'is-active' : ''}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === 'analyses' ? <b>{analyses.filter((analysis) => analysis.status === 'processing').length}</b> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <span>Демо-режим</span>
          <p>Все изменения применяются только к мок-данным в этом окне.</p>
        </div>

        <div className="sidebar-profile">
          <UserAvatar name="Bogdan Admin" size="sm" />
          <div><strong>Bogdan</strong><small>Владелец</small></div>
          <IconButton label="Меню профиля"><ChevronDown size={16} /></IconButton>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <IconButton label="Открыть меню" className="topbar__menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </IconButton>
          <button className="command-trigger" type="button" onClick={() => setCommandOpen(true)}>
            <Search size={17} />
            <span>Найти пользователя, проверку или раздел</span>
            <kbd><Command size={12} />K</kbd>
          </button>
          <div className="topbar__right">
            <span className="environment-pill"><i />Демо-данные</span>
            <IconButton label="Уведомления" className="notification-button">
              <Bell size={18} />
              <i />
            </IconButton>
          </div>
        </header>

        <div className="page-container">
          {page === 'overview' ? (
            <OverviewPage
              users={users}
              analyses={analyses}
              metrics={dailyMetrics}
              activity={initialActivity}
              onExport={exportOverview}
              onOpenUser={openUser}
            />
          ) : null}
          {page === 'users' ? (
            <UsersPage
              users={users}
              analyses={analyses}
              selectedUser={selectedUser}
              onSelectUser={setSelectedUserId}
              onCloseUser={() => setSelectedUserId(null)}
              onUpdateUser={updateUser}
              onRequestDelete={setDeleteCandidate}
              onNotify={notify}
            />
          ) : null}
          {page === 'analyses' ? (
            <AnalysesPage
              analyses={analyses}
              users={users}
              selectedAnalysis={selectedAnalysis}
              onSelectAnalysis={openAnalysis}
              onCloseAnalysis={() => setSelectedAnalysisId(null)}
              onNotify={notify}
            />
          ) : null}
          {page === 'reviews' ? (
            <ReviewsPage
              reviews={reviews}
              users={users}
              analyses={analyses}
              onDelete={(review) => {
                setReviews((current) => current.filter((item) => item.id !== review.id));
                notify('Отзыв удалён из демо-набора');
              }}
            />
          ) : null}
          {page === 'meta' ? (
            <MetaPage snapshots={metaSnapshots} heroDetails={heroDetails} />
          ) : null}
          {page === 'system' ? <SystemPage analyses={analyses} onNotify={notify} /> : null}
        </div>
      </main>

      {commandOpen ? (
        <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)} role="presentation">
          <div className="command-palette" role="dialog" aria-modal="true" aria-label="Быстрый поиск" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-palette__input">
              <Search size={19} />
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Введите имя, email или раздел"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="command-palette__results">
              <span>Разделы</span>
              {navigation
                .filter((item) => !commandQuery || item.label.toLowerCase().includes(commandQuery.toLowerCase()))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button type="button" key={item.id} onClick={() => { navigate(item.id); setCommandOpen(false); setCommandQuery(''); }}>
                      <i><Icon size={17} /></i>
                      <strong>{item.label}</strong>
                      <small>Перейти</small>
                    </button>
                  );
                })}
              <span>Пользователи</span>
              {commandResults.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => {
                    openUser(user.id);
                    setCommandOpen(false);
                    setCommandQuery('');
                  }}
                >
                  <UserAvatar name={user.displayName} size="sm" />
                  <strong>{user.displayName}</strong>
                  <small>{user.email ?? 'Гость'}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="Удалить пользователя?"
        description={`Аккаунт ${deleteCandidate?.email ?? deleteCandidate?.displayName ?? ''} и связанные проверки исчезнут из демо-набора. Отменить это действие нельзя.`}
        confirmLabel="Удалить пользователя"
        onConfirm={deleteUser}
        onCancel={() => setDeleteCandidate(null)}
      />
      <Toast message={toastMessage} visible={toastVisible} />
    </div>
  );
}
