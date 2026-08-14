import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, ProductSelectView } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';
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
  // Searchable combobox (UX improvement over Angular's plain mat-select): the input holds the
  // typed query, the list filters products while the user types, and selection keeps the id.
  const [query, setQuery] = useState('');
  const [isListOpen, setIsListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    createProductService(storeId).getProductsToSelect().then((result) => {
      if (!cancelled && result.succeeded) {
        setProducts(result.data);
        // Edit mode: prefill the query with the current entry's product name once loaded.
        if (entry) {
          const match = result.data.find((p) => p.id === entry.productId);
          if (match) setQuery(match.fullName);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, storeId, entry]);

  // Accent- and case-insensitive filter: "cafe" matches "Café", "RON" matches "Ron".
  const normalized = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filteredProducts =
    query.trim() === ''
      ? products
      : products.filter((p) => normalized(p.fullName).includes(normalized(query)));

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

  function selectProduct(product: ProductSelectView) {
    setProductId(product.id);
    setQuery(product.fullName);
    setIsListOpen(false);
  }

  // ArrowDown/ArrowUp move the active option; Enter selects it; Escape closes the list.
  function handleProductKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsListOpen(true);
      setActiveIndex((prev) => (filteredProducts.length === 0 ? 0 : Math.min(prev + 1, filteredProducts.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (filteredProducts.length === 0 ? 0 : Math.max(prev - 1, 0)));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (isListOpen && filteredProducts[activeIndex]) selectProduct(filteredProducts[activeIndex]);
    } else if (event.key === 'Escape') {
      setIsListOpen(false);
    }
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
                <CloseIcon />
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {/* Product (searchable combobox — filters while the user types) */}
            <div className="relative">
              <label htmlFor="entry-product" className={labelClass}>
                {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
              </label>
              <input
                id="entry-product"
                type="text"
                role="combobox"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setProductId('');
                  setIsListOpen(true);
                  setActiveIndex(0);
                }}
                onFocus={() => setIsListOpen(true)}
                onBlur={() => setIsListOpen(false)}
                onKeyDown={handleProductKeyDown}
                aria-expanded={isListOpen}
                aria-controls="entry-product-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  isListOpen && filteredProducts[activeIndex]
                    ? `entry-product-option-${activeIndex}`
                    : undefined
                }
                className={inputClass}
                placeholder={intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
              />
              {isListOpen && (
                <ul
                  id="entry-product-listbox"
                  role="listbox"
                  className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-border bg-surface py-1 shadow-md"
                >
                  {filteredProducts.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-text-muted">
                      {intl.formatMessage({ id: 'GENERAL.NO_RESULTS' })}
                    </li>
                  ) : (
                    filteredProducts.map((p, index) => (
                      <li
                        key={p.id}
                        id={`entry-product-option-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseDown={(e) => {
                          // Prevent the input blur before the click lands on the option.
                          e.preventDefault();
                        }}
                        onClick={() => selectProduct(p)}
                        className={`cursor-pointer px-3 py-2 text-sm ${
                          index === activeIndex ? 'bg-primary/10 text-primary' : 'text-text hover:bg-surface-hover'
                        }`}
                      >
                        {p.fullName}
                      </li>
                    ))
                  )}
                </ul>
              )}
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
              <CloseIcon />
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" onClick={handleSave}>
              <SaveIcon />
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
