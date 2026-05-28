import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';

interface SaleCreditPaymentModalProps {
  credit: SaleCredit;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (creditId: string, paidType: PaymentType) => void;
}

const PAYMENT_OPTIONS = [
  { value: PaymentType.Efectivo, label: 'Efectivo' },
  { value: PaymentType.Tarjeta, label: 'Tarjeta' },
  { value: PaymentType.Zelle, label: 'Zelle' },
];

export function SaleCreditPaymentModal({
  credit,
  isOpen,
  onClose,
  onConfirm,
}: SaleCreditPaymentModalProps) {
  const intl = useIntl();
  const [paidType, setPaidType] = useState<PaymentType>(PaymentType.Efectivo);

  if (!isOpen) return null;

  const remaining = credit.total - credit.paid;

  function handleConfirm() {
    if (credit.isPaid) return;
    onConfirm(credit.id, paidType);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {intl.formatMessage({ id: 'CREDITS.REGISTER_PAYMENT' })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            ✕
          </button>
        </div>

        <div className="mb-4 space-y-1 text-sm text-gray-600">
          <p>
            {intl.formatMessage({ id: 'CREDITS.CLIENT' })}: <strong>{credit.client}</strong>
          </p>
          <p>
            {intl.formatMessage({ id: 'CREDITS.REMAINING' })}:{' '}
            <strong className="text-gray-900">${remaining.toFixed(2)}</strong>
          </p>
          <p>
            {intl.formatMessage({ id: 'CREDITS.PAYMENT.AMOUNT' })}:{' '}
            <strong>${remaining.toFixed(2)}</strong>
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'CREDITS.PAYMENT.TYPE' })}
          </label>
          <select
            value={paidType}
            onChange={(e) => setPaidType(Number(e.target.value) as PaymentType)}
            disabled={credit.isPaid}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            {PAYMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={credit.isPaid}
            className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {intl.formatMessage({ id: 'CREDITS.PAYMENT.CONFIRM' })}
          </button>
          <button
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
        </div>
      </div>
    </div>
  );
}
