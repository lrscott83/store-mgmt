import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';
import { Button } from '~/shared/components/ui/button';

interface EditProductModalProps {
  product: Product;
  categories: ProductCategory[];
  onSave: (product: Product) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function EditProductModal({ product, categories, onSave, onDelete, onClose }: EditProductModalProps) {
  const intl = useIntl();
  const [form, setForm] = useState({
    name: product.name,
    price: product.price.toString(),
    barcode: product.barcode ?? '',
    categoryId: product.categoryId,
    availableToSale: product.availableToSale,
    discountFromInvantory: product.discountFromInvantory,
  });
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  function validate(): boolean {
    const newErrors: { name?: string; price?: string } = {};
    if (!form.name.trim()) {
      newErrors.name = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' }) },
      );
    }
    if (!form.price.trim() || isNaN(parseFloat(form.price))) {
      newErrors.price = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' }) },
      );
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const cat = categories.find((c) => c.id === form.categoryId);
    onSave({
      ...product,
      name: form.name.trim(),
      price: parseFloat(form.price),
      barcode: form.barcode.trim() || undefined,
      categoryId: form.categoryId,
      categoryName: cat?.name ?? product.categoryName,
      availableToSale: form.availableToSale,
      discountFromInvantory: form.discountFromInvantory,
      updatedDate: new Date(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'PRODUCTS.EDIT' })}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' })}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="edit-product-name-input"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' })}
            </label>
            <input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="edit-product-price-input"
            />
            {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.BARCODE' })}
            </label>
            <input
              type="text"
              value={form.barcode}
              onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.CATEGORY' })}
            </label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.availableToSale}
              onChange={(e) => setForm((f) => ({ ...f, availableToSale: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="edit-product-available-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.AVAILABLE_TO_SALE' })}
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.discountFromInvantory}
              onChange={(e) => setForm((f) => ({ ...f, discountFromInvantory: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.DISCOUNT_FROM_INVENTORY' })}
            </span>
          </label>

          <div className="flex justify-between pt-2">
            {/* Delete button */}
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onDelete(product.id)}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                  data-testid="confirm-delete-button"
                >
                  {intl.formatMessage({ id: 'GENERAL.CONFIRM' })}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600"
                >
                  {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                data-testid="delete-product-button"
              >
                {intl.formatMessage({ id: 'GENERAL.DISCARD' })}
              </button>
            )}

            <div className="flex gap-2">
              <Button variant="fab" type="button" onClick={onClose}>
                <CloseIcon />
                {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
              </Button>
              <Button variant="fab" type="submit" data-testid="edit-product-submit">
                <SaveIcon />
                {intl.formatMessage({ id: 'GENERAL.UPDATE' })}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
