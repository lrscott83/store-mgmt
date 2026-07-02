import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { ProductCategory } from '@store-mgmt/domain';

interface EditProductCategoryModalProps {
  category?: ProductCategory;
  onSave: (category: { name: string; order: number; isActive: boolean; id?: string }) => void;
  onClose: () => void;
}

export function EditProductCategoryModal({ category, onSave, onClose }: EditProductCategoryModalProps) {
  const intl = useIntl();
  const isEditing = !!category;

  const [form, setForm] = useState({
    name: category?.name ?? '',
    order: category?.order.toString() ?? '1',
    isActive: category?.isActive ?? true,
  });
  const [errors, setErrors] = useState<{ name?: string; order?: string }>({});

  function validate(): boolean {
    const newErrors: { name?: string; order?: string } = {};
    if (!form.name.trim()) {
      newErrors.name = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' }) },
      );
    }
    // Angular's ONLY validation on `order` is `required` (edit-product-category-modal
    // .component.html:26-28) — no positivity/min check. Do not reintroduce one here.
    if (!form.order.trim()) {
      newErrors.order = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: intl.formatMessage({ id: 'GENERAL.ORDER' }) },
      );
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      id: category?.id,
      name: form.name.trim(),
      order: parseInt(form.order, 10),
      isActive: form.isActive,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {isEditing
            ? intl.formatMessage({ id: 'PRODUCTS.CATEGORY.EDIT' })
            : intl.formatMessage({ id: 'PRODUCTS.CATEGORY.CREATE' })}
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
              data-testid="category-name-input"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'GENERAL.ORDER' })}
            </label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="category-order-input"
            />
            {errors.order && <p className="mt-1 text-xs text-red-500">{errors.order}</p>}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600"
              data-testid="category-active-checkbox"
            />
            <span className="text-xs font-medium text-gray-600">Active</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
              data-testid="category-save-button"
            >
              {intl.formatMessage({ id: 'GENERAL.SAVE' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
