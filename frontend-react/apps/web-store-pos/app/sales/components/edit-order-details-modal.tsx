import { useState } from 'react';
import { useIntl } from 'react-intl';
import { OrderType } from '@store-mgmt/domain';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { getOrderTypes } from '~/sales/lib/order-type-utils';

interface EditOrderDetailsModalProps {
  onClose: () => void;
}

/**
 * 1:1 port of Angular's `EditOrderDetailsModalComponent`
 * (presentation/layouts/client-layout/nav-bar/edit-order-details-modal/edit-order-details-modal
 * .component.ts/.html). Reuses the repo's controlled-modal pattern from
 * `edit-product-category-modal.tsx` (rule 5 — no new abstraction).
 *
 * NOTE (ratified, do not "fix"): Angular's modal has ZERO live triggers anywhere in the
 * codebase — `NavRightComponent.editOrderDetails()` opens it, but nothing calls that method
 * (no `(click)` binding exists), and its subscribe targets a non-existent
 * `productCategoryUpdatedEmitter`. This component mirrors the modal exactly but is left
 * UNWIRED — no caller renders it. Do not add a trigger button; that was already decided.
 */
export function EditOrderDetailsModal({ onClose }: EditOrderDetailsModalProps) {
  const intl = useIntl();
  const orderTypes = getOrderTypes();
  const storeOrderType = useCartStore((s) => s.orderType);
  const storeOrderDescription = useCartStore((s) => s.orderDescription);
  const updateOrderDetails = useCartStore((s) => s.updateOrderDetails);

  // Mirrors ngOnInit's patchValue({ orderType: getOrderType(), description:
  // getOrderDescription() }) — prefilled from the cart store on mount (modal.ts:29-34).
  const [form, setForm] = useState<{ orderType: OrderType | ''; description: string }>({
    orderType: storeOrderType,
    description: storeOrderDescription ?? '',
  });
  const [errors, setErrors] = useState<{ orderType?: string }>({});

  function validate(): boolean {
    // Angular's ONLY validation is Validators.required on orderType (modal.ts:53);
    // description has no validators (modal.ts:54).
    const newErrors: { orderType?: string } = {};
    if (form.orderType === '') {
      newErrors.orderType = intl.formatMessage(
        { id: 'GENERAL.VALIDATION.REQUIRED' },
        { name: 'Tipo de venta' },
      );
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // modal.ts:46-48 — updateOrderDetails then close. No orderDetailsUpdatedEmitter emit:
    // its only Angular consumer subscribes to a non-existent property (dead/broken), and
    // Zustand's reactivity already re-renders subscribers (ADR-2, design doc).
    updateOrderDetails(form.orderType as OrderType, form.description);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'SHOPPING_CART.EDIT_DETAILS' })}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            {/* Angular html:14 — "Tipo de venta" is a hardcoded label, NOT a translate key. */}
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de venta</label>
            <select
              value={form.orderType === '' ? '' : String(form.orderType)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  orderType: e.target.value === '' ? '' : (Number(e.target.value) as OrderType),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="edit-order-details-type-select"
            >
              {orderTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {errors.orderType && <p className="mt-1 text-xs text-red-500">{errors.orderType}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'GENERAL.DESCRIPTION' })}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="edit-order-details-description-textarea"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              data-testid="edit-order-details-close"
            >
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
              data-testid="edit-order-details-save"
            >
              {intl.formatMessage({ id: 'GENERAL.SAVE' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
