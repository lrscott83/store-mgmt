import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, Warehouse } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';

export type WarehouseMovementMode = 'purchase_in' | 'sale_out' | 'transfer_out';

export interface WarehouseMovementFields {
  productId: string;
  quantity: number;
  costPrice?: number;
  toWarehouseId?: string;
  reason: string | null;
}

interface WarehouseMovementModalProps {
  open: boolean;
  mode: WarehouseMovementMode;
  /** Almacén origen de la operación. */
  warehouse: Warehouse;
  /** Almacenes activos distintos del origen — opciones del select destino. */
  targetWarehouses: Warehouse[];
  /** Productos seleccionables según el modo (todos en compra, con stock en salida/transferencia). */
  products: Product[];
  /** Producto prefijado (fila) → select deshabilitado; null (gear) → usuario elige. */
  productId: string | null;
  onClose: () => void;
  onSubmit: (fields: WarehouseMovementFields) => void;
  /**
   * Valores precargados de edición (plan 2026-09-09, F3): el modal Editar
   * reutiliza este componente con los valores de la fila original.
   */
  initial?: { quantity: number; costPrice?: number; toWarehouseId?: string } | null;
  /** Clave i18n del título — por defecto el del modo; el de edición lo sobreescribe. */
  titleId?: string;
}

const MODAL_TITLE: Record<WarehouseMovementMode, string> = {
  purchase_in: 'WAREHOUSES.MODAL_ENTRY',
  sale_out: 'WAREHOUSES.MODAL_SALE_OUT',
  transfer_out: 'WAREHOUSES.MODAL_MOVEMENT',
};

/**
 * Modal de movimientos de almacén (gear: Entrada / Movimiento / Salida, y los
 * accesos por fila y compra rápida). Sustituye al formulario inline.
 * Modelo: warehouse-form-modal.tsx (role="dialog", backdrop cierra, Escape cierra).
 * La validación de dominio vive en el servicio — el Save deshabilitado es una
 * guarda de UI, no la fuente de verdad.
 */
