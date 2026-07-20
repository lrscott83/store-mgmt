import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { ProductCategory } from '@store-mgmt/domain';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';
import { Button } from '~/shared/components/ui/button';

interface CreateProductForm {
  name: string;
  price: string;
  barcode: string;
  categoryId: string;
  availableToSale: boolean;
  discountFromInvantory: boolean;
}

interface CreateProductModalProps {
  categories: ProductCategory[];
  onSave: (data: {
    name: string;
    price: number;
    barcode?: string;
    categoryId: string;
    availableToSale: boolean;
    discountFromInvantory: boolean;
  }) => void;
  onClose: () => void;
}

export function CreateProductModal({ categories, onSave, onClose }: CreateProductModalProps) {
  const intl = useIntl();
  const [form, setForm] = useState<CreateProductForm>({
    name: '',
    price: '',
    barcode: '',
    categoryId: categories[0]?.id ?? '',
    availableToSale: true,
    discountFromInvantory: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateProductForm, string>>>({});

  function validate(): boolean {
    const newErrors: Partial<Record<keyof CreateProductForm, string>> = {};
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
    if (!form.categoryId) {
      newErrors.categoryId = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.CATEGORY' }) },
      );
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      name: form.name.trim(),
      price: parseFloat(form.price),
      barcode: form.barcode.trim() || undefined,
      categoryId: form.categoryId,
      availableToSale: form.availableToSale,
      discountFromInvantory: form.discountFromInvantory,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'PRODUCTS.CREATE' })}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' })}
            </label>
            <input
              type="text"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="product-name-input"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Price */}
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
              data-testid="product-price-input"
            />
            {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price}</p>}
          </div>

          {/* Barcode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.BARCODE' })}
            </label>
            <input
              type="text"
              value={form.barcode}
              onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="product-barcode-input"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.CATEGORY' })}
            </label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="product-category-select"
            >
              <option value="">-- {intl.formatMessage({ id: 'PRODUCTS.FORM.CATEGORY' })} --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="mt-1 text-xs text-red-500">{errors.categoryId}</p>}
          </div>

          {/* Available to sale */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.availableToSale}
              onChange={(e) => setForm((f) => ({ ...f, availableToSale: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="product-available-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.AVAILABLE_TO_SALE' })}
            </span>
          </label>

          {/* Discount from inventory */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.discountFromInvantory}
              onChange={(e) => setForm((f) => ({ ...f, discountFromInvantory: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="product-discount-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'PRODUCTS.FORM.DISCOUNT_FROM_INVENTORY' })}
            </span>
          </label>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="fab" type="button" onClick={onClose}>
              <CloseIcon />
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" type="submit" data-testid="create-product-submit">
              <SaveIcon />
              {intl.formatMessage({ id: 'GENERAL.SAVE' })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
