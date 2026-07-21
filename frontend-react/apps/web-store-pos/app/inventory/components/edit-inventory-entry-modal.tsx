import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, ProductSelectView } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { createProductService } from '~/sales/lib/services/product-service.factory';

export interface EditInventoryEntryInput {
  productId: string;
  quantity: number;
  costPrice: number;
}

interface EditInventoryEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditInventoryEntryInput, entryId?: string) => void;
  storeId: string;
  /** Pass an entry to edit; omit for create mode */
  entry?: InventoryEntry;
  error?: string;
}

export function EditInventoryEntryModal({
  isOpen,
  onClose,
  onSave,
  storeId,
  entry,
  error,
}: EditInventoryEntryModalProps) {
  const intl = useIntl();
  // Angular parity (Flag #4): the product dropdown is loaded via
  // createProductService(storeId).getProductsToSelect() (ProductSelectView = { id, fullName }),
  // exactly as Angular's EditInventoryEntryModalComponent does. Angular has NO category
  // field on this modal, so the React-only read-only "Category" display was dropped.
  const [products, setProducts] = useState<ProductSelectView[]>([]);

  const [productId, setProductId] = useState(entry?.productId ?? '');
  const [quantity, setQuantity] = useState(entry?.quantity.toString() ?? '');
  const [costPrice, setCostPrice] = useState(entry?.costPrice.toString() ?? '');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    createProductService(storeId).getProductsToSelect().then((result) => {
      if (!cancelled && result.succeeded) setProducts(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, storeId]);

  if (!isOpen) return null;

  function handleSave() {
    setValidationError('');
    const qty = parseInt(quantity, 10);
    const cost = parseFloat(costPrice);

    if (!productId) {
      // Angular parity: edit-inventory-entry-modal.component.html:26
      // GENERAL.VALIDATION.REQUIRED, interpolated with the field's own label.
      setValidationError(
        intl.formatMessage(
          { id: 'GENERAL.VALIDATION.REQUIRED' },
          { name: intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' }) },
        ),
      );
      return;
    }
    if (!quantity || isNaN(qty) || qty <= 0) {
      // Angular parity: edit-inventory-entry-modal.component.html:42
      // GENERAL.VALIDATION.NUMBER_GREADER_THAN_ONE (quantity's Validators.min(1)).
      setValidationError(
        intl.formatMessage(
          { id: 'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ONE' },
          { name: intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' }) },
        ),
      );
      return;
    }
    if (costPrice === '' || isNaN(cost) || cost < 0) {
      // Angular parity: edit-inventory-entry-modal.component.html:64
      // GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO (costPrice's Validators.min(0)).
      setValidationError(
        intl.formatMessage(
          { id: 'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO' },
          { name: intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' }) },
        ),
      );
      return;
    }

    onSave(
      { productId, quantity: qty, costPrice: cost },
      entry?.id,
    );
  }

  const inputClass =
    'w-full rounded border border-border px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary';
  const labelClass = 'mb-1 block text-sm font-medium text-text';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md">
        <Card
          title={
            <div className="flex items-center justify-between">
              {/* Angular parity: edit-inventory-entry-modal.component.html:4 toggles between
                  NEW_INVENTORY_ENTRY and EDIT_INVENTORY_ENTRY based on `!inventoryEntry` — was
                  a copy-paste bug where both branches resolved to the same "new entry" key. */}
              <span>
                {entry
                  ? intl.formatMessage({ id: 'INVENTORY_ENTRY.EDIT_INVENTORY_ENTRY' })
                  : intl.formatMessage({ id: 'INVENTORY_ENTRY.NEW_INVENTORY_ENTRY' })}
              </span>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-text"
                aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
              >
                ✕
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {/* Product (searchable select) */}
            <div>
              <label className={labelClass}>
                {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className={inputClass}
                // Angular parity (edit-inventory-entry-modal.component.html:17):
                // [disabled]="true" unconditionally, in BOTH create and edit mode.
                disabled
              >
                <option value="">
                  {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}...
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label htmlFor="entry-quantity" className={labelClass}>
                {intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' })}
              </label>
              <input
                id="entry-quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Cost Price */}
            <div>
              <label htmlFor="entry-cost-price" className={labelClass}>
                {intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' })}
              </label>
              <input
                id="entry-cost-price"
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Errors */}
            {(validationError || error) && (
              <p className="text-sm text-danger">{validationError || error}</p>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {/* Angular parity: edit-inventory-entry-modal.component.html:77-85 —
                `mat-fab extended` Close/Save buttons. */}
            <Button variant="fab" onClick={onClose}>
              {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
            </Button>
            <Button variant="fab" onClick={handleSave}>
              {/* Angular parity: edit-inventory-entry-modal.component.html:84 toggles between
                  GENERAL.INSERT (create) and GENERAL.UPDATE (edit) — was hardcoded to
                  GENERAL.SAVE regardless of mode. */}
              {entry
                ? intl.formatMessage({ id: 'GENERAL.UPDATE' })
                : intl.formatMessage({ id: 'GENERAL.INSERT' })}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
