import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  RefreshCw,
  ScanSearch,
  Server,
  Users,
  X,
} from 'lucide-react';
import {
  adminApi,
  ApiError,
  clearSession,
  createSession,
  readSession,
  saveSession,
} from './api/client';
import { Button, IconButton, Toast, UserAvatar } from './components/ui';
import { AnalysesPage } from './pages/analyses';
import { MetaPage } from './pages/meta';
import { OverviewPage } from './pages/overview';
import { ReviewsPage } from './pages/reviews';
import { SystemPage } from './pages/system';
import { UsersPage } from './pages/users';
import type {
  AdminAnalysesResponse,
  AdminAnalysesQuery,
  AdminMeta,
  AdminOverview,
  AdminReviewsResponse,
  AdminReviewsQuery,
  AdminSession,
  AdminSystem,
  AdminUsersResponse,
  AdminUsersQuery,
  PageId,
  RankBracket,
} from './types';

type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

const emptyResource = <T,>(): Resource<T> => ({ data: null, loading: true, error: null });

function sameQuery(left: object, right: object) {
  const leftValues = left as Record<string, unknown>;
  const rightValues = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftValues), ...Object.keys(rightValues)]);
  return [...keys].every((key) => leftValues[key] === rightValues[key]);
}

const navigation = [
  { id: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'analyses', label: 'Проверки', icon: ScanSearch },
  { id: 'reviews', label: 'Отзывы', icon: MessageSquareText },
  { id: 'meta', label: 'Мета', icon: BarChart3 },
  { id: 'system', label: 'Система', icon: Activity },
] satisfies Array<{ id: PageId; label: string; icon: typeof LayoutDashboard }>;

