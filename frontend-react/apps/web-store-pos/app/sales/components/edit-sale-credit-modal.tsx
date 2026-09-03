import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, PaymentIcon } from '~/shared/components/ui/icons';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { formatCurrency } from '~/shared/lib/format-currency';

interface EditSaleCreditModalProps {
  saleCredit: SaleCredit;
  isOpen: boolean;
  onClose: () => void;
  /** Returns `true` on success, `false` on failure — mirrors Angular's
   * `saleCreditService.updateSaleCredit(...)` returning a `DataResult` with `succeeded`. */
  onSave: (creditId: string, client: string, note: string) => boolean;
}

/**
 * Matches Angular's `edit-sale-credit-modal.component.html` 1:1: title is
 * literally `SALE_CREDIT.PAYMENT_CREDIT` ("Venta por Cobrar") — Angular's own
 * source, same apparent copy-paste as `edit-order-modal`, preserved
 * byte-identical. Shows "Pagar: {total}" line, then form with ONLY `client`
 * (required) and `note` (optional) — no payment-type field (that lives in
 * `SaleCreditPaymentModalComponent`). Actions: Cerrar (GENERAL.CLOSE) /
 * Pagar (SALE_CREDIT.TO_PAY) — Angular's own submit button literally reads
 * "Pagar" here even though `onSubmit()` only updates client/note, not
 * payment; preserved verbatim (not a paraphrase or a bug fix).
 */
export function EditSaleCreditModal({ saleCredit, isOpen, onClose, onSave }: EditSaleCreditModalProps) {
  const intl = useIntl();
  const [client, setClient] = useState(saleCredit.client);
  const [note, setNote] = useState(saleCredit.note ?? '');
  const [touched, setTouched] = useState(false);

  if (!isOpen) return null;

  const clientInvalid = touched && client.trim() === '';

  // Angular: edit-sale-credit-modal.component.ts:48-72 — on `updateSaleCredit` failure,
  // Swal.fire({ icon: 'error', title: GENERAL.ERROR, text: dataEntry.errors[0].description });
  // modal stays open (no closeModal() call in the else branch). `updateSaleCredit` has
  // exactly one failure branch (record not found -> SaleCreditErrors.NotExists), so the
  // "dynamic" description is always this static literal.
  function handleSubmit() {
    setTouched(true);
    if (client.trim() === '') return;
    if (!saleCredit?.id) return;
    const succeeded = onSave(saleCredit.id, client, note);
    if (succeeded) {
      onClose();
    } else {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: 'SALE_CREDIT_ERRORS.NOT_EXISTS' }),
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
                data-testid="edit-sale-credit-close-x"
                className="text-text-muted hover:text-text"
                aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
              >
                <CloseIcon />
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-text">
              Pagar: {formatCurrency(saleCredit?.total ?? 0)}
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                {/* GENERAL.CLIENT */}
                {intl.formatMessage({ id: 'GENERAL.CLIENT' })}
              </label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                onBlur={() => setTouched(true)}
                required
                autoComplete="off"
                className="w-full rounded border border-border px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {clientInvalid && (
                <p className="mt-1 text-xs text-danger">
                  {intl.formatMessage(
                    { id: 'GENERAL.VALIDATION.REQUIRED' },
                    { name: intl.formatMessage({ id: 'GENERAL.CLIENT' }) },
                  )}
                </p>
              )}
            </div>
            <div>
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
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="fab" onClick={onClose} data-testid="edit-sale-credit-close">
              <CloseIcon />
              {/* GENERAL.CLOSE */}
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" onClick={handleSubmit} data-testid="edit-sale-credit-submit">
              <PaymentIcon />
              {/* SALE_CREDIT.TO_PAY — Angular's literal submit label on this client/note-only form */}
              {intl.formatMessage({ id: 'SALE_CREDIT.TO_PAY' })}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
