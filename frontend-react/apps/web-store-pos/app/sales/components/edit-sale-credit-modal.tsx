import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';

interface EditSaleCreditModalProps {
  saleCredit: SaleCredit;
  isOpen: boolean;
  onClose: () => void;
  onSave: (creditId: string, client: string, note: string) => void;
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

  function handleSubmit() {
    setTouched(true);
    if (client.trim() === '') return;
    if (!saleCredit?.id) return;
    onSave(saleCredit.id, client, note);
    onClose();
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
                ✕
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-text">
              Pagar: ${(saleCredit?.total ?? 0).toFixed(2)}
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
              {/* GENERAL.CLOSE */}
              {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            </Button>
            <Button variant="fab" onClick={handleSubmit} data-testid="edit-sale-credit-submit">
              {/* SALE_CREDIT.TO_PAY — Angular's literal submit label on this client/note-only form */}
              {intl.formatMessage({ id: 'SALE_CREDIT.TO_PAY' })}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
