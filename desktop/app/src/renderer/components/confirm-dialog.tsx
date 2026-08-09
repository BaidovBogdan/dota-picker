import { WarningOctagonIcon } from '@phosphor-icons/react';
import { useId, useRef } from 'react';

import { handleDialogKeyDown, useDialogAccessibility } from './dialog-accessibility';
import { ModalPortal } from './modal-portal';
import { Button } from './ui';

export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  error,
  pending = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  error?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useDialogAccessibility(open, dialogRef, '[data-dialog-initial-focus]');

  if (!open) return null;

  const cancel = () => {
    if (!pending) onCancel();
  };

  const confirm = () => {
    if (!pending) onConfirm();
  };

  return (
    <ModalPortal>
      <div
        className="modal-backdrop confirm-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) cancel();
        }}
      >
        <section
          className="confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          ref={dialogRef}
          tabIndex={-1}
          onKeyDown={(event) => handleDialogKeyDown(event, pending, cancel)}
        >
          <span className="confirm-dialog__icon">
            <WarningOctagonIcon size={24} weight="duotone" aria-hidden />
          </span>
          <p className="confirm-dialog__eyebrow">Counterpick</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          {error ? <p className="confirm-dialog__error" role="alert">{error}</p> : null}
          <div className="confirm-dialog__actions">
            <Button
              variant="secondary"
              disabled={pending}
              data-dialog-initial-focus
              onClick={cancel}
            >
              {cancelLabel}
            </Button>
            <Button variant="danger" loading={pending} onClick={confirm}>
              {confirmLabel}
            </Button>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}
