import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { ExpenseType, salePaymentMethodLabel } from '@store-mgmt/domain';
import { resolvedExpensePaymentMethod } from '~/shared/lib/payment-method-resolved';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

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
    <div className="bg-surface">
      {expenses.map((expense) => (
        <div className="flex items-center p-2">
          {/* Layout 3 columnas (petición del owner): motivo a la izquierda, modo
              de pago en el centro (alineado a la izquierda) y precio a la derecha. */}
          <div
            data-testid={`expense-row-${expense.id}`}
            className="grid flex-1 grid-cols-3 items-center p-2"
          >
            {/* Columna 1 — motivo, alineado a la izquierda. */}
            <span className="truncate text-left text-xs text-text-muted">
              {intl.formatMessage({ id: EXPENSE_TYPE_KEYS[expense.type] })}
            </span>
            {/* Columna 2 — modo de pago, centro y alineado a la izquierda. */}
            <span className="text-left text-xs font-semibold text-success">
              {salePaymentMethodLabel(
                resolvedExpensePaymentMethod(expense),
                expense.currency ?? 0,
              )}
            </span>
            {/* Columna 3 — precio, alineado a la derecha. */}
            <span className="text-right text-sm font-semibold text-danger">
              {formatMoneyWithCurrency(expense.total, expense.currency)}
            </span>
          </div>

          {!readOnly && (
            <div className="ml-4 flex shrink-0">
              <ActionMenu testId={`expense-actions-toggle-${expense.id}`}>
                <ActionMenuItem intent="edit" onClick={() => onEdit?.(expense)}>
                  {intl.formatMessage({ id: 'EXPENSES.EDIT' })}
                </ActionMenuItem>
                {onDelete && (
                  <ActionMenuItem intent="delete" separatorBefore onClick={() => onDelete(expense)}>
                    {intl.formatMessage({ id: 'EXPENSES.DELETE' })}
                  </ActionMenuItem>
                )}
              </ActionMenu>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
