import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';

export interface ExpenseFormInput {
  type: ExpenseType;
  total: number;
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

// Angular parity: edit-expense-modal has NO date field — create always uses `new Date()`
// (edit-expense-modal.component.ts:60), update always reuses `this.expense.date` unchanged
// (:68). The date is never user-editable in either mode, so it's intentionally absent from
// ExpenseFormInput; callers set it themselves (create: `new Date()`; update: omitted, so the
// existing record's date is preserved by ExpenseOfflineService.update's `{...existing, ...patch}`).
function emptyForm(expense?: Expense): ExpenseFormInput {
  if (expense) {
    return {
      type: expense.type,
      total: expense.total,
      paymentType: expense.paymentType,
      note: expense.note ?? '',
    };
  }
  return {
    // Angular parity (edit-expense-modal.component.ts:60): create-mode default type is
    // ExpenseType.Salario, not Otro.
    type: ExpenseType.Salario,
    // Angular parity (edit-expense-modal.component.ts:88-92): total is Validators.required —
    // there is no valid default total on create, so it starts as NaN (invalid) until the user
    // types a value. `0` typed explicitly stays valid via the existing `>=0` check below.
    total: NaN,
    paymentType: PaymentType.Efectivo,
    note: '',
  };
}

export function ExpenseFormModal({ isOpen, onClose, onSave, expense, error }: ExpenseFormModalProps) {
  const intl = useIntl();
  const [form, setForm] = useState<ExpenseFormInput>(() => emptyForm(expense));
  // Angular parity: isControlInvalid(name, validator) only reports an error once the
  // control is `dirty || touched` (edit-expense-modal.component.ts:118-125) — a fresh
  // modal shows no error even though `total` starts invalid. `touched` here stands in
  // for "dirty || touched": it flips true as soon as the user edits/blurs the total
  // field, or after a blocked submit attempt (onSubmit's markAllAsTouched(), :52-56).
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setForm(emptyForm(expense));
    setTouched(false);
  }, [expense, isOpen]);

  if (!isOpen) return null;

  // Angular parity: Validators.required + Validators.min(0) — a total of exactly 0 IS valid
  // (edit-expense-modal.component.ts:88-92). Only a negative/NaN total is invalid.
  const isValid = Number.isFinite(form.total) && form.total >= 0;
  const showError = !isValid && touched;

  function handleSubmit() {
    // Angular parity (edit-expense-modal.component.ts:52-56): onSubmit() always runs on
    // click (the Save button has no [disabled] binding); when the form is invalid it
    // marks all controls touched (surfacing the error) and returns without saving.
    if (!isValid) {
      setTouched(true);
      return;
    }
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
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {expense
              ? intl.formatMessage({ id: 'EXPENSES.EDIT_TITLE' })
              : intl.formatMessage({ id: 'EXPENSES.NEW_TITLE' })}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-3">
          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'EXPENSES.FORM.TYPE' })}
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: Number(e.target.value) as ExpenseType }))}
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
            <label htmlFor="expense-form-total" className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'EXPENSES.FORM.TOTAL' })}
            </label>
            <input
              id="expense-form-total"
              type="number"
              step="0.01"
              value={Number.isNaN(form.total) ? '' : form.total}
              onChange={(e) => {
                setForm((f) => ({ ...f, total: parseFloat(e.target.value) }));
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {showError && (
              <p className="mt-1 text-xs text-danger">
                {intl.formatMessage({ id: 'EXPENSES.FORM.TOTAL_REQUIRED' })}
              </p>
            )}
          </div>

          {/* Payment type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'EXPENSES.FORM.PAYMENT_TYPE' })}
            </label>
            <select
              value={form.paymentType}
              onChange={(e) => setForm((f) => ({ ...f, paymentType: Number(e.target.value) as PaymentType }))}
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
            <label className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'EXPENSES.FORM.NOTE' })}
            </label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="fab" className="flex-1 justify-center" onClick={handleSubmit}>
            <SaveIcon />
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </Button>
          <Button variant="outline" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
