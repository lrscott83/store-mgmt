import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon, PaymentMethodIcon } from '~/shared/components/ui/icons';
import { getPaymentTypeIconKind } from '~/shared/lib/payment-type-icon';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { ExpenseOfflineService } from '../lib/services/expense-offline-service';
import { ExpenseList } from '../components/expense-list';

export const clientLoader = featureLoader([EFeatures.ExpensesHistory]);

const PAYMENT_TYPE_OPTIONS: { value: PaymentType | null; labelKey: string }[] = [
  { value: null, labelKey: 'GENERAL.ALL' },
  { value: PaymentType.Efectivo, labelKey: 'CART.EFECTIVO' },
  { value: PaymentType.Tarjeta, labelKey: 'CART.TARJETA' },
  { value: PaymentType.Zelle, labelKey: 'CART.ZELLE' },
];

/**
 * Matches Angular's `expenses.component.html`/`.ts` (Historial de Gastos).
 *
 * Angular's `loadExpenses()` always calls `loadExpensesFiltered(this.expenseType, ...)` with
 * `expenseType` permanently `null` (no UI control ever sets it — dead capability, confirmed:
 * `filterExpensesObservable`'s `expenseType`/date-range params have no wired control anywhere
 * in the template). Only the `paymentType` radio group is live. React mirrors this exactly:
 * a single payment-type filter, no date-range or expense-type filtering, and — critically —
 * no date bound at all (Angular's `loadExpensesFiltered(..., null, null)` = unbounded,
 * all-time history), not React's old 30-day rolling window.
 *
 * Read-only history (decision doc, L4 map gap #3 / #19 precedent): Angular's
 * `expenses.component.html:43` `<app-expense-list>` passes NO `[readOnly]` override, so
 * `expense-list`'s `@Input() readOnly: boolean = true` default applies — the whole edit/delete
 * actions menu (`@if (!readOnly)`, expense-list.component.html:22) is ALWAYS hidden here, and
 * there is no "add new expense" capability on this screen at all (that lives only on Today).
 * React mirrors this exactly: `ExpenseList` is rendered with `readOnly`, no edit/delete
 * handlers, and no `ExpenseFormModal` on this page.
 */
export function ExpensesHistoryPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [dayGroups, setDayGroups] = useState<LocalDayGroup<Expense>[]>([]);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());

  // Angular parity (expenses.component.ts `loadExpenses` → `loadExpensesFiltered`): always calls
  // `filterExpensesObservable(this.expenseType=null, paymentType, null, null)` — only `paymentType`
  // is ever wired by the UI (expenseType/date-range params are dead capability). React mirrors this
  // via the category-C async envelope and unwraps `.data`, replacing the old inline `getAll`+filter.
  async function loadExpenses() {
    const svc = new ExpenseOfflineService(storeId);
    const response = await svc.filterExpensesObservable(
      undefined,
      paymentType ?? undefined,
      undefined,
      undefined,
    );
    // ExpenseOfflineService.filterExpensesObservable is a same-tick `Promise.resolve(success(...))`
    // over local storage — it never actually fails; this guard exists for the type only.
    if (!response.succeeded) return;
    // Angular parity (expenses.component.ts groupExpenses): DESCENDING sort both across days
    // (:98, most recent day first) AND within a day (:92, most recent expense first) — the
    // mirror image of Inventory's groupEntriesByDay (entries.tsx), which sorts ascending.
    // groupByLocalDay defaults to newest-first, matching this route's sort direction.
    setDayGroups(
      groupByLocalDay(
        response.data,
        (e) => new Date(e.date),
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    );
  }

  useEffect(() => {
    void loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadExpenses reads only the listed deps
  }, [storeId, paymentType]);

  function toggleDayPanel(dayId: string) {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  const expensesCount = dayGroups.reduce((count, d) => count + d.items.length, 0);
  const expensesTotal = dayGroups.reduce(
    (total, d) => total + d.items.reduce((t, e) => t + e.total, 0),
    0,
  );

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {intl.formatMessage({ id: 'EXPENSES.HISTORY.TITLE' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({expensesCount})
            </span>
          </span>
          <span className="text-sm font-semibold text-danger">{formatCurrency(expensesTotal)}</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Payment-type filter — Angular's single mat-radio-group (Todas/Efectivo/Tarjeta/Zelle) */}
        <div
          role="radiogroup"
          aria-label={intl.formatMessage({ id: 'EXPENSES.FORM.PAYMENT_TYPE' })}
          className="flex flex-wrap gap-4"
        >
          {PAYMENT_TYPE_OPTIONS.map((opt) => (
            <label key={opt.value ?? 'all'} className="flex items-center gap-1.5 text-sm text-text">
              <input
                type="radio"
                name="expense-payment-type-filter"
                checked={paymentType === opt.value}
                onChange={() => setPaymentType(opt.value)}
                className="text-primary focus:ring-primary"
              />
              {opt.value != null && (
                <PaymentMethodIcon kind={getPaymentTypeIconKind(opt.value)} className="text-success" />
              )}
              {intl.formatMessage({ id: opt.labelKey })}
            </label>
          ))}
        </div>

        {dayGroups.length === 0 && (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'EXPENSES.HISTORY.EMPTY_STATE' })}
          </InfoBox>
        )}

        <div className="space-y-2">
          {dayGroups.map((dayGroup) => {
            const dayId = dayGroup.dayKey;
            const isExpanded = expandedDayIds.has(dayId);
            return (
              <div key={dayId} className="rounded-lg border border-border bg-background">
                <button
                  type="button"
                  onClick={() => toggleDayPanel(dayId)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                  data-testid={`expense-day-panel-toggle-${dayId}`}
                  aria-expanded={isExpanded}
                >
                  <span className="text-sm font-medium text-text">
                    {formatLocalDate(dayGroup.date)} ({dayGroup.items.length})
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-danger">
                      {formatCurrency(dayGroup.items.reduce((total, e) => total + e.total, 0))}
                    </span>
                    <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <ExpenseList expenses={dayGroup.items} readOnly />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default ExpensesHistoryPage;
