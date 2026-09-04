import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { ProductCategory } from '@store-mgmt/domain';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';
import { Button } from '~/shared/components/ui/button';
import { BarcodeInput } from './barcode-input';

interface CreateProductForm {
  name: string;
  price: string;
  barcode: string;
  order: string;
  isActive: boolean;
  availableToSale: boolean;
  discountFromInvantory: boolean;
}

interface CreateProductModalProps {
  category: ProductCategory;
  defaultOrder: number;
  onSave: (data: {
    name: string;
    price: number;
    barcode?: string;
    categoryId: string;
    order: number;
    isActive: boolean;
    availableToSale: boolean;
    discountFromInvantory: boolean;
  }) => void;
  onClose: () => void;
}

// Angular parity source: edit-product-modal.component.html — the ONE real modal, reused for
// both create+edit. Field order: Nombre, Precio, Código de barras, Orden, Activo, Disponible
// para Vender, Descuenta del Inventario. Barcode stayed commented out in Angular (never
// rendered there) — the React form now OWNS an editable barcode field with scanner capture
// (Angular is legacy; its commented-out control is history). The category dropdown stays
// pinned to the click-context `category` prop instead.
export function CreateProductModal({ category, defaultOrder, onSave, onClose }: CreateProductModalProps) {
  const intl = useIntl();
  const [form, setForm] = useState<CreateProductForm>({
    name: '',
    price: '',
    barcode: '',
    order: defaultOrder.toString(),
    isActive: true,
    availableToSale: true,
    discountFromInvantory: true,
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
    } else if (parseFloat(form.price) < 0) {
      // Angular parity: Validators.min(0) on price (edit-product-modal.component.ts:147)
      newErrors.price = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO' },
        { name: intl.formatMessage({ id: 'GENERAL.PRICE' }) },
      );
    }
    // Angular parity: Validators.pattern(RegExExtensions.numeric = /^[0-9]\d*$/) on order
    // (edit-product-modal.component.ts:148-150). Angular has NO mat-error for the pattern
    // failure (html:61-64 only renders the required error) — a pattern mismatch must block
    // submit silently, with no visible message.
    let orderPatternValid = true;
    if (!form.order.trim() || isNaN(parseFloat(form.order))) {
      newErrors.order = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'GENERAL.ORDER' }) },
      );
    } else if (!/^[0-9]\d*$/.test(form.order.trim())) {
      orderPatternValid = false;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && orderPatternValid;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      name: form.name.trim(),
      price: parseFloat(form.price),
      barcode: form.barcode.trim() || undefined,
      categoryId: category.id,
      order: parseInt(form.order, 10),
      isActive: form.isActive,
      availableToSale: form.availableToSale,
      discountFromInvantory: form.discountFromInvantory,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCT' })}
        </h2>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
              min="0"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="product-price-input"
            />
            {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price}</p>}
          </div>

          {/* Barcode */}
          <BarcodeInput
            value={form.barcode}
            onChange={(barcode) => setForm((f) => ({ ...f, barcode }))}
            inputTestId="product-barcode-input"
            scanTestId="product-barcode-scan"
          />

          {/* Order */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'GENERAL.ORDER' })}
            </label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="product-order-input"
            />
            {errors.order && <p className="mt-1 text-xs text-red-500">{errors.order}</p>}
          </div>

          {/* Active */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="product-active-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">
              {intl.formatMessage({ id: 'GENERAL.ACTIVE' })}
            </span>
          </label>

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
