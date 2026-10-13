import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon } from '~/shared/components/ui/icons';
import { formatCurrency } from '~/shared/lib/format-currency';

/**
 * Confirmation popup shown BEFORE a store payment is registered. It shows the charged amount
 * (read-only) and the two OPTIONAL values persisted with the payment: the CUP-per-USD exchange
 * rate and the total paid. Typing the rate recomputes the total (`amount × rate`) but the
 * operator owns the final number; whatever is present on confirm is what gets stored.
 *
 * Presentational on purpose: the host route owns the state, the auto-compute and the save, so
 * the busy/error surface matches the rest of the billing screens.
 */
interface PaymentConfirmModalProps {
  open: boolean;
  storeName: string;
  /** Charged amount (monto cobrado), read-only. */
  amount: number;
  /** CUP per 1 USD, held as text (empty = not provided). */
  rate: string;
  /** Total paid, held as text (empty = not provided). */
  totalPaid: string;
  saving: boolean;
  error?: string;
  onRateChange: (value: string) => void;
  onTotalPaidChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const INPUT_CLASS =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

export function PaymentConfirmModal({
  open,
  storeName,
  amount,
  rate,
  totalPaid,
  saving,
  error,
  onRateChange,
  onTotalPaidChange,
  onConfirm,
  onClose,
}: PaymentConfirmModalProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="payment-confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text">
            {t('BILLING.COLLECTIONS.CONFIRM_TITLE')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label={t('GENERAL.CLOSE')}
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mb-3 text-sm font-medium text-text" data-testid="payment-confirm-store">
          {storeName}
        </p>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            {error}
          </p>
        )}

        <p className="mb-3 text-sm text-text">
          <span className="font-medium">{t('BILLING.COLLECTIONS.AMOUNT')}:</span>{' '}
          <span data-testid="payment-confirm-amount">{formatCurrency(amount)}</span>
        </p>

        <label className="mb-3 block text-sm text-text">
          <span className="mb-1 block font-medium">
            {t('BILLING.COLLECTIONS.EXCHANGE_RATE')}
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={rate}
            disabled={saving}
            onChange={(e) => onRateChange(e.target.value)}
            data-testid="payment-confirm-rate"
            className={INPUT_CLASS}
          />
        </label>

        <label className="mb-1 block text-sm text-text">
          <span className="mb-1 block font-medium">{t('BILLING.COLLECTIONS.TOTAL_PAID')}</span>
          <input
            type="number"
            min="0"
            step="any"
            value={totalPaid}
            disabled={saving}
            onChange={(e) => onTotalPaidChange(e.target.value)}
            data-testid="payment-confirm-total"
            className={INPUT_CLASS}
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('GENERAL.CANCEL')}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={saving}
            data-testid="payment-confirm-submit"
          >
            {t('BILLING.COLLECTIONS.CONFIRM_PAYMENT')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PaymentConfirmModal;
