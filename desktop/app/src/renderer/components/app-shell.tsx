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
import { useI18n } from '../i18n';
import { useAppStore } from '../store';
import { BrandMark } from './brand-mark';
import { AppUpdate } from './app-update';
import { WindowControls } from './window-controls';

export function AppShell() {
  const { language, text } = useI18n();
  const account = useAppStore((state) => state.account);
  const enginePhase = useAppStore((state) => state.engine?.phase ?? 'off');
  const engineStatus = phaseCopy(enginePhase, language).title;
  const navigation = [
    { to: '/', label: text('Главная', 'Home'), icon: CrosshairSimpleIcon, end: true },
    { to: '/history', label: text('История', 'History'), icon: ClockCounterClockwiseIcon },
    { to: '/meta', label: text('Мета', 'Meta'), icon: ChartLineUpIcon },
    { to: '/wishlist', label: text('Избранное', 'Favorites'), icon: StarIcon },
    { to: '/reviews', label: text('Отзывы', 'Reviews'), icon: ChatCircleTextIcon },
  ];

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
        {text('Перейти к содержимому', 'Skip to content')}
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
        <nav className="sidebar__nav" aria-label={text('Основная навигация', 'Main navigation')}>
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
          <AppUpdate />
          <NavLink
            to="/settings"
            aria-label={text('Настройки', 'Settings')}
            title={text('Настройки', 'Settings')}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
          >
            <span className="nav-item__icon" aria-hidden>
              <SlidersHorizontalIcon size={20} weight="duotone" />
            </span>
            <span className="nav-item__label">{text('Настройки', 'Settings')}</span>
            <span className="nav-item__trail" aria-hidden />
          </NavLink>
          <NavLink
            to="/profile"
            aria-label={text('Профиль', 'Profile')}
            title={text('Профиль', 'Profile')}
            className={({ isActive }) =>
              `account-link ${isActive ? 'account-link--active' : ''}`
            }
          >
            <span className="account-link__avatar">
              <UserFocusIcon size={20} weight="duotone" aria-hidden />
            </span>
            <span className="account-link__copy">
              <strong>{account?.email?.split('@')[0] ?? text('Профиль', 'Profile')}</strong>
              <small>
                {account?.quota.plan === 'pro' ? 'PRO' : 'FREE'}
                <span aria-hidden> / </span>
                {account?.quota.remaining ?? 0} {text('из', 'of')} {account?.quota.limit ?? 0}
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
