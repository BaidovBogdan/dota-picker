import type { PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';

export function ModalPortal({ children }: PropsWithChildren) {
  return createPortal(children, document.body);
}
