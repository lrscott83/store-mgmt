import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import {
  collectExpensePaymentMethodKeys,
  matchesExpensePaymentFilter,
  paymentMethodKeyToLabel,
} from '~/shared/lib/payment-filter-options';
import { formatLocalDate, groupByLocalDay, addDays, startOfDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { DateRangeFilter } from '~/shared/components/date-range-filter/date-range-filter';
import { ExpenseOfflineService } from '../lib/services/expense-offline-service';
import { ExpenseList } from '../components/expense-list';
import { formatCurrency } from '~/shared/lib/format-currency';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import {
  MultiStoreSection,
  MultiStoreTotal,
} from '~/shared/components/multistore/multi-store-section';
import {
  readStoreExpenses,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.ExpensesHistory]);

/**
 * Filtro de método de pago DINÁMICO (2026-09-19): las opciones se derivan de
 * los gastos cargados — solo aparecen los métodos realmente presentes
 * ("Transferencia (CUP)" para el legacy Tarjeta, etc.) vía
 * `payment-filter-options`, con "Todas" primero. El estado guarda la CLAVE;
 * si deja de existir en los datos se resetea a null (Todas).
 */

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
  // Filtro de rango de fechas (2026-09-23) — el mismo DateRangeFilter compartido
  // de entries/credits: ventana half-open [start, medianoche siguiente), día
  // final INCLUYENTE. Sin rango → all-time history (paridad Angular).
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  // multi-store-panels: OwnerAdmin + MultiStores + ≥2 tiendas activas → el
  // filtro de método de pago es GLOBAL fuera de los paneles, un panel
  // colapsable por tienda con su acordeón por día y totales fuera de los
  // paneles. Sin MultiStores la vista es idéntica a la original.
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeExpenses, setStoreExpenses] = useState<Map<string, Expense[]>>(new Map());
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);

  // Angular parity (expenses.component.ts `loadExpenses` → `loadExpensesFiltered`): unbounded,
  // all-time load — only the radio filter is wired by the UI (expenseType/date-range params are
  // dead capability). React loads ALL expenses once and applies the payment filter on render
  // (dynamic options + rows from the same dataset).
  async function loadExpenses() {
    const svc = new ExpenseOfflineService(storeId);
    // Rango del usuario (2026-09-23): filterExpensesObservable compara RAW
    // (endDate EXCLUYENTE) — navegar el fin a medianoche del día siguiente
    // para incluir el día seleccionado. Sin rango → all-time (paridad).
    const start = dateRange.start ? startOfDay(dateRange.start) : undefined;
    const end = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : undefined;
    const response = await svc.filterExpensesObservable(undefined, undefined, start, end);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadExpenses reads storeId + the primitive date bounds
  }, [storeId, dateRange.start, dateRange.end]);

  function toggleDayPanel(dayId: string) {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  // multi-store-panels: raw per-store expenses (read-only, per-store DEK);
  // the global payment filter applies across all stores below.
  useEffect(() => {
    if (!multiStoreEnabled) {
      setStoreExpenses(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          return [store.id, readStoreExpenses(store.id, dek)] as const;
        }),
      );
      if (!cancelled) setStoreExpenses(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores]);

  /** Base activo — el filtro de pago se aplica aparte por clave. */
  const multiActiveExpenses = (expenses: Expense[]): Expense[] => expenses.filter((e) => e.isActive);

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    // Rango aplicado también a los datos por tienda (lectura local): ventana
    // half-open [start, medianoche siguiente), día final INCLUYENTE — mismas
    // reglas que el modo single-store y que entries.tsx.
    const rangeStart = dateRange.start ? startOfDay(dateRange.start) : null;
    const rangeEnd = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : null;
    const inDateRange = (e: Expense): boolean =>
      (!rangeStart || new Date(e.date) >= rangeStart) &&
      (!rangeEnd || new Date(e.date) < rangeEnd);

    const visibleStoreIds =
      selectedMultiStoreId === null
        ? multiStoreStores.map((s) => s.id)
        : [selectedMultiStoreId];

    // Opciones dinámicas: métodos presentes en el conjunto visible por el
    // filtro de tienda Y de fechas (con "Todas las tiendas" agrega todas).
    const baseExpenses = visibleStoreIds.flatMap((id) =>
      multiActiveExpenses(storeExpenses.get(id) ?? []).filter(inDateRange),
    );
    const paymentOptions = collectExpensePaymentMethodKeys(baseExpenses);
    const paymentActive =
      paymentKey !== null && paymentOptions.includes(paymentKey) ? paymentKey : null;
    const visibleExpenses = (expenses: Expense[]): Expense[] =>
      multiActiveExpenses(expenses)
        .filter(inDateRange)
        .filter((e) => !paymentActive || matchesExpensePaymentFilter(e, paymentActive));

    const totals = visibleStoreIds.reduce(
      (acc, id) => {
        for (const expense of visibleExpenses(storeExpenses.get(id) ?? [])) {
          acc.count += 1;
          acc.total += expense.total;
        }
        return acc;
      },
      { count: 0, total: 0 },
    );

    return (
      <Card
        padding="tight"
        title={
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {intl.formatMessage({ id: 'EXPENSES.HISTORY.TITLE' })}
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                ({totals.count})
              </span>
            </span>
            <span className="text-sm font-semibold text-danger whitespace-nowrap">
              {formatCurrency(totals.total)}
            </span>
          </div>
        }
      >
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          filters={
            // Petición 2026-09-23: el rango de fechas comparte la MISMA fila que
            // el select de tiendas, alineado a la derecha; el filtro de método
            // de pago queda en su propia fila debajo (MultiStoreSection lo
            // envuelve — flex-wrap — así que este bloque ocupa fila entera).
            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
              <div
                role="radiogroup"
                aria-label={intl.formatMessage({ id: 'EXPENSES.FORM.PAYMENT_TYPE' })}
                className="flex flex-wrap gap-4"
              >
                <label className="flex items-center gap-1.5 text-sm text-text">
                  <input
                    type="radio"
                    name="multistore-expense-payment-type-filter"
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
                      name="multistore-expense-payment-type-filter"
                      checked={paymentActive === key}
                      onChange={() => setPaymentKey(key)}
                      className="text-primary focus:ring-primary"
                    />
                    {paymentMethodKeyToLabel(key)}
                  </label>
                ))}
              </div>
              <DateRangeFilter
                value={dateRange}
                onApply={setDateRange}
                className="ml-auto w-full sm:w-72"
              />
            </div>
          }
          renderStoreCount={(store) => {
            const filtered = visibleExpenses(storeExpenses.get(store.id) ?? []);
            return `(${filtered.length})`;
          }}
          renderStoreTotals={(store) => {
            const filtered = visibleExpenses(storeExpenses.get(store.id) ?? []);
            const total = filtered.reduce((t, e) => t + e.total, 0);
            // Color del precio de ESTA vista: rojo (text-danger), igual que los
            // demás precios de gastos (header y paneles por día).
            return <MultiStoreTotal value={total} valueClassName="text-danger" />;
          }}
        >
          {(store) => {
            const filtered = visibleExpenses(storeExpenses.get(store.id) ?? []);
            if (filtered.length === 0) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                </div>
              );
            }
            // Same day-grouping as the single-store view (newest day first).
            const storeDayGroups = groupByLocalDay(
              filtered,
              (e) => new Date(e.date),
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            );
            return (
              <div className="space-y-2">
                {storeDayGroups.map((dayGroup) => {
                  const key = `${store.id}:${dayGroup.dayKey}`;
                  const isExpanded = expandedDayIds.has(key);
                  return (
                    <div key={key} className="rounded border border-border">
                      <button
                        type="button"
                        onClick={() => toggleDayPanel(key)}
                        className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left"
                        data-testid={`multistore-expense-day-panel-toggle-${store.id}-${dayGroup.dayKey}`}
                        aria-expanded={isExpanded}
                      >
                        <span className="text-xs font-medium text-text">
                          {formatLocalDate(dayGroup.date)} ({dayGroup.items.length})
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-danger whitespace-nowrap">
                            {formatCurrency(dayGroup.items.reduce((total, e) => total + e.total, 0))}
                          </span>
                          <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border px-2 py-2">
                          <ExpenseList expenses={dayGroup.items} readOnly />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }}
        </MultiStoreSection>
      </Card>
    );
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
        {/* Filtro de rango de fechas (2026-09-23) — alineado a la derecha,
            igual que en entries y credits. */}
        <div className="flex justify-end">
          <DateRangeFilter value={dateRange} onApply={setDateRange} className="w-full sm:w-72" />
        </div>

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
