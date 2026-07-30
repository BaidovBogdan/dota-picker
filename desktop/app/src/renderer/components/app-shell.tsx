import {
  ChartLineUpIcon,
  ChatCircleTextIcon,
  ClockCounterClockwiseIcon,
  CrosshairSimpleIcon,
  SlidersHorizontalIcon,
  StarIcon,
  UserFocusIcon,
} from '@phosphor-icons/react';
import { NavLink, Outlet } from 'react-router';

import { phaseCopy } from '../format';
import { useAppStore } from '../store';
import { BrandMark } from './brand-mark';
import { WindowControls } from './window-controls';

const navigation = [
  { to: '/', label: 'Главная', icon: CrosshairSimpleIcon, end: true },
  { to: '/history', label: 'История', icon: ClockCounterClockwiseIcon },
  { to: '/meta', label: 'Мета', icon: ChartLineUpIcon },
  { to: '/wishlist', label: 'Избранное', icon: StarIcon },
  { to: '/reviews', label: 'Отзывы', icon: ChatCircleTextIcon },
];

export function AppShell() {
  const account = useAppStore((state) => state.account);
  const enginePhase = useAppStore((state) => state.engine?.phase ?? 'off');
  const engineStatus = phaseCopy(enginePhase).title;

  return (
    <div className="desktop-shell">
      <button
        className="skip-link"
        type="button"
        onClick={() => {
          const target = document.getElementById('main-content');
          if (!target) return;
          target.tabIndex = -1;
          target.focus();
        }}
      >
        Перейти к содержимому
      </button>
      <header className="titlebar">
        <div className="titlebar__drag">
          <div className="titlebar__identity">
            <BrandMark className="titlebar__mark" />
            <span className="titlebar__product">
              <strong>COUNTERPICK</strong>
            </span>
          </div>
          <span
            className={`titlebar__status titlebar__status--${enginePhase}`}
            title={engineStatus}
          >
            <span className="titlebar__status-signal" aria-hidden />
            <span>{engineStatus}</span>
          </span>
        </div>
        <WindowControls />
      </header>
      <aside className="sidebar">
        <nav className="sidebar__nav" aria-label="Основная навигация">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              title={label}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
            >
              <span className="nav-item__icon" aria-hidden>
                <Icon size={20} weight="duotone" />
              </span>
              <span className="nav-item__label">{label}</span>
              <span className="nav-item__trail" aria-hidden />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <NavLink
            to="/settings"
            aria-label="Настройки"
            title="Настройки"
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
          >
            <span className="nav-item__icon" aria-hidden>
              <SlidersHorizontalIcon size={20} weight="duotone" />
            </span>
            <span className="nav-item__label">Настройки</span>
            <span className="nav-item__trail" aria-hidden />
          </NavLink>
          <NavLink
            to="/profile"
            aria-label="Профиль"
            title="Профиль"
            className={({ isActive }) =>
              `account-link ${isActive ? 'account-link--active' : ''}`
            }
          >
            <span className="account-link__avatar">
              <UserFocusIcon size={20} weight="duotone" aria-hidden />
            </span>
            <span className="account-link__copy">
              <strong>{account?.email?.split('@')[0] ?? 'Профиль'}</strong>
              <small>
                {account?.quota.plan === 'pro' ? 'PRO' : 'FREE'}
                <span aria-hidden> / </span>
                {account?.quota.remaining ?? 0} из {account?.quota.limit ?? 0}
              </small>
            </span>
          </NavLink>
        </div>
      </aside>
      <div className="desktop-shell__content">
        <Outlet />
      </div>
    </div>
  );
}