export function WarehouseMovementModal({
  open,
  mode,
  warehouse,
  targetWarehouses,
  products,
  productId,
  onClose,
  onSubmit,
  initial = null,
  titleId,
}: WarehouseMovementModalProps) {
  const intl = useIntl();
  const [selectedProduct, setSelectedProduct] = useState('');
  // Searchable combobox (same UX as EditInventoryEntryModal's "+ Entrada" product
  // picker): the input holds the typed query while the list filters as the user types.
  const [query, setQuery] = useState('');
  const [isListOpen, setIsListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedProduct(productId ?? '');
      // Prefill the combobox with the fixed product's name (row/edition mode) or with
      // the raw id when the product is no longer in the catalog (submit keeps working).
      setQuery(
        productId ? (products.find((p) => p.id === productId)?.name ?? productId) : '',
      );
      setIsListOpen(false);
      setActiveIndex(0);
      // Edición (F3): precarga los valores de la fila original; create arranca limpio.
      setQuantity(initial ? String(initial.quantity) : '');
      setCostPrice(initial?.costPrice !== undefined ? String(initial.costPrice) : '');
      setToWarehouseId(initial?.toWarehouseId ?? '');
      setReason('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill only on open; changing
    // products/initial must not reset form fields while the user is typing.
  }, [open, productId, initial]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const qty = parseFloat(quantity);
  const validQty = Number.isFinite(qty) && qty > 0;
  const isValid =
    selectedProduct !== '' &&
    validQty &&
    (mode !== 'purchase_in' ||
      (Number.isFinite(parseFloat(costPrice)) && parseFloat(costPrice) > 0)) &&
    (mode !== 'transfer_out' || toWarehouseId !== '');

  // Accent- and case-insensitive filter (same as edit-inventory-entry-modal):
  // "cafe" matches "Café", "RON" matches "Ron".
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const filteredProducts =
    query.trim() === ''
      ? products
      : products.filter((p) => normalized(p.name).includes(normalized(query)));

  function selectProduct(p: Product) {
    setSelectedProduct(p.id);
    setQuery(p.name);
    setIsListOpen(false);
    setActiveIndex(0);
  }

  function handleProductKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredProducts.length - 1));
      setIsListOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      setIsListOpen(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filteredProducts[activeIndex];
      if (isListOpen && option) {
        selectProduct(option);
      }
    } else if (e.key === 'Escape' && isListOpen) {
      // Cierra solo la lista; el modal lo cierra el listener global de Escape.
      e.stopPropagation();
      setIsListOpen(false);
    }
  }

  const inputClass =
    'w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={`movement-form-${mode}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {intl.formatMessage({ id: titleId ?? MODAL_TITLE[mode] })} — {warehouse.name}
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

        <div className="space-y-3">
          <div>
            <label htmlFor="movement-product" className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'WAREHOUSES.PRODUCT' })}
            </label>
            <input
              id="movement-product"
              data-testid="movement-product"
              type="text"
              role="combobox"
              autoComplete="off"
              value={query}
              disabled={productId !== null}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedProduct('');
                setIsListOpen(true);
                setActiveIndex(0);
              }}
              onFocus={() => setIsListOpen(true)}
              onBlur={() => setIsListOpen(false)}
              onKeyDown={handleProductKeyDown}
              aria-expanded={isListOpen}
              aria-controls="movement-product-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                isListOpen && filteredProducts[activeIndex]
                  ? `movement-product-option-${activeIndex}`
                  : undefined
              }
              className={inputClass}
              placeholder={intl.formatMessage({ id: 'WAREHOUSES.SELECT_PRODUCT' })}
            />
            {isListOpen && (
              <ul
                id="movement-product-listbox"
                role="listbox"
                data-testid="movement-product-listbox"
                className="mt-1 max-h-48 overflow-auto rounded border border-border bg-background py-1 shadow-lg"
              >
                {filteredProducts.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-text-muted">
                    {intl.formatMessage({ id: 'GENERAL.NO_RESULTS' })}
                  </li>
                ) : (
                  filteredProducts.map((p, index) => (
                    <li
                      key={p.id}
                      id={`movement-product-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectProduct(p)}
                      className={`cursor-pointer px-3 py-2 text-sm text-text ${
                        index === activeIndex ? 'bg-primary/10' : ''
                      }`}
                    >
                      {p.name}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="movement-quantity" className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'WAREHOUSES.QUANTITY' })}
            </label>
            <input
              id="movement-quantity"
              data-testid="movement-quantity"
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
          </div>

          {mode === 'purchase_in' && (
            <div>
              <label htmlFor="movement-cost" className="mb-1 block text-sm font-medium text-text">
                {intl.formatMessage({ id: 'WAREHOUSES.COST_PRICE' })}
              </label>
              <input
                id="movement-cost"
                data-testid="movement-cost"
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {mode === 'transfer_out' && (
            <div>
              <label htmlFor="movement-target" className="mb-1 block text-sm font-medium text-text">
                {intl.formatMessage({ id: 'WAREHOUSES.TO_WAREHOUSE' })}
              </label>
              <select
                id="movement-target"
                data-testid="movement-target"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                className={inputClass}
              >
                <option value="">
                  {intl.formatMessage({ id: 'WAREHOUSES.SELECT_WAREHOUSE' })}
                </option>
                {targetWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="movement-reason" className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'WAREHOUSES.REASON' })}
            </label>
            <input
              id="movement-reason"
              data-testid="movement-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'WAREHOUSES.CANCEL' })}
          </Button>
          <Button
            variant="fab"
            className="flex-1 justify-center"
            disabled={!isValid}
            onClick={() =>
              onSubmit({
                productId: selectedProduct,
                quantity: qty,
                costPrice:
                  mode === 'purchase_in' && Number.isFinite(parseFloat(costPrice))
                    ? parseFloat(costPrice)
                    : undefined,
                toWarehouseId: mode === 'transfer_out' ? toWarehouseId : undefined,
                reason: reason.trim() || null,
              })
            }
          >
            <SaveIcon />
            {intl.formatMessage({ id: 'WAREHOUSES.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}