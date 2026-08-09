import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter((element) => !element.hasAttribute('hidden'));
}

export function useDialogAccessibility(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusSelector?: string,
) {
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const restoreFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backdrop = dialog.closest<HTMLElement>('.modal-backdrop');
    const hiddenSiblings = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
    let branch: HTMLElement | null = backdrop;
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        hiddenSiblings.set(sibling, {
          inert: sibling.hasAttribute('inert'),
          ariaHidden: sibling.getAttribute('aria-hidden'),
        });
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = branch.parentElement;
    }
    const frame = requestAnimationFrame(() => {
      const initialFocus = initialFocusSelector
        ? dialog.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      (initialFocus ?? focusableElements(dialog)[0] ?? dialog).focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      for (const [element, previous] of hiddenSiblings) {
        if (!previous.inert) element.removeAttribute('inert');
        if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', previous.ariaHidden);
      }
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, [dialogRef, initialFocusSelector, open]);
}

export function handleDialogKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  pending: boolean,
  close: () => void,
) {
  if (event.key === 'Escape' && !pending) {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableElements(event.currentTarget);
  if (focusable.length === 0) {
    event.preventDefault();
    event.currentTarget.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
