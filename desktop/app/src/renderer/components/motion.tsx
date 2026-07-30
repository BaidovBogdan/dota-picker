import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { PropsWithChildren } from 'react';
import { useRef } from 'react';

const reduceMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function PageReveal({ children }: PropsWithChildren) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ref.current || reduceMotion()) return;
      gsap.fromTo(
        ref.current.querySelectorAll('[data-reveal]'),
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.62,
          stagger: 0.055,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility',
        },
      );
    },
    { scope: ref },
  );

  return <div ref={ref}>{children}</div>;
}

export function ImageReveal({
  children,
  className = '',
}: PropsWithChildren<{ className?: string }>) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ref.current || reduceMotion()) return;
      gsap.fromTo(
        ref.current,
        { autoAlpha: 0, scale: 1.06 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.8,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility',
        },
      );
    },
    { scope: ref },
  );

  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}

export function StatusScrub({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!ref.current || reduceMotion()) return;
      gsap.fromTo(
        ref.current,
        { clipPath: 'inset(0 100% 0 0)' },
        {
          clipPath: 'inset(0 0% 0 0)',
          duration: 0.7,
          ease: 'power2.out',
        },
      );
    },
    { dependencies: [text], scope: ref },
  );

  return <span ref={ref}>{text}</span>;
}
