import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CaretRightIcon,
  CheckIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from 'react';
import { Link } from 'react-router';

import { heroName } from '../format';
import { useI18n } from '../i18n';
import type { Hero } from '../types';
import { BrandMark } from './brand-mark';
import { PageReveal } from './motion';

export function Page({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = '',
}: PropsWithChildren<{
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <PageReveal>
      <main className={`page ${className}`} id="main-content">
        <header className="page-header" data-reveal>
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            {description ? <p className="page-description">{description}</p> : null}
          </div>
          {actions ? <div className="page-actions">{actions}</div> : null}
        </header>
        {children}
      </main>
    </PageReveal>
  );
}

export function Button({
  className = '',
  variant = 'primary',
  loading,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  loading?: boolean;
}) {
  return (
    <button
      className={`button button--${variant} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <CircleNotchIcon className="spin" size={17} weight="bold" aria-hidden /> : null}
      <span>{children}</span>
    </button>
  );
}

export function TextLink({
  to,
  children,
  className = '',
}: PropsWithChildren<{ to: string; className?: string }>) {
  return (
    <Link className={`text-link ${className}`} to={to}>
      <span>{children}</span>
      <ArrowRightIcon size={15} aria-hidden />
    </Link>
  );
}

export function Panel({
  children,
  className = '',
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`panel ${className}`} {...props}>
      {children}
    </section>
  );
}

type HeroMediaProps = {
  hero: Hero | null | undefined;
  className?: string;
  eager?: boolean;
};

function HeroMedia({
  hero,
  source,
  variant,
  className = '',
  eager = false,
}: HeroMediaProps & {
  source: 'icon' | 'artwork';
  variant: string;
}) {
  const { language } = useI18n();
  const src =
    source === 'icon'
      ? hero?.iconUrl || hero?.imageUrl
      : hero?.imageUrl || hero?.iconUrl;
  const fallbackSrc =
    source === 'icon'
      ? hero?.imageUrl
      : hero?.iconUrl;

  return (
    <div className={`hero-media ${variant} ${className}`}>
      <span aria-hidden>{heroName(hero, language).slice(0, 1).toUpperCase()}</span>
      {src ? (
        <img
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={(event) => {
            if (
              fallbackSrc &&
              fallbackSrc !== src &&
              event.currentTarget.dataset.fallbackTried !== 'true'
            ) {
              event.currentTarget.dataset.fallbackTried = 'true';
              event.currentTarget.src = fallbackSrc;
              return;
            }

            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </div>
  );
}

export function HeroIcon(props: HeroMediaProps) {
  return <HeroMedia {...props} source="icon" variant="hero-icon" />;
}

export function HeroArtwork(props: HeroMediaProps) {
  return <HeroMedia {...props} source="artwork" variant="hero-artwork" />;
}

export function AsyncState({
  status,
  title,
  description,
  onRetry,
}: {
  status: 'loading' | 'error' | 'empty';
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const { text } = useI18n();
  const content = {
    loading: {
      icon: (
        <span className="async-state__loader">
          <span className="async-state__loader-orbit" />
          <BrandMark />
        </span>
      ),
      title: title ?? text('Загружаем данные', 'Loading data'),
      description: description ?? text('Это займёт всего несколько секунд.', 'This will only take a few seconds.'),
    },
    error: {
      icon: <WarningCircleIcon size={24} weight="duotone" />,
      title: title ?? text('Не удалось загрузить данные', 'Could not load data'),
      description: description ?? text('Проверьте подключение и попробуйте ещё раз.', 'Check your connection and try again.'),
    },
    empty: {
      icon: <CheckIcon size={24} weight="bold" />,
      title: title ?? text('Здесь пока пусто', 'Nothing here yet'),
      description: description ?? text('Новые данные появятся после первой попытки.', 'New data will appear after your first attempt.'),
    },
  }[status];

  return (
    <div className={`async-state async-state--${status}`} role={status === 'error' ? 'alert' : 'status'}>
      <span className={`async-state__icon ${status === 'loading' ? 'async-state__icon--loading' : ''}`} aria-hidden>
        {content.icon}
      </span>
      <strong>{content.title}</strong>
      <p>{content.description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <ArrowClockwiseIcon size={16} aria-hidden />
          {text('Повторить', 'Try again')}
        </Button>
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  helper,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'teal' | 'warning' | 'danger' | 'success' }>) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function ListLink({
  to,
  title,
  description,
  prefix,
  suffix,
}: {
  to: string;
  title: string;
  description?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  return (
    <Link className="list-link" to={to}>
      {prefix ? <span className="list-link__prefix">{prefix}</span> : null}
      <span className="list-link__body">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {suffix ?? <CaretRightIcon size={18} aria-hidden />}
    </Link>
  );
}

export function InputField({
  label,
  error,
  hint,
  children,
}: PropsWithChildren<{ label: string; error?: string; hint?: string }>) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function SafeImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} draggable={false} />;
}
