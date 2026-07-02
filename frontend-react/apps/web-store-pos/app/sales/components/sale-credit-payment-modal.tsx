import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { confirmDialog, showBlockingError } from '~/shared/lib/blocking-alert';

interface SaleCreditPaymentModalProps {
  saleCredit: SaleCredit;
  isOpen: boolean;
  onClose: () => void;
  /** Returns `true` on success, `false` on failure — mirrors Angular's
   * `saleCreditService.paidSaleCredit(...)` returning a `DataResult` with `succeeded`. */
  onConfirm: (creditId: string, paidType: PaymentType, note: string) => boolean;
}

// Angular's PaymentTypeUtils.getPaymentTypes() maps enum keys to labels as-is
// (no translation applied in the template) — same raw enum-member-name
// precedent as order-list / edit-order-modal.
const PAYMENT_OPTIONS = [
  { value: PaymentType.Efectivo, label: 'Efectivo' },
  { value: PaymentType.Tarjeta, label: 'Tarjeta' },
  { value: PaymentType.Zelle, label: 'Zelle' },
];

/**
 * Matches Angular's `sale-credit-payment-modal.component.html` 1:1: title is
 * literally `SALE_CREDIT.PAYMENT_CREDIT` (same key Angular reuses across all
 * three payment/edit modals). Shows "Cliente: {client}" and "Pagar: {total}"
 * literal lines, a "Forma de Pago" select (payment type, defaults to
 * Efectivo), and an optional note textarea. Angular gates the actual submit
 * behind a real SweetAlert2 confirm dialog (`SALE_CREDIT.PAYMENT_CONFIRM_TITLE`/
 * `PAYMENT_CONFIRM_MESSAGE`, sale-credit-payment-modal.component.ts:52-60) — ported here
 * via the shared `confirmDialog` wrapper (same `sweetalert2` library Angular uses, not a
 * bespoke double-click gate).
 */
export function SaleCreditPaymentModal({
  saleCredit,
  isOpen,
  onClose,
  onConfirm,
}: SaleCreditPaymentModalProps) {
  const intl = useIntl();
  const [paymentType, setPaymentType] = useState<PaymentType>(PaymentType.Efectivo);
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  // Angular: Swal.fire({ title: SALE_CREDIT.PAYMENT_CONFIRM_TITLE, text:
  // SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE, icon: 'question', showCancelButton: true,
  // confirmButtonColor: '#3456ff', cancelButtonColor: '#dc3545', confirmButtonText: YES,
  // cancelButtonText: NO }).then(result => { if (result.isConfirmed) { ...paidSaleCredit...
  // else Swal.fire({ icon: 'error', title: GENERAL.ERROR, text: ... }) } }).
  async function handleSubmitClick() {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'SALE_CREDIT.PAYMENT_CONFIRM_TITLE' }),
      message: intl.formatMessage({ id: 'SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE' }),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    const succeeded = onConfirm(saleCredit.id, paymentType, note);
    if (succeeded) {
      onClose();
    } else {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR500_MESSAGE' }),
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
                type="button"
                onClick={onClose}
                data-testid="sale-credit-payment-close-x"
                className="text-text-muted hover:text-text"
                aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
              >
                ✕
              </button>
            </div>
          }
        >
          <div className="mb-3 space-y-1 text-sm text-text">
            <p>Cliente: {saleCredit?.client || 'N/A'}</p>
            <p>Pagar: ${(saleCredit?.total ?? 0).toFixed(2)}</p>
          </div>

          <div className="mb-4">
            <label htmlFor="sale-credit-payment-type" className="mb-1 block text-sm font-medium text-text">
              Forma de Pago
            </label>
            <select
              id="sale-credit-payment-type"
              aria-label="Forma de Pago"
              value={paymentType}
              onChange={(e) => setPaymentType(Number(e.target.value) as PaymentType)}
              className="w-full rounded border border-border px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {PAYMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-text">
              {/* GENERAL.NOTE */}
              {intl.formatMessage({ id: 'GENERAL.NOTE' })}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              rows={2}
              className="w-full rounded border border-border px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="fab" onClick={onClose} data-testid="sale-credit-payment-close">
              {/* GENERAL.CLOSE */}
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" onClick={handleSubmitClick} data-testid="sale-credit-payment-submit">
              {/* SALE_CREDIT.TO_PAY — the real SweetAlert2 confirm dialog (not a button-text
                  swap) now gates the actual payment, matching Angular exactly. */}
              {intl.formatMessage({ id: 'SALE_CREDIT.TO_PAY' })}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
