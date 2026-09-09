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
}: WarehouseMovementModalProps) {
  const intl = useIntl();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedProduct(productId ?? '');
      setProductSearch('');
      setQuantity('');
      setCostPrice('');
      setToWarehouseId('');
      setReason('');
    }
  }, [open, productId]);

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

  const productKnown = products.some((p) => p.id === selectedProduct);
  // Accent- and case-insensitive filter (same as edit-inventory-entry-modal):
  // "cafe" matches "Café", "RON" matches "Ron".
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const visibleProducts =
    productSearch.trim() === ''
      ? products
      : products.filter((p) => normalized(p.name).includes(normalized(productSearch)));
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
            {intl.formatMessage({ id: MODAL_TITLE[mode] })} — {warehouse.name}
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
            {productId === null && (
              <input
                id="movement-product-search"
                data-testid="movement-product-search"
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className={`${inputClass} mb-2`}
                placeholder={intl.formatMessage({ id: 'WAREHOUSES.SEARCH_PRODUCT' })}
              />
            )}
            <select
              id="movement-product"
              data-testid="movement-product"
              value={selectedProduct}
              disabled={productId !== null}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className={inputClass}
            >
              <option value="">{intl.formatMessage({ id: 'WAREHOUSES.SELECT_PRODUCT' })}</option>
              {visibleProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {!productKnown && selectedProduct !== '' && (
                <option value={selectedProduct}>{selectedProduct}</option>
              )}
            </select>
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
