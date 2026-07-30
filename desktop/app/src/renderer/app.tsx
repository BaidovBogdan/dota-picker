import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react';
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router';

import { desktop } from './bridge';
import { AppShell } from './components/app-shell';
import { BrandMark } from './components/brand-mark';
import { AsyncState } from './components/ui';
import { WindowControls } from './components/window-controls';
import { useAppStore } from './store';

const AccountPage = lazy(() =>
  import('./pages/account').then((module) => ({ default: module.AccountPage })),
);
const AnalysisPage = lazy(() =>
  import('./pages/analysis').then((module) => ({ default: module.AnalysisPage })),
);
const AuthPage = lazy(() =>
  import('./pages/auth').then((module) => ({ default: module.AuthPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/dashboard').then((module) => ({ default: module.DashboardPage })),
);
const HeroPage = lazy(() =>
  import('./pages/hero').then((module) => ({ default: module.HeroPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/history').then((module) => ({ default: module.HistoryPage })),
);
const MetaPage = lazy(() =>
  import('./pages/meta').then((module) => ({ default: module.MetaPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/not-found').then((module) => ({ default: module.NotFoundPage })),
);
const ReviewsPage = lazy(() =>
  import('./pages/reviews').then((module) => ({ default: module.ReviewsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/settings').then((module) => ({ default: module.SettingsPage })),
);
const WishlistPage = lazy(() =>
  import('./pages/wishlist').then((module) => ({ default: module.WishlistPage })),
);

function Bootstrap() {
  const location = useLocation();
  const account = useAppStore((state) => state.account);
  const setAccount = useAppStore((state) => state.setAccount);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const setEngine = useAppStore((state) => state.setEngine);
  const selectedTheme = useAppStore((state) => state.preferences?.theme ?? 'system');

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: desktop.session.bootstrap,
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (sessionQuery.data) setAccount(sessionQuery.data.account);
  }, [sessionQuery.data, setAccount]);

  useEffect(() => {
    let active = true;
    void desktop.preferences.get().then((nextPreferences) => {
      if (!active) return;
      setPreferences(nextPreferences);
      useAppStore.getState().setWishlist(nextPreferences.wishlist);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [setPreferences]);

  useEffect(() => {
    if (!sessionQuery.data?.authenticated) return;
    void desktop.engine.getState().then(setEngine);
    return desktop.engine.subscribe(setEngine);
  }, [sessionQuery.data?.authenticated, setEngine]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      root.dataset.theme =
        selectedTheme === 'system' ? (media?.matches ? 'dark' : 'light') : selectedTheme;
    };
    applyTheme();
    if (selectedTheme !== 'system' || !media) return;
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [selectedTheme]);

  if (sessionQuery.isPending) {
    return (
      <BootstrapScreen>
        <AsyncState status="loading" title="Запускаем Counterpick" />
      </BootstrapScreen>
    );
  }

  if (sessionQuery.isError) {
    return (
      <BootstrapScreen>
        <AsyncState
          status="error"
          title="Не удалось запустить приложение"
          description="Backend на Render недоступен или нет подключения к сети."
          onRetry={() => void sessionQuery.refetch()}
        />
      </BootstrapScreen>
    );
  }

  if (!sessionQuery.data?.authenticated || !sessionQuery.data.account) {
    return location.pathname === '/auth' ? <AuthPage /> : <Navigate to="/auth" replace />;
  }

  if (location.pathname === '/auth') return <Navigate to="/" replace />;

  return <AppShell />;
}

function BootstrapScreen({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="auth-titlebar">
        <div className="auth-titlebar__brand">
          <BrandMark />
          <span>COUNTERPICK</span>
        </div>
        <WindowControls />
      </header>
      <div className="bootstrap-screen">{children}</div>
    </>
  );
}

function Router() {
  return (
    <Routes>
      <Route path="/auth" element={<Bootstrap />} />
      <Route element={<Bootstrap />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/result/:id" element={<AnalysisPage />} />
        <Route path="/meta" element={<MetaPage />} />
        <Route path="/hero/:id" element={<HeroPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/profile" element={<AccountPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <Suspense
        fallback={
          <BootstrapScreen>
            <AsyncState status="loading" title="Открываем экран" />
          </BootstrapScreen>
        }
      >
        <Router />
      </Suspense>
    </HashRouter>
  );
}
