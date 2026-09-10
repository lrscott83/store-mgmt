import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';

interface CreateStoreModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (values: { name: string }) => void;
  isLoading?: boolean;
  error?: string;
}

/**
 * "Nueva tienda" modal of the owner's my-stores view (owner-multistores
 * store-creation): creates a store for the CURRENT owner only, name-only form
 * (user decision: name-only). The backend derives the owner from the session and
 * inherits the selected store's modules; no module/owner controls here.
 * Name validation mirrors StoreForm's (required, STORES.NAME_REQUIRED); the
 * owner-branch contract keeps the body ownerId as the zero-Guid (server-derived).
 */
export function CreateStoreModal({
  open,
  onClose,
  onSave,
  isLoading = false,
  error,
}: CreateStoreModalProps) {
  const intl = useIntl();
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setValidationError('');
    }
  }, [open]);

  if (!open) return null;

  function handleSubmit() {
    if (!name.trim()) {
      setValidationError(intl.formatMessage({ id: 'STORES.NAME_REQUIRED' }));
      return;
    }
    onSave({ name: name.trim() });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="owner-store-create-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {intl.formatMessage({ id: 'STORES.CREATE_TITLE' })}
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
              data-testid="owner-store-name-input"
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {validationError && <p className="mt-1 text-xs text-danger">{validationError}</p>}
          </div>
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
            data-testid="owner-store-create-save"
          >
            <SaveIcon />
            {intl.formatMessage({ id: isLoading ? 'STORES.SAVING' : 'STORES.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CreateStoreModal;