function pageFromHash(): PageId {
  const value = window.location.hash.replace(/^#\/?/, '');
  return navigation.some((item) => item.id === value) ? value as PageId : 'overview';
}

function errorText(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === 'AbortError') return null;
  return 'Не удалось получить данные. Проверьте соединение и повторите запрос.';
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (session: AdminSession) => void }) {
  const [key, setKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = key.trim();
    if (!normalized || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const session = await createSession(normalized);
      saveSession(session);
      setKey('');
      onAuthenticated(session);
    } catch (requestError) {
      setError(errorText(requestError) ?? 'Вход отменён.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login">
      <section className="admin-login__card" aria-labelledby="admin-login-title">
        <div className="admin-login__brand"><span>C</span><strong>Counterpick</strong></div>
        <div className="admin-login__copy">
          <span className="eyebrow">Защищённая консоль</span>
          <h1 id="admin-login-title">Вход администратора</h1>
          <p>Введите ADMIN_API_KEY. Ключ используется один раз и не сохраняется в браузере.</p>
        </div>
        <form onSubmit={submit} className="admin-login__form">
          <label htmlFor="admin-key">ADMIN_API_KEY</label>
          <input
            id="admin-key"
            type="password"
            autoComplete="off"
            autoFocus
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'admin-login-error' : undefined}
            placeholder="Вставьте секретный ключ"
          />
          {error ? <p id="admin-login-error" className="admin-login__error" role="alert">{error}</p> : null}
          <Button type="submit" variant="primary" disabled={!key.trim() || submitting}>
            {submitting ? 'Проверяем доступ…' : 'Войти в консоль'}
          </Button>
        </form>
        <p className="admin-login__security">После входа в sessionStorage хранится только короткоживущий JWT. Закрытие вкладки удалит сессию.</p>
      </section>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<AdminSession | null>(readSession);
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [overviewDays, setOverviewDays] = useState<7 | 30>(30);
  const [overview, setOverview] = useState<Resource<AdminOverview>>(emptyResource);
  const [users, setUsers] = useState<Resource<AdminUsersResponse>>(emptyResource);
  const [usersQuery, setUsersQuery] = useState<AdminUsersQuery>({ limit: 20, offset: 0 });
  const [analyses, setAnalyses] = useState<Resource<AdminAnalysesResponse>>(emptyResource);
  const [analysesQuery, setAnalysesQuery] = useState<AdminAnalysesQuery>({ limit: 20, offset: 0 });
  const [reviews, setReviews] = useState<Resource<AdminReviewsResponse>>(emptyResource);
  const [reviewsQuery, setReviewsQuery] = useState<AdminReviewsQuery>({ limit: 20, offset: 0 });
  const [meta, setMeta] = useState<Resource<AdminMeta>>(emptyResource);
  const [metaRank, setMetaRank] = useState<RankBracket | null>(null);
  const [system, setSystem] = useState<Resource<AdminSystem>>(emptyResource);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const requestCounter = useRef(0);
  const latestRequests = useRef(new Map<object, number>());

  const logout = useCallback(() => {
    clearSession();
    latestRequests.current.clear();
    setSession(null);
    setOverview(emptyResource());
    setUsers(emptyResource());
    setAnalyses(emptyResource());
    setReviews(emptyResource());
    setMeta(emptyResource());
    setSystem(emptyResource());
  }, []);

  const notify = useCallback((message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToastMessage(message);
    setToastVisible(true);
    toastTimer.current = window.setTimeout(() => setToastVisible(false), 3_000);
  }, []);

  const runAuthenticatedMutation = useCallback(async <T,>(request: Promise<T>) => {
    try {
      return await request;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) logout();
      throw requestError;
    }
  }, [logout]);

  const load = useCallback(async <T,>(
    setter: React.Dispatch<React.SetStateAction<Resource<T>>>,
    request: Promise<T>,
  ) => {
    const requestId = ++requestCounter.current;
    latestRequests.current.set(setter, requestId);
    setter((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await request;
      if (latestRequests.current.get(setter) !== requestId) return;
      setter({ data, loading: false, error: null });
    } catch (requestError) {
      if (latestRequests.current.get(setter) !== requestId) return;
      if (requestError instanceof ApiError && requestError.status === 401) {
        logout();
        return;
      }
      const message = errorText(requestError);
      if (message) setter((current) => ({ ...current, loading: false, error: message }));
    }
  }, [logout]);

  const refreshOverview = useCallback((signal?: AbortSignal) => {
    if (!session) return Promise.resolve();
    return load(setOverview, adminApi.overview(session.token, overviewDays, signal));
  }, [load, overviewDays, session]);

  const refreshUsers = useCallback((signal?: AbortSignal) => {
    if (!session) return Promise.resolve();
    return load(setUsers, adminApi.users(session.token, usersQuery, signal));
  }, [load, session, usersQuery]);

  const refreshAnalyses = useCallback((signal?: AbortSignal) => {
    if (!session) return Promise.resolve();
    return load(setAnalyses, adminApi.analyses(session.token, analysesQuery, signal));
  }, [analysesQuery, load, session]);

  const refreshReviews = useCallback((signal?: AbortSignal) => {
    if (!session) return Promise.resolve();
    return load(setReviews, adminApi.reviews(session.token, reviewsQuery, signal));
  }, [load, reviewsQuery, session]);

  const refreshMeta = useCallback((signal?: AbortSignal) => {
    if (!session) return Promise.resolve();
    return load(setMeta, adminApi.meta(session.token, metaRank, signal));
  }, [load, metaRank, session]);

  const refreshSystem = useCallback((signal?: AbortSignal) => {
    if (!session) return Promise.resolve();
    return load(setSystem, adminApi.system(session.token, signal));
  }, [load, session]);

  const updateUsersQuery = useCallback((next: AdminUsersQuery) => {
    setUsersQuery((current) => sameQuery(current, next) ? current : next);
  }, []);

  const updateAnalysesQuery = useCallback((next: AdminAnalysesQuery) => {
    setAnalysesQuery((current) => sameQuery(current, next) ? current : next);
  }, []);

  const updateReviewsQuery = useCallback((next: AdminReviewsQuery) => {
    setReviewsQuery((current) => sameQuery(current, next) ? current : next);
  }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void refreshOverview(controller.signal);
    return () => controller.abort();
  }, [refreshOverview, session]);

  useEffect(() => {
    if (!session || page !== 'users') return;
    const controller = new AbortController();
    void refreshUsers(controller.signal);
    return () => controller.abort();
  }, [page, refreshUsers, session]);

  useEffect(() => {
    if (!session || page !== 'analyses') return;
    const controller = new AbortController();
    void refreshAnalyses(controller.signal);
    return () => controller.abort();
  }, [page, refreshAnalyses, session]);

  useEffect(() => {
    if (!session || page !== 'reviews') return;
    const controller = new AbortController();
    void refreshReviews(controller.signal);
    return () => controller.abort();
  }, [page, refreshReviews, session]);

  useEffect(() => {
    if (!session || page !== 'meta') return;
    const controller = new AbortController();
    void refreshMeta(controller.signal);
    return () => controller.abort();
  }, [page, refreshMeta, session]);

  useEffect(() => {
    if (!session || page !== 'system') return;
    const controller = new AbortController();
    void refreshSystem(controller.signal);
    return () => controller.abort();
  }, [page, refreshSystem, session]);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('keydown', onKeyDown);
    if (!window.location.hash) window.history.replaceState(null, '', '#/overview');
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('keydown', onKeyDown);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  if (!session) return <LoginScreen onAuthenticated={setSession} />;

  const navigate = (nextPage: PageId) => {
    window.location.hash = `/${nextPage}`;
    setPage(nextPage);
    setSidebarOpen(false);
  };

  const refreshCurrent = () => {
    if (page === 'overview') void refreshOverview();
    if (page === 'users') void refreshUsers();
    if (page === 'analyses') void refreshAnalyses();
    if (page === 'reviews') void refreshReviews();
    if (page === 'meta') void refreshMeta();
    if (page === 'system') void refreshSystem();
  };

  const currentLoading = page === 'overview'
    ? overview.loading
    : page === 'users'
      ? users.loading
      : page === 'analyses'
        ? analyses.loading
        : page === 'reviews'
          ? reviews.loading
          : page === 'meta'
            ? meta.loading
            : system.loading;

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
          <IconButton label="Закрыть меню" className="sidebar__close" onClick={() => setSidebarOpen(false)}><X size={19} /></IconButton>
        </div>
        <div className="workspace-switcher">
          <span><Server size={16} /></span>
          <div><strong>Серверные данные</strong><small>Same-origin API</small></div>
        </div>
        <nav className="sidebar-nav" aria-label="Основная навигация">
          <span className="sidebar-nav__label">Управление</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.id} className={page === item.id ? 'is-active' : ''} onClick={() => navigate(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === 'analyses' && overview.data?.totals.processing ? <b>{overview.data.totals.processing}</b> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note sidebar-note--live">
          <span>Данные из API</span>
          <p>Показатели, фильтры и страницы загружаются из защищённых серверных контрактов.</p>
        </div>
        <div className="sidebar-profile">
          <UserAvatar name="Admin" size="sm" />
          <div><strong>Администратор</strong><small>JWT до {new Date(session.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></div>
          <IconButton label="Выйти" onClick={logout}><LogOut size={16} /></IconButton>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <IconButton label="Открыть меню" className="topbar__menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></IconButton>
          <div className="production-context"><i /><span>Live API</span></div>
          <div className="topbar__right">
            <span className="environment-pill"><i />Защищённая сессия</span>
            <Button size="sm" icon={<RefreshCw className={currentLoading ? 'button-spinner' : ''} size={15} />} onClick={refreshCurrent} disabled={currentLoading}>
              Обновить
            </Button>
          </div>
        </header>
        <div className="page-container">
          {page === 'overview' ? <OverviewPage resource={overview} days={overviewDays} onDaysChange={setOverviewDays} onRetry={() => void refreshOverview()} /> : null}
          {page === 'users' ? (
            <UsersPage
              resource={users}
              initialQuery={usersQuery}
              onRetry={() => void refreshUsers()}
              onQueryChange={updateUsersQuery}
              onGrantProAll={async () => {
                const result = await runAuthenticatedMutation(adminApi.grantProAll(session.token));
                notify(result.alreadyApplied
                  ? `Pro уже был выдан всем: ${result.totalAccounts} аккаунтов`
                  : `Pro выдан: ${result.grantedAccounts} аккаунтов, квота ${result.quotaBalance}`);
                await Promise.all([refreshUsers(), refreshOverview()]);
              }}
            />
          ) : null}
          {page === 'analyses' ? <AnalysesPage resource={analyses} initialQuery={analysesQuery} onRetry={() => void refreshAnalyses()} onQueryChange={updateAnalysesQuery} /> : null}
          {page === 'reviews' ? (
            <ReviewsPage
              resource={reviews}
              initialQuery={reviewsQuery}
              onRetry={() => void refreshReviews()}
              onQueryChange={updateReviewsQuery}
              onDelete={async (reviewId) => {
                await runAuthenticatedMutation(adminApi.deleteReview(session.token, reviewId));
                notify('Отзыв удалён из базы');
                await Promise.all([refreshReviews(), refreshOverview()]);
              }}
            />
          ) : null}
          {page === 'meta' ? <MetaPage resource={meta} rank={metaRank} onRankChange={setMetaRank} onRetry={() => void refreshMeta()} /> : null}
          {page === 'system' ? <SystemPage resource={system} onRetry={() => void refreshSystem()} /> : null}
        </div>
      </main>
      <Toast message={toastMessage} visible={toastVisible} />
    </div>
  );
}

export type PageResource<T> = Resource<T>;
