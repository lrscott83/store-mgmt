import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import {
  DEFAULT_CURRENCY,
  ExpenseType,
  PaymentType,
  SalePaymentMethod,
  legacyPaymentTypeToSalePaymentMethod,
  paymentMethodOptionsForCurrency,
  salePaymentMethodLabel,
} from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon, SaveIcon } from '~/shared/components/ui/icons';
import { CurrencySelect, hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ExpenseFormInput, id?: string) => void;
  expense?: Expense;
  error?: string;
}

/**
 * Estado inicial: el select de formas de pago abre en el método REAL resuelto
 * del gasto (legacy Tarjeta → Transferencia-CUP, Zelle → Zelle, ausente →
 * Efectivo), para que un gasto histórico guardado con Zelle se recargue como
 * Zelle aunque ese modo quede fuera del catálogo del plan.
 */
function emptyForm(expense?: Expense): ExpenseFormInput {
  if (expense) {
    const legacy =
      expense.paymentType === undefined || expense.paymentType === null
        ? PaymentType.Efectivo
        : expense.paymentType;
    const resolved =
      expense.salePaymentMethod ?? legacyPaymentTypeToSalePaymentMethod(legacy).method;
    return {
      type: expense.type,
      total: expense.total,
      salePaymentMethod: resolved,
      // Legacy espejo: Efectivo→Efectivo, Zelle→Zelle, resto→Tarjeta.
      paymentType:
        resolved === SalePaymentMethod.Zelle
          ? PaymentType.Zelle
          : resolved === SalePaymentMethod.Transferencia
            ? PaymentType.Tarjeta
            : PaymentType.Efectivo,
      note: expense.note ?? '',
      currency: expense.currency ?? DEFAULT_CURRENCY,
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
    salePaymentMethod: SalePaymentMethod.Efectivo,
    paymentType: PaymentType.Efectivo,
    note: '',
    currency: DEFAULT_CURRENCY,
  };
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

/** Opción del select de formas de pago: método real (persistido) + etiqueta visible. */
export interface ExpensePaymentOption {
  method: SalePaymentMethod;
  label: string;
}

/**
 * Catálogo de formas de pago del modal de gastos (petición del owner, 2026-09-21):
 *
 * - Sin MultiMonedas (plan Pago y Free): SOLO Efectivo y Transferencia (CUP) —
 *   Zelle oculto; los dos métodos del plan de pagos de la venta en CUP
 *   (paymentMethodOptionsForCurrency(CUP)).
 * - Con MultiMonedas: todas las formas de pago configuradas de la tienda — por
 *   la moneda del gasto (catálogo de payment-pricing), con etiqueta con moneda.
 */
export function expensePaymentOptionsFor(
  currency: number,
  hasMultiMonedas: boolean,
): ExpensePaymentOption[] {
  const methods = paymentMethodOptionsForCurrency(currency);
  const filtered = hasMultiMonedas ? methods : methods.filter((m) => m !== SalePaymentMethod.Zelle);
  return filtered.map((method) => ({
    method,
    label: salePaymentMethodLabel(method, currency),
  }));
}

// Angular parity: edit-expense-modal has NO date field — create always uses `new Date()`
// (edit-expense-modal.component.ts:60), update always reuses `this.expense.date` unchanged
// (:68). The date is never user-editable in either mode, so it's intentionally absent from
// ExpenseFormInput; callers set it themselves (create: `new Date()`; update: omitted, so the
// existing record's date is preserved by ExpenseOfflineService.update's `{...existing, ...patch}`).

/** Forma de pago del input: método real (autoritativo) + tipo legacy (compat de datos). */
export interface ExpenseFormInput {
  type: ExpenseType;
  total: number;
  /** Método real elegido — se persiste en `Expense.salePaymentMethod` (2026-09-21). */
  salePaymentMethod: SalePaymentMethod;
  /** Tipo legacy espejo — Efectivo/Tarjeta para lecturas viejas. Zelle ya no se emite. */
  paymentType: PaymentType;
  note: string;
  /** MultiMonedas: moneda del gasto (ausente = CUP). */
  currency: number;
}

export function ExpenseFormModal({
  isOpen,
  onClose,
  onSave,
  expense,
  error,
}: ExpenseFormModalProps) {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const hasMultiMonedas = hasMultiMonedasAvailable(user);
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
  // Catálogo de formas de pago (petición 2026-09-21): según la MONEDA elegida
  // del gasto; sin MultiMonedas el catálogo sale de CUP sin Zelle. Si el método
  // guardado del gasto no está en el catálogo de esta moneda (datos históricos),
  // se mantiene visible al final para que el select no pierda su valor.
  const catalogOptions = expensePaymentOptionsFor(form.currency, hasMultiMonedas);
  const paymentOptions = catalogOptions.some((o) => o.method === form.salePaymentMethod)
    ? catalogOptions
    : [
        ...catalogOptions,
        {
          method: form.salePaymentMethod,
          label: salePaymentMethodLabel(form.salePaymentMethod, form.currency),
        },
      ];

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
              onChange={(e) =>
                setForm((f) => ({ ...f, type: Number(e.target.value) as ExpenseType }))
              }
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
            <label
              htmlFor="expense-form-total"
              className="mb-1 block text-sm font-medium text-text"
            >
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

          {/* Currency (MultiMonedas): solo se renderiza con el módulo activo */}
          <CurrencySelect
            value={form.currency}
            onChange={(currency) => setForm((f) => ({ ...f, currency }))}
            label={intl.formatMessage({ id: 'GENERAL.CURRENCY' })}
            testId="expense-currency-select"
          />

          {/* Payment type — formas de pago configuradas (2026-09-21): por moneda
              (con MultiMonedas) o Efectivo + Transferencia (CUP) sin Zelle (sin
              MultiMonedas). El select guarda el MÉTODO real; paymentType queda
              espejado a legacy. Si el método guardado del gasto no está en el
              catálogo de esta moneda, se mantiene visible al final. */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text">
              {intl.formatMessage({ id: 'EXPENSES.FORM.PAYMENT_TYPE' })}
            </label>
            <select
              value={form.salePaymentMethod}
              onChange={(e) => {
                const method = Number(e.target.value) as SalePaymentMethod;
                setForm((f) => ({
                  ...f,
                  salePaymentMethod: method,
                  paymentType:
                    method === SalePaymentMethod.Zelle
                      ? PaymentType.Zelle
                      : method === SalePaymentMethod.Transferencia
                        ? PaymentType.Tarjeta
                        : PaymentType.Efectivo,
                }));
              }}
              className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {paymentOptions.map((option) => (
                <option key={option.method} value={option.method}>
                  {option.label}
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
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
          <Button variant="fab" className="flex-1 justify-center" onClick={handleSubmit}>
            <SaveIcon />
            {/* Angular parity: edit-expense-modal.component.html:74-77 toggles between
                GENERAL.INSERT (create) and GENERAL.UPDATE (edit) — was hardcoded to
                GENERAL.SAVE regardless of mode. */}
            {expense
              ? intl.formatMessage({ id: 'GENERAL.UPDATE' })
              : intl.formatMessage({ id: 'GENERAL.INSERT' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
