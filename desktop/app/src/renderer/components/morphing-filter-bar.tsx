import type { PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';

export function MorphingFilterBar({
  children,
  className = '',
  label,
}: PropsWithChildren<{
  className?: string;
  label: string;
}>) {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const sentinel = sentinelRef.current;
    const scrollRoot = bar?.closest<HTMLElement>('.desktop-shell__content');
    if (!bar || !sentinel || !scrollRoot) return;

    let frame = 0;
    let lastScrollTop = scrollRoot.scrollTop;
    let compact = false;

    const update = () => {
      frame = 0;
      const currentScrollTop = scrollRoot.scrollTop;
      const delta = currentScrollTop - lastScrollTop;
      const rootTop = scrollRoot.getBoundingClientRect().top;
      const pinned = sentinel.getBoundingClientRect().top <= rootTop + 12;

      if (!pinned) compact = false;
      else if (delta > 3) compact = true;
      else if (delta < -3) compact = false;

      bar.dataset.pinned = String(pinned);
      bar.dataset.compact = String(pinned && compact);
      lastScrollTop = currentScrollTop;
    };

    const handleScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    scrollRoot.addEventListener('scroll', handleScroll, { passive: true });
    globalThis.addEventListener('resize', handleScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scrollRoot.removeEventListener('scroll', handleScroll);
      globalThis.removeEventListener('resize', handleScroll);
    };
  }, []);

  return (
    <>
      <span className="morphing-filter-sentinel" ref={sentinelRef} aria-hidden />
      <section
        ref={barRef}
        className={`morphing-filter-bar ${className}`}
        aria-label={label}
        data-pinned="false"
        data-compact="false"
      >
        {children}
      </section>
    </>
  );
}
