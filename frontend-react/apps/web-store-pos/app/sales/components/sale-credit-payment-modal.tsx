import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';

interface SaleCreditPaymentModalProps {
  saleCredit: SaleCredit;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (creditId: string, paidType: PaymentType, note: string) => void;
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
 * behind a SweetAlert2 confirm dialog (`PAYMENT_CONFIRM_TITLE`/
 * `PAYMENT_CONFIRM_MESSAGE`) — no SweetAlert2 equivalent in React, so this
 * reuses the established two-step-inline-confirm pattern from
 * `order-item-list`'s deactivate action.
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
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  if (!isOpen) return null;

  function handleSubmitClick() {
    if (!confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    onConfirm(saleCredit.id, paymentType, note);
    setConfirmSubmit(false);
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
              {/* SALE_CREDIT.TO_PAY, second click text becomes GENERAL.YES to mirror the
                  SweetAlert2 confirm step Angular shows before this action */}
              {confirmSubmit
                ? intl.formatMessage({ id: 'GENERAL.YES' })
                : intl.formatMessage({ id: 'SALE_CREDIT.TO_PAY' })}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
