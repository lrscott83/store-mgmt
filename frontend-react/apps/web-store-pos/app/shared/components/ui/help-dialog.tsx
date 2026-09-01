import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export function HelpDialog({ open, onClose, title, content }: HelpDialogProps) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
    >
      <div ref={dialogRef} className="bg-surface rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
        <h2 id="help-dialog-title" className="text-lg font-semibold mb-3">
          {title}
        </h2>
        <p className="text-sm text-text-muted mb-6 leading-relaxed">{content}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors"
          >
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </button>
        </div>
      </div>
    </div>
  );
}
