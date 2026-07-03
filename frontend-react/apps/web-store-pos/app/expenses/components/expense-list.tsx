import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { getPaymentTypeIconKind } from '~/shared/lib/payment-type-icon';
import { InfoBox } from '~/shared/components/ui/info-box';
import { PaymentMethodIcon, TrashIcon } from '~/shared/components/ui/icons';

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

interface ExpenseListProps {
  expenses: Expense[];
  /**
   * Mirrors Angular's `expense-list.component.ts:20` `@Input() readOnly: boolean = true` —
   * both the edit AND delete actions are gated together behind `!readOnly`
   * (`expense-list.component.html:22`), unlike the old React `allowDelete` prop which only
   * hid Delete while Edit always rendered. Defaults to `false` here (not Angular's default),
   * matching the `EntryList` precedent: both current callers (Today/History) pass an explicit
   * override, so there's no caller relying on a fail-safe default.
   */
  readOnly?: boolean;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
}

export function ExpenseList({ expenses, readOnly = false, onEdit, onDelete }: ExpenseListProps) {
  const intl = useIntl();

  if (expenses.length === 0) {
    return (
      <InfoBox variant="primary" className="text-center">
        {intl.formatMessage({ id: 'EXPENSES.EMPTY_STATE' })}
      </InfoBox>
    );
  }

  return (
    <div className="divide-y divide-border rounded border border-border bg-surface">
      {expenses.map((expense) => (
        <div key={expense.id} className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-text-muted">
                {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[expense.type] })}
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-danger">
                <PaymentMethodIcon kind={getPaymentTypeIconKind(expense.paymentType)} className="text-success" />
                ${expense.total.toFixed(2)}
              </span>
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                {intl.formatMessage({ id: PAYMENT_TYPE_KEYS[expense.paymentType] })}
              </span>
            </div>
            {expense.note && (
              <p className="mt-0.5 truncate text-xs text-text-muted">{expense.note}</p>
            )}
          </div>

          {!readOnly && (
            <div className="ml-4 flex shrink-0 gap-2">
              <button
                onClick={() => onEdit?.(expense)}
                className="rounded bg-primary-light px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
              >
                {intl.formatMessage({ id: 'EXPENSES.EDIT' })}
              </button>
              {onDelete && (
                <button
                  onClick={() => onDelete(expense)}
                  className="flex items-center gap-1 rounded bg-danger/10 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  {intl.formatMessage({ id: 'EXPENSES.DELETE' })}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
