import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';

interface EditSaleCreditModalProps {
  credit: SaleCredit;
  isOpen: boolean;
  onClose: () => void;
  onSave: (creditId: string, client: string, note: string) => void;
  onPayment: (credit: SaleCredit) => void;
}

export function EditSaleCreditModal({
  credit,
  isOpen,
  onClose,
  onSave,
  onPayment,
}: EditSaleCreditModalProps) {
  const intl = useIntl();
  const [client, setClient] = useState(credit.client);
  const [note, setNote] = useState(credit.note ?? '');

  if (!isOpen) return null;

  function handleSave() {
    onSave(credit.id, client.trim(), note.trim());
    onClose();
  }

  function handlePayment() {
    if (credit.isPaid) return;
    onPayment(credit);
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
            {intl.formatMessage({ id: 'CREDITS.CLIENT' })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            ✕
          </button>
        </div>

        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'CREDITS.CLIENT' })}
            </label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'GENERAL.NAME' })}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </button>
          <button
            onClick={handlePayment}
            disabled={credit.isPaid}
            className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {intl.formatMessage({ id: 'CREDITS.REGISTER_PAYMENT' })}
          </button>
          <button
            onClick={onClose}
            className="rounded border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
        </div>
      </div>
    </div>
  );
}
