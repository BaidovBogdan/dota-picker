import type { PropsWithChildren } from 'react';

export function StickyFilterBar({
  children,
  className = '',
  label,
}: PropsWithChildren<{
  className?: string;
  label: string;
}>) {
  return (
    <section className={`sticky-filter-bar ${className}`} aria-label={label}>
      {children}
    </section>
  );
}
