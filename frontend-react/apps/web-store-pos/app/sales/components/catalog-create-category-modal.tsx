import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { SaveIcon } from '~/shared/components/ui/icons';
import { Modal } from '~/shared/components/ui/modal';
import type { CatalogCategoryCreate } from '../lib/services/catalog-http-service';

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

interface CatalogCreateCategoryModalProps {
  /** Alta real; true = creada y la lista ya se está recargando, así que el modal puede cerrarse. */
  onSave: (payload: CatalogCategoryCreate) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Alta de categoría desde la vista store-scoped del SuperAdmin: SOLO nombre y orden opcional.
 * La categoría se guarda en `ProductCategory` con el `StoreId` de la ruta; no hay tablas nuevas.
 *
 * El orden vacío NO se inventa en el cliente: el backend la pone al final. Un orden escrito debe
 * ser un entero no negativo, para no mandar una fracción que el backend rechazaría.
 */
export function CatalogCreateCategoryModal({ onSave, onClose }: CatalogCreateCategoryModalProps) {
  const intl = useIntl();
  const [name, setName] = useState('');
  const [order, setOrder] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(
        intl.formatMessage(
          { id: 'GENERAL.VALIDATION.REQUIRED' },
          { name: intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' }) },
        ),
      );
      return;
    }

    const trimmedOrder = order.trim();
    const parsedOrder = trimmedOrder === '' ? undefined : Number(trimmedOrder);
    if (parsedOrder !== undefined && (!Number.isInteger(parsedOrder) || parsedOrder < 0)) {
      setError(intl.formatMessage({ id: 'WEB_CATALOG.NEW_CATEGORY_ORDER_INVALID' }));
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const saved = await onSave(
        parsedOrder === undefined
          ? { name: trimmedName }
          : { name: trimmedName, order: parsedOrder },
      );
      if (saved) onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={intl.formatMessage({ id: 'WEB_CATALOG.NEW_CATEGORY' })}
      testId="catalog-new-category-modal"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="catalog-new-category-name"
          >
            {intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' })}
          </label>
          <input
            id="catalog-new-category-name"
            type="text"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT_CLASSES}
            data-testid="catalog-new-category-name"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium text-text-muted"
            htmlFor="catalog-new-category-order"
          >
            {intl.formatMessage({ id: 'GENERAL.ORDER' })}
          </label>
          <input
            id="catalog-new-category-order"
            type="number"
            min="0"
            step="1"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            className={INPUT_CLASSES}
            data-testid="catalog-new-category-order"
          />
          <p className="mt-1 text-xs text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.NEW_CATEGORY_ORDER_HINT' })}
          </p>
        </div>

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            variant="fab"
            type="submit"
            disabled={isSubmitting}
            data-testid="catalog-new-category-submit"
          >
            <SaveIcon />
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
