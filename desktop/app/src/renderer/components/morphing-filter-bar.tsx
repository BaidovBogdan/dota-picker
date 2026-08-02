import { CaretDownIcon, FunnelSimpleIcon } from '@phosphor-icons/react';
import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

const STICKY_OFFSET = 12;

export function MorphingFilterBar({
  children,
  className = '',
  compactContent,
  compactLabel,
  label,
}: PropsWithChildren<{
  className?: string;
  compactContent: ReactNode;
  compactLabel: string;
  label: string;
}>) {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = `filter-dock-${useId().replace(/:/g, '')}`;
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollRoot = sentinel?.closest<HTMLElement>('.desktop-shell__content');
    if (!sentinel || !scrollRoot) return;

    const apply = (next: boolean) => {
      setStuck((current) => current === next ? current : next);
      if (!next) setOpen(false);
    };
    const rootTop = scrollRoot.getBoundingClientRect().top + STICKY_OFFSET;
    apply(sentinel.getBoundingClientRect().bottom <= rootTop);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const threshold = entry.rootBounds?.top ?? rootTop;
        apply(entry.boundingClientRect.bottom <= threshold);
      },
      {
        root: scrollRoot,
        rootMargin: `-${STICKY_OFFSET}px 0px 0px`,
        threshold: [0, 1],
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <>
      <div className="filter-dock-layer" data-stuck={stuck}>
        <div className="filter-dock" data-open={open}>
          <button
            ref={toggleRef}
            className="filter-dock__toggle"
            type="button"
            aria-controls={panelId}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="filter-dock__mark" aria-hidden>
              <FunnelSimpleIcon size={17} weight="duotone" />
            </span>
            <span className="filter-dock__label">{compactLabel}</span>
            <span className="filter-dock__summary">{compactContent}</span>
            <CaretDownIcon className="filter-dock__caret" size={15} weight="bold" aria-hidden />
          </button>
          {stuck && open ? (
            <div
              className="filter-dock__panel"
              id={panelId}
              role="region"
              aria-label={label}
            >
              <div className={`filter-dock__controls ${className}`}>
                {children}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <span className="morphing-filter-sentinel" ref={sentinelRef} aria-hidden />
      <section
        className={`morphing-filter-bar ${className}`}
        aria-hidden={stuck}
        aria-label={label}
        data-stuck={stuck}
        inert={stuck ? true : undefined}
      >
        {children}
      </section>
    </>
  );
}
