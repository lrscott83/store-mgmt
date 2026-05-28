import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';

export interface ExpenseFormInput {
  type: ExpenseType;
  total: number;
  date: string;
  paymentType: PaymentType;
  note: string;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ExpenseFormInput, id?: string) => void;
  expense?: Expense;
  error?: string;
}

const EXPENSE_TYPES = [
  ExpenseType.Salario,
  ExpenseType.Transporte,
  ExpenseType.Alquiler,
  ExpenseType.Corriente,
  ExpenseType.Agua,
  ExpenseType.Comida,
  ExpenseType.Operaciones,
  ExpenseType.Viaje,
  ExpenseType.Divisa,
  ExpenseType.Impuesto,
  ExpenseType.Otro,
];

const EXPENSE_TYPE_KEYS: Record<ExpenseType, string> = {
  [ExpenseType.Salario]: 'EXPENSES.TYPE.SALARIO',
  [ExpenseType.Transporte]: 'EXPENSES.TYPE.TRANSPORTE',
  [ExpenseType.Alquiler]: 'EXPENSES.TYPE.ALQUILER',
  [ExpenseType.Corriente]: 'EXPENSES.TYPE.CORRIENTE',
  [ExpenseType.Agua]: 'EXPENSES.TYPE.AGUA',
  [ExpenseType.Comida]: 'EXPENSES.TYPE.COMIDA',
  [ExpenseType.Operaciones]: 'EXPENSES.TYPE.OPERACIONES',
  [ExpenseType.Viaje]: 'EXPENSES.TYPE.VIAJE',
  [ExpenseType.Divisa]: 'EXPENSES.TYPE.DIVISA',
  [ExpenseType.Impuesto]: 'EXPENSES.TYPE.IMPUESTO',
  [ExpenseType.Otro]: 'EXPENSES.TYPE.OTRO',
};

const PAYMENT_TYPE_KEYS: Record<PaymentType, string> = {
  [PaymentType.Efectivo]: 'CART.EFECTIVO',
  [PaymentType.Tarjeta]: 'CART.TARJETA',
  [PaymentType.Zelle]: 'CART.ZELLE',
};

function emptyForm(expense?: Expense): ExpenseFormInput {
  if (expense) {
    return {
      type: expense.type,
      total: expense.total,
      date: new Date(expense.date).toISOString().slice(0, 10),
      paymentType: expense.paymentType,
      note: expense.note ?? '',
    };
  }
  return {
    type: ExpenseType.Otro,
    total: 0,
    date: new Date().toISOString().slice(0, 10),
    paymentType: PaymentType.Efectivo,
    note: '',
  };
}

export function ExpenseFormModal({ isOpen, onClose, onSave, expense, error }: ExpenseFormModalProps) {
  const intl = useIntl();
  const [form, setForm] = useState<ExpenseFormInput>(() => emptyForm(expense));

  useEffect(() => {
    setForm(emptyForm(expense));
  }, [expense, isOpen]);

  if (!isOpen) return null;

  const isValid = form.total > 0;

  function handleSubmit() {
    if (!isValid) return;
    onSave(form, expense?.id);
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
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {expense
              ? intl.formatMessage({ id: 'EXPENSES.EDIT_TITLE' })
              : intl.formatMessage({ id: 'EXPENSES.NEW_TITLE' })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'EXPENSES.FORM.TYPE' })}
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: Number(e.target.value) as ExpenseType }))}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {EXPENSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[t] })}
                </option>
              ))}
            </select>
          </div>

          {/* Total */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'EXPENSES.FORM.TOTAL' })}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.total}
              onChange={(e) => setForm((f) => ({ ...f, total: parseFloat(e.target.value) || 0 }))}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'EXPENSES.FORM.DATE' })}
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Payment type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'EXPENSES.FORM.PAYMENT_TYPE' })}
            </label>
            <select
              value={form.paymentType}
              onChange={(e) => setForm((f) => ({ ...f, paymentType: Number(e.target.value) as PaymentType }))}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {([PaymentType.Efectivo, PaymentType.Tarjeta, PaymentType.Zelle] as PaymentType[]).map((pt) => (
                <option key={pt} value={pt}>
                  {intl.formatMessage({ id: PAYMENT_TYPE_KEYS[pt] })}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'EXPENSES.FORM.NOTE' })}
            </label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
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
