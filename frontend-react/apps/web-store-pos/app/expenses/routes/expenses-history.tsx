import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { EFeatures, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon, PaymentMethodIcon } from '~/shared/components/ui/icons';
import { getPaymentTypeIconKind } from '~/shared/lib/payment-type-icon';
import {
  collectExpensePaymentMethodKeys,
  matchesExpensePaymentFilter,
  paymentMethodKeyToLabel,
  paymentMethodKeyToSalePaymentMethod,
} from '~/shared/lib/payment-filter-options';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { ExpenseOfflineService } from '../lib/services/expense-offline-service';
import { ExpenseList } from '../components/expense-list';
import { formatCurrency } from '~/shared/lib/format-currency';

export const clientLoader = featureLoader([EFeatures.ExpensesHistory]);

/**
 * Filtro de método de pago DINÁMICO (2026-09-19): las opciones se derivan de
 * los gastos cargados — solo aparecen los métodos realmente presentes
 * ("Transferencia (CUP)" para el legacy Tarjeta, etc.) vía
 * `payment-filter-options`, con "Todas" primero. El estado guarda la CLAVE;
 * si deja de existir en los datos se resetea a null (Todas).
 */

/** Glyph legacy equivalente para el icono del radio (mismos SVG que hoy). */
function legacyKindFor(saleMethod: SalePaymentMethod): PaymentType {
  switch (saleMethod) {
    case SalePaymentMethod.Transferencia:
      return PaymentType.Tarjeta;
    case SalePaymentMethod.Zelle:
      return PaymentType.Zelle;
    default:
      return PaymentType.Efectivo;
  }
}

/**
 * Matches Angular's `expenses.component.html`/`.ts` (Historial de Gastos).
 *
 * Angular's `loadExpenses()` always calls `loadExpensesFiltered(this.expenseType, ...)` with
 * `expenseType` permanently `null` (no UI control ever sets it — dead capability, confirmed:
 * `filterExpensesObservable`'s `expenseType`/date-range params have no wired control anywhere
 * in the template). Only the `paymentType` radio group is live. React mirrors the live
 * capability with the 2026-09-19 dynamic options: all expenses are loaded once (unbounded,
 * all-time history) and the payment filter is applied on render from the SAME data that
 * feeds the options — no double loading pass, options and rows never diverge.
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

  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [dayGroups, setDayGroups] = useState<LocalDayGroup<Expense>[]>([]);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());

  // Angular parity (expenses.component.ts `loadExpenses` → `loadExpensesFiltered`): unbounded,
  // all-time load — only the radio filter is wired by the UI (expenseType/date-range params are
  // dead capability). React loads ALL expenses once and applies the payment filter on render
  // (dynamic options + rows from the same dataset).
  async function loadExpenses() {
    const svc = new ExpenseOfflineService(storeId);
    const response = await svc.filterExpensesObservable(undefined, undefined, undefined, undefined);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadExpenses reads only storeId
  }, [storeId]);

  function toggleDayPanel(dayId: string) {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  const allExpenses = dayGroups.flatMap((g) => g.items);
  const paymentOptions = collectExpensePaymentMethodKeys(allExpenses);
  const paymentActive =
    paymentKey !== null && paymentOptions.includes(paymentKey) ? paymentKey : null;
  const visibleDayGroups: LocalDayGroup<Expense>[] = paymentActive
    ? dayGroups
        .map((g) => ({
          ...g,
          items: g.items.filter((e) => matchesExpensePaymentFilter(e, paymentActive)),
        }))
        .filter((g) => g.items.length > 0)
    : dayGroups;

  const expensesCount = visibleDayGroups.reduce((count, d) => count + d.items.length, 0);
  const expensesTotal = visibleDayGroups.reduce(
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
          <span className="text-sm font-semibold text-danger whitespace-nowrap">
            {formatCurrency(expensesTotal)}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Payment-type filter — dynamic options from the loaded expenses
            (Angular's mat-radio-group, options now reflect the actual data). */}
        <div
          role="radiogroup"
          aria-label={intl.formatMessage({ id: 'EXPENSES.FORM.PAYMENT_TYPE' })}
          className="flex flex-wrap gap-4"
        >
          <label className="flex items-center gap-1.5 text-sm text-text">
            <input
              type="radio"
              name="expense-payment-type-filter"
              checked={paymentActive === null}
              onChange={() => setPaymentKey(null)}
              className="text-primary focus:ring-primary"
            />
            {intl.formatMessage({ id: 'GENERAL.ALL' })}
          </label>
          {paymentOptions.map((key) => (
            <label key={key} className="flex items-center gap-1.5 text-sm text-text">
              <input
                type="radio"
                name="expense-payment-type-filter"
                checked={paymentActive === key}
                onChange={() => setPaymentKey(key)}
                className="text-primary focus:ring-primary"
              />
              <PaymentMethodIcon
                kind={getPaymentTypeIconKind(legacyKindFor(paymentMethodKeyToSalePaymentMethod(key)))}
                className="text-success"
              />
              {paymentMethodKeyToLabel(key)}
            </label>
          ))}
        </div>

        {visibleDayGroups.length === 0 && (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'EXPENSES.HISTORY.EMPTY_STATE' })}
          </InfoBox>
        )}

        <div className="space-y-2">
          {visibleDayGroups.map((dayGroup) => {
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
                    <span className="text-sm font-semibold text-danger whitespace-nowrap">
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
