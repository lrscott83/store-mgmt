import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Warehouse } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';

interface WarehouseFormModalProps {
  open: boolean;
  /** Present → edit mode (prefilled). Absent → create mode. */
  warehouse?: Warehouse;
  onClose: () => void;
  onSave: (name: string) => void;
}

/**
 * Warehouse create/edit dialog. Replaces the former inline input rows.
 * Model: expenses/components/expense-form-modal.tsx (role="dialog", backdrop
 * click closes, Escape closes). The domain service validates the name too —
 * the disabled Save is a best-effort UI guard, not the source of truth.
 */
export function WarehouseFormModal({ open, warehouse, onClose, onSave }: WarehouseFormModalProps) {
  const intl = useIntl();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(warehouse?.name ?? '');
  }, [open, warehouse]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const isValid = trimmed.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {warehouse
              ? intl.formatMessage({ id: 'WAREHOUSES.EDIT_WAREHOUSE' })
              : intl.formatMessage({ id: 'WAREHOUSES.NEW_WAREHOUSE' })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            <CloseIcon />
          </button>
        </div>

        <div>
          <label htmlFor="warehouse-form-name" className="mb-1 block text-sm font-medium text-text">
            {intl.formatMessage({ id: 'WAREHOUSES.NAME' })}
          </label>
          <input
            id="warehouse-form-name"
            data-testid="warehouse-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={intl.formatMessage({ id: 'WAREHOUSES.NAME_PLACEHOLDER' })}
            className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'WAREHOUSES.CANCEL' })}
          </Button>
          <Button variant="fab" className="flex-1 justify-center" disabled={!isValid} onClick={() => onSave(trimmed)}>
            <SaveIcon />
            {intl.formatMessage({ id: 'WAREHOUSES.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
