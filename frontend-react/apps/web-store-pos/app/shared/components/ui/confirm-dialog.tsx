import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmIntent?: 'delete' | 'warning';
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  confirmIntent = 'delete',
}: ConfirmDialogProps) {
  const intl = useIntl();
  const dialogRef = useRef<HTMLDivElement>(null);

  useClickOutside(dialogRef, () => {
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

  const intentStyles =
    confirmIntent === 'delete'
      ? 'bg-danger text-white hover:bg-danger/90'
      : 'bg-warning text-white hover:bg-warning/90';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div ref={dialogRef} className="bg-surface rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold mb-2">
          {title}
        </h2>
        {description && <p className="text-sm text-text-muted mb-6">{description}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${intentStyles}`}
          >
            {confirmLabel ?? intl.formatMessage({ id: 'GENERAL.CONFIRM' })}
          </button>
        </div>
      </div>
    </div>
  );
}
