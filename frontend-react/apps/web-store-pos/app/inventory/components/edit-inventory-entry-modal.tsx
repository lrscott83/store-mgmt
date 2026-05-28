import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, Product, ProductCategory } from '@store-mgmt/domain';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';

export interface EditInventoryEntryInput {
  productId: string;
  categoryId: string;
  quantity: number;
  costPrice: number;
  date: string;
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

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  const [productId, setProductId] = useState(entry?.productId ?? '');
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? '');
  const [quantity, setQuantity] = useState(entry?.quantity.toString() ?? '');
  const [costPrice, setCostPrice] = useState(entry?.costPrice.toString() ?? '');
  const [date, setDate] = useState(
    entry?.date ? new Date(entry.date).toISOString().slice(0, 10) : todayString(),
  );
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const productSvc = new ProductOfflineService(storeId);
    const categorySvc = new ProductCategoryOfflineService(storeId);
    setProducts(productSvc.getAll());
    setCategories(categorySvc.getAll());
  }, [isOpen, storeId]);

  // Auto-fill category when product changes
  useEffect(() => {
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (product) setCategoryId(product.categoryId);
  }, [productId, products]);

  if (!isOpen) return null;

  function handleSave() {
    setValidationError('');
    const qty = parseInt(quantity, 10);
    const cost = parseFloat(costPrice);

    if (!productId) {
      setValidationError(intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' }) + ' es requerido');
      return;
    }
    if (!quantity || isNaN(qty) || qty <= 0) {
      setValidationError(
        intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' }) + ' debe ser mayor a 0',
      );
      return;
    }
    if (costPrice === '' || isNaN(cost) || cost < 0) {
      setValidationError(
        intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' }) + ' debe ser >= 0',
      );
      return;
    }

    onSave(
      { productId, categoryId, quantity: qty, costPrice: cost, date },
      entry?.id,
    );
  }

  const selectedProduct = products.find((p) => p.id === productId);
  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {entry
              ? intl.formatMessage({ id: 'INVENTORY.TODAY_ENTRIES.NEW_ENTRY' })
              : intl.formatMessage({ id: 'INVENTORY.TODAY_ENTRIES.NEW_ENTRY' })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* Product (searchable select) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">
                {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}...
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category (auto-filled) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.CATEGORY' })}
            </label>
            <input
              type="text"
              readOnly
              value={selectedCategory?.name ?? ''}
              className="w-full rounded border bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.QUANTITY' })}
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Cost Price */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.COST_PRICE' })}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'INVENTORY.ENTRY.DATE' })}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Errors */}
          {(validationError || error) && (
            <p className="text-sm text-red-600">{validationError || error}</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </button>
          <button
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
        </div>
      </div>
    </div>
  );
}
