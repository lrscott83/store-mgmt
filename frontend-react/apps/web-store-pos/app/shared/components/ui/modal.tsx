import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { CloseIcon } from '~/shared/components/ui/icons';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional test id on the dialog root (overlay). */
  testId?: string;
}

/**
 * Generic mobile-friendly dialog — same established pattern as `help-dialog.tsx`
 * (fixed overlay, `role="dialog"`, `aria-modal`, Escape + click-outside close),
 * but content-agnostic and with a scrollable body. On mobile it renders as a
 * full-screen sheet; from `sm` up it becomes a centered card capped at 85vh.
 */
export function Modal({ open, onClose, title, children, testId }: ModalProps) {
  const intl = useIntl();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useClickOutside(panelRef, () => {
    if (open) onClose();
  });

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
    >
      <div
        ref={panelRef}
        className="flex h-full w-full flex-col bg-surface shadow-xl sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            className="rounded p-1 text-text-muted hover:bg-surface-hover"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover"
          >
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </button>
        </div>
      </div>
    </div>
  );
}
