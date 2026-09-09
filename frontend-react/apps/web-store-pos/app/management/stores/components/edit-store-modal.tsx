import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { OwnerStoreWithPlan } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';

interface EditStoreModalProps {
  open: boolean;
  store: OwnerStoreWithPlan | null;
  onClose: () => void;
  onSave: (values: { name: string; isActive: boolean }) => void;
  isLoading?: boolean;
  error?: string;
}

/**
 * "Editar" popup of the owner's my-stores card (owner-stores-cards plan): renames
 * the store and flips its isActive flag. Name validation mirrors StoreForm's
 * (required, STORES.NAME_REQUIRED); saving name/isActive rides the dedicated
 * activation endpoint for the flag and the general store update for the name.
 */
export function EditStoreModal({
  open,
  store,
  onClose,
  onSave,
  isLoading = false,
  error,
}: EditStoreModalProps) {
  const intl = useIntl();
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (open && store) {
      setName(store.name);
      setIsActive(store.isActive);
      setValidationError('');
    }
  }, [open, store]);

  if (!open || !store) return null;

  function handleSubmit() {
    if (!name.trim()) {
      setValidationError(intl.formatMessage({ id: 'STORES.NAME_REQUIRED' }));
      return;
    }
    onSave({ name: name.trim(), isActive });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={`owner-store-edit-modal-${store.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {intl.formatMessage({ id: 'STORES.EDIT_STORE_TITLE' })}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="owner-store-name-input"
              className="mb-1 block text-sm font-medium text-text"
            >
              {intl.formatMessage({ id: 'STORES.NAME' })}
            </label>
            <input
              id="owner-store-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid={`owner-store-name-input-${store.id}`}
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {validationError && <p className="mt-1 text-xs text-danger">{validationError}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
              data-testid={`owner-store-active-toggle-${store.id}`}
            />
            {intl.formatMessage({ id: 'STORES.IS_ACTIVE' })}
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
          <Button
            variant="fab"
            className="flex-1 justify-center"
            disabled={isLoading}
            onClick={handleSubmit}
            data-testid={`owner-store-save-${store.id}`}
          >
            <SaveIcon />
            {intl.formatMessage({ id: isLoading ? 'STORES.SAVING' : 'STORES.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EditStoreModal;
