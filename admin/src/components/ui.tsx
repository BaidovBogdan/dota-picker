import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      className={`icon-button ${className}`}
      type='button'
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <section className={`panel ${className}`} aria-label={ariaLabel}>
      {children}
    </section>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
  children: ReactNode;
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>{children}</span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <label className='search-input'>
      <Search size={17} aria-hidden='true' />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {value ? (
        <button
          type='button'
          onClick={() => onChange('')}
          aria-label='Очистить поиск'
        >
          <X size={15} />
        </button>
      ) : null}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex(option => option.value === value)
  );
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    const activeButton = buttonRefs.current[activeIndex];
    if (!root || !activeButton) return;

    const updateIndicator = () => {
      const nextIndicator = {
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
        ready: true,
      };
      setIndicator(current =>
        current.left === nextIndicator.left &&
        current.width === nextIndicator.width &&
        current.ready
          ? current
          : nextIndicator
      );
    };

    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(root);
    observer.observe(activeButton);
    return () => observer.disconnect();
  }, [activeIndex, options.length]);

  const focusOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    window.requestAnimationFrame(() => buttonRefs.current[index]?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') {
      focusOption(0);
      return;
    }
    if (event.key === 'End') {
      focusOption(options.length - 1);
      return;
    }
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    focusOption((activeIndex + direction + options.length) % options.length);
  };

  return (
    <div
      ref={rootRef}
      className='segmented'
      role='radiogroup'
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      <span
        className={`segmented__indicator ${indicator.ready ? 'is-ready' : ''}`}
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
        }}
        aria-hidden='true'
      />
      {options.map((option, index) => (
        <button
          ref={node => {
            buttonRefs.current[index] = node;
          }}
          type='button'
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
          role='radio'
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          key={option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type SelectOption<T extends string> = {
  value: T;
  label: string;
};

export function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  label,
  icon,
  className = '',
}: {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  label?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const typeaheadTimer = useRef<number | null>(null);
  const typeaheadQuery = useRef('');
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.value === value)
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (typeaheadTimer.current) window.clearTimeout(typeaheadTimer.current);
    },
    []
  );

  const openMenu = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setActiveIndex(index);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(
        current => (current + direction + options.length) % options.length
      );
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) selectOption(activeIndex);
      else openMenu();
      return;
    }
    if (
      event.key.length !== 1 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;

    const query = `${typeaheadQuery.current}${event.key.toLocaleLowerCase()}`;
    const matchIndex = options.findIndex(option =>
      option.label.toLocaleLowerCase().startsWith(query)
    );
    typeaheadQuery.current =
      matchIndex === -1 ? event.key.toLocaleLowerCase() : query;
    const resolvedIndex =
      matchIndex === -1
        ? options.findIndex(option =>
            option.label.toLocaleLowerCase().startsWith(typeaheadQuery.current)
          )
        : matchIndex;
    if (resolvedIndex === -1) return;
    event.preventDefault();
    setActiveIndex(resolvedIndex);
    if (!open) selectOption(resolvedIndex);
    if (typeaheadTimer.current) window.clearTimeout(typeaheadTimer.current);
    typeaheadTimer.current = window.setTimeout(() => {
      typeaheadQuery.current = '';
      typeaheadTimer.current = null;
    }, 500);
  };

  return (
    <div
      ref={rootRef}
      className={`custom-select ${open ? 'is-open' : ''} ${className}`}
    >
      <button
        ref={triggerRef}
        type='button'
        className='custom-select__trigger'
        role='combobox'
        aria-label={ariaLabel}
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={handleKeyDown}
      >
        {icon ? <span className='custom-select__icon'>{icon}</span> : null}
        {label ? <span className='custom-select__label'>{label}</span> : null}
        <span className='custom-select__value'>{selectedOption?.label}</span>
        <ChevronDown
          className='custom-select__chevron'
          size={14}
          aria-hidden='true'
        />
      </button>
      <div
        id={listboxId}
        className='custom-select__menu'
        role='listbox'
        aria-label={ariaLabel}
      >
        {options.map((option, index) => (
          <button
            id={`${listboxId}-${index}`}
            type='button'
            role='option'
            aria-selected={option.value === value}
            className={index === activeIndex ? 'is-active' : ''}
            tabIndex={-1}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={event => event.preventDefault()}
            onClick={() => selectOption(index)}
            key={option.value}
          >
            <span>{option.label}</span>
            {option.value === value ? (
              <Check size={14} aria-hidden='true' />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChartTooltip({
  title,
  value,
  detail,
  className = '',
  style,
}: {
  title: string;
  value: string;
  detail?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`chart-tooltip ${className}`}
      style={style}
      aria-hidden='true'
    >
      <span>{title}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </span>
  );
}

export function UserAvatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
  const hue =
    [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span
      className={`user-avatar user-avatar--${size}`}
      style={{ '--avatar-hue': hue } as React.CSSProperties}
      aria-hidden='true'
    >
      {initials}
    </span>
  );
}

const dialogFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const activeDialogLayers: HTMLElement[] = [];

function useDialogFocus<T extends HTMLElement>(
  open: boolean,
  onClose: () => void
) {
  const containerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;
    activeDialogLayers.push(container);

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const inertEntries: Array<{ element: HTMLElement; previous: boolean }> = [];
    let branch: HTMLElement = container;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      Array.from(parent.children).forEach(element => {
        if (element instanceof HTMLElement && element !== branch) {
          inertEntries.push({ element, previous: element.inert });
          element.inert = true;
        }
      });
      if (parent === document.body) break;
      branch = parent;
    }

    const focusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(dialogFocusableSelector)
      ).filter(element => element.getClientRects().length > 0);
    const focusTimer = window.setTimeout(() => {
      if (!container.isConnected) return;
      const first = focusable()[0];
      if (first) first.focus();
      else {
        container.tabIndex = -1;
        container.focus();
      }
    }, 0);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (activeDialogLayers.at(-1) !== container) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements.at(-1) ?? first;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !container.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      const layerIndex = activeDialogLayers.lastIndexOf(container);
      if (layerIndex >= 0) activeDialogLayers.splice(layerIndex, 1);
      inertEntries.forEach(({ element, previous }) => {
        element.inert = previous;
      });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  return containerRef;
}

export function Drawer({
  open,
  title,
  eyebrow,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const layerRef = useDialogFocus<HTMLDivElement>(open, onClose);
  return (
    <div ref={layerRef} className='drawer-layer' inert={!open}>
      <div
        className={`drawer-backdrop ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden='true'
      />
      <aside
        className={`drawer ${open ? 'is-open' : ''}`}
        role='dialog'
        aria-modal='true'
        aria-hidden={!open}
        aria-label={title}
      >
        <header className='drawer__header'>
          <div>
            {eyebrow ? <span className='eyebrow'>{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <IconButton label='Закрыть' onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        <div className='drawer__body'>{children}</div>
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const layerRef = useDialogFocus<HTMLDivElement>(open, onCancel);
  if (!open) return null;
  return (
    <div
      ref={layerRef}
      className='modal-backdrop'
      role='presentation'
      onMouseDown={onCancel}
    >
      <div
        className='confirm-dialog'
        role='alertdialog'
        aria-modal='true'
        aria-labelledby={titleId}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className='confirm-dialog__icon'>
          <AlertTriangle size={21} />
        </div>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className='confirm-dialog__actions'>
          <Button onClick={onCancel}>Отмена</Button>
          <Button variant='danger' onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Toast({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  return (
    <div
      className={`toast ${visible ? 'is-visible' : ''}`}
      role='status'
      aria-live='polite'
    >
      <span>
        <Check size={15} />
      </span>
      {message}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className='empty-state'>
      <div className='empty-state__mark'>
        <Search size={21} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function TableRowButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <IconButton label={label} onClick={onClick} className='table-row-button'>
      <ChevronRight size={17} />
    </IconButton>
  );
}
