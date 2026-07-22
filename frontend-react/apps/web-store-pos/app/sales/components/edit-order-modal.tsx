import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Order } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, EditIcon } from '~/shared/components/ui/icons';
import { showBlockingError } from '~/shared/lib/blocking-alert';

interface EditOrderModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  /** Returns `true` on success, `false` on failure — mirrors Angular's
   * `orderService.updateTodayOrder(...)` returning a `DataResult` with `succeeded`. */
  onUpdate: (orderId: string, paymentType: PaymentType) => boolean;
}

// Angular's PaymentTypeUtils.getPaymentTypes() maps enum keys to labels as-is
// (no translation applied in the template) — keep the raw Spanish-adjacent
// enum member names, same as sale-credit-payment-modal / order-list precedent.
const PAYMENT_OPTIONS = [
  { value: PaymentType.Efectivo, label: 'Efectivo' },
  { value: PaymentType.Tarjeta, label: 'Tarjeta' },
  { value: PaymentType.Zelle, label: 'Zelle' },
];

/**
 * Matches Angular's `edit-order-modal.component.html` 1:1: title is literally
 * `SALE_CREDIT.PAYMENT_CREDIT` ("Venta por Cobrar") in Angular's source — not
 * an order-specific title, no order metadata/items list is shown here (that
 * lives in `order-item-list`). Only a payment-type radio group + Cerrar/
 * Actualizar actions.
 */
export function EditOrderModal({ order, isOpen, onClose, onUpdate }: EditOrderModalProps) {
  const intl = useIntl();
  const [paymentType, setPaymentType] = useState<PaymentType>(order.paymentType ?? PaymentType.Efectivo);

  if (!isOpen) return null;

  // Angular: edit-order-modal.component.ts:39-54 — on failure, Swal.fire({ icon: 'error',
  // title: GENERAL.ERROR, text: dataEntry.errors[0].description }); modal stays open.
  // `updateTodayOrder` has exactly one failure branch (record not found ->
  // OrderErrors.NotExists), so the "dynamic" description is always this static literal.
  function handleSubmit() {
    if (!order?.id) return;
    const succeeded = onUpdate(order.id, paymentType);
    if (succeeded) {
      onClose();
    } else {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: 'ORDER_ERRORS.NOT_EXISTS' }),
      );
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg">
        <Card
          title={
            <div className="flex items-center justify-between">
              {/* SALE_CREDIT.PAYMENT_CREDIT (Angular's literal modal title) */}
              <span>{intl.formatMessage({ id: 'SALE_CREDIT.PAYMENT_CREDIT' })}</span>
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
          <fieldset className="space-y-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="paymentType"
                  value={opt.value}
                  checked={paymentType === opt.value}
                  onChange={() => setPaymentType(opt.value)}
                  className="accent-primary"
                />
                {opt.label}
              </label>
            ))}
          </fieldset>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="fab" onClick={onClose} data-testid="edit-order-close-button">
              <CloseIcon />
              {/* GENERAL.CLOSE */}
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" onClick={handleSubmit} data-testid="edit-order-update-button">
              <EditIcon />
              {/* GENERAL.UPDATE */}
              {intl.formatMessage({ id: 'GENERAL.UPDATE' })}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
