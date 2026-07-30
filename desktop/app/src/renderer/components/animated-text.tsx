import gsap from 'gsap';
import { useLayoutEffect, useRef } from 'react';

const prefersReducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function AnimatedText({
  text,
  className = '',
  reserveLines,
  live = 'off',
}: {
  text: string;
  className?: string;
  reserveLines?: number;
  live?: 'off' | 'polite';
}) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const initialTextRef = useRef(text);
  const displayedTextRef = useRef(text);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || displayedTextRef.current === text) return;

    gsap.killTweensOf(element);

    if (prefersReducedMotion()) {
      element.textContent = text;
      displayedTextRef.current = text;
      gsap.set(element, { clearProps: 'transform,opacity,visibility' });
      return;
    }

    const transition = gsap.timeline();
    transition
      .to(element, {
        autoAlpha: 0,
        y: -5,
        duration: 0.14,
        ease: 'power2.in',
      })
      .call(() => {
        element.textContent = text;
        displayedTextRef.current = text;
      })
      .fromTo(
        element,
        { autoAlpha: 0, y: 6 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.24,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility',
        },
      );

    return () => {
      transition.kill();
      gsap.set(element, { clearProps: 'transform,opacity,visibility' });
    };
  }, [text]);

  return (
    <span
      ref={elementRef}
      className={`animated-text ${className}`.trim()}
      style={
        reserveLines
          ? {
              display: 'block',
              minBlockSize: `${reserveLines}lh`,
            }
          : undefined
      }
      aria-live={live}
    >
      {initialTextRef.current}
    </span>
  );
}
