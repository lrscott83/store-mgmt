// Owner dashboard — range aggregator (plan docs/plans/2026-09-16-dashboard-kpi.md).
//
// The core is PURE over plain arrays and each storage path is a THIN adapter:
// single-store reads the selected store through its offline services,
// multi-store reads another store with its explicit DEK (`readStore*` helpers).
// Both adapters feed the same pure core, so the two paths cannot drift apart.
//
// Currency rule (docs/plans/2026-09-17-dashboard-moneda-plan.md): every KPI is
// computed PER CURRENCY — amounts of different currencies are never summed.
// Profit rule (decision B1, plan
// docs/plans/2026-09-17-dashboard-ganancia-monedas-mixtas-plan.md):
// `calculateOrderProfit` subtracts raw values (NO conversion) and each item
// belongs to the SALE's currency group.
//
// Scope notes (master plan):
//   - ALL order types count (Normal, Mayorista, Merma, Ajuste, Otro) — never
//     filter by `type`;
//   - only active rows count (`isActive`);
//   - Créditos por cobrar is GLOBAL (no date filter): a balance, not a flow;
//   - chart buckets: ≤31 days daily, 32–92 weekly (Monday–Sunday), >92 monthly.
import type { Currency, Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { addDays, startOfDay } from '~/shared/lib/date-utils';
import {
  groupAmountsByCurrency,
  orderCurrencyTotals,
  resolveCurrency,
} from '~/shared/lib/currency-totals';
import type { CurrencyTotal } from '~/shared/lib/currency-totals';
import { round2 } from '~/shared/lib/money';
import {
  readStoreExpenses,
  readStoreOrders,
  readStoreSaleCredits,
} from '~/shared/lib/multistore/multi-store-aggregator';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';

/** Half-open local window `[start, end)` — the app-wide range convention. */
export interface RangeWindow {
  start: Date;
  end: Date;
}

/** Chart bucket granularity (master plan §Gráficas). */
export type RangeGranularity = 'daily' | 'weekly' | 'monthly';

/** One chart bucket. Boundaries are clipped to the window for partial edge buckets. */
export interface RangeBucket {
  /** Inclusive start. */
  start: Date;
  /** Exclusive end. */
  end: Date;
}

/** The eight KPIs of one currency group over a window (cards + popups). */
export interface CurrencyRangeMetrics {
  currency: Currency;
  /** Σ total of active orders in the window. */
  salesTotal: number;
  /** Σ total of active expenses in the window (0 without the Expenses module). */
  expensesTotal: number;
  /** Σ `calculateOrderProfit` of every item (raw subtraction — decision B1). */
  grossProfit: number;
  /** grossProfit − expensesTotal. */
  netProfit: number;
  /** grossProfit ÷ salesTotal × 100 (0 when salesTotal = 0). */
  marginPct: number;
  /** Active orders in the window. */
  txnCount: number;
  /** salesTotal ÷ txnCount (0 when txnCount = 0). */
  avgPerTxn: number;
  /** Σ order.itemsCount ÷ txnCount (0 when txnCount = 0). */
  unitsPerTxn: number;
}

/** One bucket of a per-currency KPI series (sparklines). */
export interface CurrencyRangeBucket extends RangeBucket {
  salesTotal: number;
  expensesTotal: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number;
  txnCount: number;
  avgPerTxn: number;
  unitsPerTxn: number;
}

/** Per-currency KPI evolution over the window. */
export interface CurrencyRangeSeries {
  currency: Currency;
  buckets: CurrencyRangeBucket[];
}

/** One bucket of the Créditos por cobrar balance series. */
export interface CurrencyCreditsBucket extends RangeBucket {
  /** Unpaid balance AT the bucket's end instant (a balance, not a flow). */
  balance: number;
}

/** Per-currency unpaid-balance evolution over the window. */
export interface CurrencyCreditsSeries {
  currency: Currency;
  buckets: CurrencyCreditsBucket[];
}

/** Everything the dashboard needs for one store and one window. */
export interface DashboardRangeMetrics {
  window: RangeWindow;
  /** Equal-length window immediately before `window` — the "vs anterior" range. */
  previousWindow: RangeWindow;
  granularity: RangeGranularity;
  /** Bucket boundaries of the window (also needed for empty-data axes). */
  buckets: RangeBucket[];
  /** Per-currency KPIs, in display order (primary first). */
  groups: CurrencyRangeMetrics[];
  /** The group shown on the cards: first of the display order (undefined = no data). */
  primary: CurrencyRangeMetrics | undefined;
  /** Same KPIs for `previousWindow`. */
  previousGroups: CurrencyRangeMetrics[];
  previousPrimary: CurrencyRangeMetrics | undefined;
  /** KPI evolution per currency (display order) — sparkline source. */
  series: CurrencyRangeSeries[];
  /** GLOBAL unpaid credits per currency, NO date filter (display order). */
  creditsReceivable: CurrencyTotal[];
  creditsReceivablePrimary: CurrencyTotal | undefined;
  /**
   * Unpaid credits at `window.start` — i.e. at the END of `previousWindow`.
   * The Créditos por cobrar card is global (no date filter), so this is its
   * only meaningful "vs anterior" value.
   */
  previousCreditsReceivable: CurrencyTotal[];
  /** Unpaid balance at each bucket's end, per currency (display order). */
  creditsSeries: CurrencyCreditsSeries[];
  /** Raw rows for the card popups/donuts/tables: ACTIVE orders inside the window. */
  orders: Order[];
  /** Raw rows for the Gastos popup: ACTIVE expenses inside the window (module-gated). */
  expenses: Expense[];
  /** Raw rows for the Créditos popup: ACTIVE unpaid credits, no date filter (module-gated). */
  unpaidCredits: SaleCredit[];
}

/** Pure input: the store's arrays + window + module flags. */
export interface DashboardRangeInput {
  /** ALL of the store's orders — `isActive` and window filters are applied here. */
  orders: readonly Order[];
  /** ALL of the store's expenses — ignored when `hasExpensesModule` is false. */
  expenses: readonly Expense[];
  /** ALL of the store's sale credits — ignored when `hasCreditsModule` is false. */
  credits: readonly SaleCredit[];
  window: RangeWindow;
  hasExpensesModule: boolean;
  hasCreditsModule: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Number of LOCAL calendar days a half-open window spans, computed from the
 * local calendar parts (not the ms duration) so a DST transition inside the
 * window cannot turn 7 days into 6.96. Never below 1.
 */
export function localDaySpan(window: RangeWindow): number {
  const start = Date.UTC(
    window.start.getFullYear(),
    window.start.getMonth(),
    window.start.getDate(),
  );
  const end = Date.UTC(window.end.getFullYear(), window.end.getMonth(), window.end.getDate());
  return Math.max(1, Math.round((end - start) / MS_PER_DAY));
}

/** Chart bucket granularity of a window (master plan §Gráficas). */
export function resolveGranularity(window: RangeWindow): RangeGranularity {
  const days = localDaySpan(window);
  if (days <= 31) return 'daily';
  if (days <= 92) return 'weekly';
  return 'monthly';
}

/**
 * The equal-length window immediately before `window`: both bounds are shifted
 * back by the window's LOCAL day span (calendar arithmetic, so a DST transition
 * inside the window cannot skew the shift).
 */
export function previousRangeWindow(window: RangeWindow): RangeWindow {
  const days = localDaySpan(window);
  return { start: addDays(window.start, -days), end: addDays(window.end, -days) };
}

/** Monday (local midnight) of the week containing `date`. */
function startOfWeekMonday(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7; // Sunday (0) → 6, Monday (1) → 0
  return addDays(day, -offset);
}

function bucketAnchor(date: Date, granularity: RangeGranularity): Date {
  if (granularity === 'weekly') return startOfWeekMonday(date);
  if (granularity === 'monthly') return new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfDay(date);
}

function nextBucket(anchor: Date, granularity: RangeGranularity): Date {
  if (granularity === 'weekly') return addDays(anchor, 7);
  if (granularity === 'monthly') return new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return addDays(anchor, 1);
}

/**
 * Buckets of the window per the chart rule. Buckets are aligned to local
 * calendar units (midnight / Monday / first-of-month) and clipped to the window,
 * so a range starting or ending mid-week/month still yields partial edge buckets.
 */
export function buildRangeBuckets(window: RangeWindow): RangeBucket[] {
  const granularity = resolveGranularity(window);
  const buckets: RangeBucket[] = [];
  let anchor = bucketAnchor(window.start, granularity);
  while (anchor < window.end) {
    const next = nextBucket(anchor, granularity);
    const start = anchor < window.start ? window.start : anchor;
    const end = next > window.end ? window.end : next;
    if (end > start) buckets.push({ start, end });
    anchor = next;
  }
  return buckets;
}

/** True when `instant` falls inside the half-open window `[start, end)`. */
function isWithinWindow(instant: Date, window: RangeWindow): boolean {
  return instant >= window.start && instant < window.end;
}

/** The eight KPIs of one currency over one set of already-filtered rows. */
function metricsFor(
  currency: Currency,
  orders: readonly Order[],
  expenses: readonly Expense[],
): CurrencyRangeMetrics {
  const salesTotal = round2(orders.reduce((sum, order) => sum + order.total, 0));
  const expensesTotal = round2(expenses.reduce((sum, expense) => sum + expense.total, 0));
  const grossProfit = round2(
    orders.reduce(
      (sum, order) =>
        sum +
        order.orderItems.reduce((itemSum, item) => itemSum + calculateOrderProfit(item).profit, 0),
      0,
    ),
  );
  const netProfit = round2(grossProfit - expensesTotal);
  const marginPct = salesTotal === 0 ? 0 : (grossProfit / salesTotal) * 100;
  const txnCount = orders.length;
  const unitsTotal = orders.reduce((sum, order) => sum + order.itemsCount, 0);
  return {
    currency,
    salesTotal,
    expensesTotal,
    grossProfit,
    netProfit,
    marginPct,
    txnCount,
    avgPerTxn: txnCount === 0 ? 0 : salesTotal / txnCount,
    unitsPerTxn: txnCount === 0 ? 0 : unitsTotal / txnCount,
  };
}

/** ACTIVE rows of the window (the raw rows every aggregation below starts from). */
function filterActiveBetween<T extends { isActive: boolean; date: Date }>(
  rows: readonly T[],
  window: RangeWindow,
): T[] {
  return rows.filter((row) => row.isActive && isWithinWindow(row.date, window));
}

/** Rows of an already-filtered list, grouped by the row's currency (`?? DEFAULT_CURRENCY`). */
function groupByCurrency<T extends { currency?: Currency }>(
  rows: readonly T[],
): Map<Currency, T[]> {
  const grouped = new Map<Currency, T[]>();
  for (const row of rows) {
    const currency = resolveCurrency(row.currency);
    const bucket = grouped.get(currency);
    if (bucket) bucket.push(row);
    else grouped.set(currency, [row]);
  }
  return grouped;
}

/**
 * Per-currency KPIs, in display order. The magnitude ranking the currencies
 * outside the fixed USD/EUR/CUP priority is `salesTotal` — the dashboard's main
 * money flow ("USD → EUR → CUP → la de mayor monto"). An expense-only currency
 * still forms its own group (Ventas 0, Gastos > 0) instead of being dropped.
 */
function buildGroups(
  orders: Map<Currency, Order[]>,
  expenses: Map<Currency, Expense[]>,
): CurrencyRangeMetrics[] {
  const currencies = new Set<Currency>([...orders.keys(), ...expenses.keys()]);
  const rows = [...currencies].map((currency) => ({
    currency,
    amount: (orders.get(currency) ?? []).reduce((sum, order) => sum + order.total, 0),
  }));
  return orderCurrencyTotals(rows).map(({ currency }) =>
    metricsFor(currency, orders.get(currency) ?? [], expenses.get(currency) ?? []),
  );
}

/** KPI evolution of one currency over the window's buckets. */
function buildCurrencySeries(
  currency: Currency,
  orders: readonly Order[],
  expenses: readonly Expense[],
  buckets: readonly RangeBucket[],
): CurrencyRangeSeries {
  return {
    currency,
    buckets: buckets.map((bucket) => {
      const { currency: _currency, ...metrics } = metricsFor(
        currency,
        orders.filter((order) => isWithinWindow(order.date, bucket)),
        expenses.filter((expense) => isWithinWindow(expense.date, bucket)),
      );
      return { start: bucket.start, end: bucket.end, ...metrics };
    }),
  };
}

/**
 * A credit still owed at `instant`: active, created on/before the instant, and
 * not paid by then (`!isPaid`, or `paidDate` strictly after the instant).
 */
function isUnpaidAt(credit: SaleCredit, instant: Date): boolean {
  if (!credit.isActive || credit.date > instant) return false;
  if (!credit.isPaid) return true;
  // Runtime may hold null/undefined for unpaid credits (model types it as Date).
  const paidDate: unknown = credit.paidDate;
  return paidDate instanceof Date && paidDate > instant;
}

/** Per-currency totals over the given credit rows, display-ordered and rounded. */
function creditTotals(credits: readonly SaleCredit[]): CurrencyTotal[] {
  return orderCurrencyTotals(
    groupAmountsByCurrency(
      credits.map((credit) => ({ amount: credit.total, currency: credit.currency })),
    ),
  ).map((total) => ({ ...total, amount: round2(total.amount) }));
}

/** GLOBAL unpaid balance per currency — active credits with `!isPaid`, NO date filter. */
function buildCreditsReceivable(credits: readonly SaleCredit[]): CurrencyTotal[] {
  return creditTotals(credits.filter((credit) => credit.isActive && !credit.isPaid));
}

/**
 * Unpaid balance at `instant`, per currency (plan option b): Σ active credits
 * created on/before the instant that were not yet paid by then. It is a BALANCE,
 * so debts created before the window count too.
 */
function buildCreditsReceivableAt(credits: readonly SaleCredit[], instant: Date): CurrencyTotal[] {
  return creditTotals(credits.filter((credit) => isUnpaidAt(credit, instant)));
}

/** Amount of one currency inside a totals list (0 when the currency is absent). */
function amountOf(totals: readonly CurrencyTotal[], currency: Currency): number {
  return totals.find((total) => total.currency === currency)?.amount ?? 0;
}

/** Aggregates one store's arrays into every KPI, balance and series of the dashboard. */
export function computeDashboardRange(input: DashboardRangeInput): DashboardRangeMetrics {
  const { window, hasExpensesModule, hasCreditsModule } = input;
  const previousWindow = previousRangeWindow(window);
  const buckets = buildRangeBuckets(window);

  // Raw rows the popups/donuts/tables read: ACTIVE rows of the window. Without
  // the module the expenses/credits rows are empty, so nothing downstream can
  // leak them past the gate.
  const orders = filterActiveBetween(input.orders, window);
  const expenses = hasExpensesModule ? filterActiveBetween(input.expenses, window) : [];
  const unpaidCredits = hasCreditsModule
    ? input.credits.filter((credit) => credit.isActive && !credit.isPaid)
    : [];

  const currentOrders = groupByCurrency(orders);
  const currentExpenses = groupByCurrency(expenses);
  const groups = buildGroups(currentOrders, currentExpenses);

  const previousOrders = groupByCurrency(filterActiveBetween(input.orders, previousWindow));
  const previousExpenses = groupByCurrency(
    hasExpensesModule ? filterActiveBetween(input.expenses, previousWindow) : [],
  );
  const previousGroups = buildGroups(previousOrders, previousExpenses);

  const series = groups.map((group) =>
    buildCurrencySeries(
      group.currency,
      currentOrders.get(group.currency) ?? [],
      currentExpenses.get(group.currency) ?? [],
      buckets,
    ),
  );

  const creditsReceivable = hasCreditsModule ? buildCreditsReceivable(input.credits) : [];
  const creditsSeries = hasCreditsModule
    ? creditsReceivable.map((total) => ({
        currency: total.currency,
        buckets: buckets.map((bucket) => ({
          start: bucket.start,
          end: bucket.end,
          // Balance at the bucket end, computed over ALL credits (the balance is
          // global) and read back for this currency.
          balance: amountOf(buildCreditsReceivableAt(input.credits, bucket.end), total.currency),
        })),
      }))
    : [];

  const previousCreditsReceivable = hasCreditsModule
    ? buildCreditsReceivableAt(input.credits, window.start)
    : [];

  return {
    window,
    previousWindow,
    granularity: resolveGranularity(window),
    buckets,
    groups,
    primary: groups[0],
    previousGroups,
    previousPrimary: previousGroups[0],
    series,
    creditsReceivable,
    creditsReceivablePrimary: creditsReceivable[0],
    previousCreditsReceivable,
    creditsSeries,
    orders,
    expenses,
    unpaidCredits,
  };
}

/**
 * Single-store adapter: the SELECTED store reads through its offline services —
 * the in-memory DEK belongs to that store, so the service path is the correct one.
 */
export function computeSingleStoreDashboardRange(
  storeId: string,
  window: RangeWindow,
  hasExpensesModule: boolean,
  hasCreditsModule: boolean,
): DashboardRangeMetrics {
  return computeDashboardRange({
    orders: new OrderOfflineService(storeId).getStorageOrders(),
    expenses: hasExpensesModule ? new ExpenseOfflineService(storeId).getStorageExpenses() : [],
    credits: hasCreditsModule ? new SaleCreditOfflineService(storeId).getStorageSaleCredits() : [],
    window,
    hasExpensesModule,
    hasCreditsModule,
  });
}

/**
 * Multi-store adapter: another store's local data, read with that store's
 * EXPLICIT DEK. Never the offline services — pointing them at another store
 * would take their auto-init write path through the selected store's DEK and
 * corrupt the other store's data (see multi-store-aggregator's module doc).
 */
export function computeMultiStoreDashboardRange(
  storeId: string,
  dek: Uint8Array | null,
  window: RangeWindow,
  hasExpensesModule: boolean,
  hasCreditsModule: boolean,
): DashboardRangeMetrics {
  return computeDashboardRange({
    orders: readStoreOrders(storeId, dek),
    expenses: hasExpensesModule ? readStoreExpenses(storeId, dek) : [],
    credits: hasCreditsModule ? readStoreSaleCredits(storeId, dek) : [],
    window,
    hasExpensesModule,
    hasCreditsModule,
  });
}

// ─── Cross-store merge (multi-store general view) ─────────────────────────────

/** Raw sums of one currency across stores; ratios are derived after the sum. */
interface RangeAccumulator {
  salesTotal: number;
  expensesTotal: number;
  grossProfit: number;
  txnCount: number;
  unitsTotal: number;
}

function emptyRangeAccumulator(): RangeAccumulator {
  return { salesTotal: 0, expensesTotal: 0, grossProfit: 0, txnCount: 0, unitsTotal: 0 };
}

/** Derived KPIs of one accumulated currency (same formulas as the single-store path). */
function metricsFromAccumulator(
  currency: Currency,
  accumulator: RangeAccumulator,
): CurrencyRangeMetrics {
  const salesTotal = round2(accumulator.salesTotal);
  const expensesTotal = round2(accumulator.expensesTotal);
  const grossProfit = round2(accumulator.grossProfit);
  const netProfit = round2(grossProfit - expensesTotal);
  const txnCount = accumulator.txnCount;
  return {
    currency,
    salesTotal,
    expensesTotal,
    grossProfit,
    netProfit,
    marginPct: salesTotal === 0 ? 0 : (grossProfit / salesTotal) * 100,
    txnCount,
    avgPerTxn: txnCount === 0 ? 0 : salesTotal / txnCount,
    unitsPerTxn: txnCount === 0 ? 0 : accumulator.unitsTotal / txnCount,
  };
}

/** Sums per-currency KPI groups across stores and re-applies the display order. */
function mergeCurrencyMetrics(
  groupsPerStore: readonly (readonly CurrencyRangeMetrics[])[],
): CurrencyRangeMetrics[] {
  const accumulators = new Map<Currency, RangeAccumulator>();
  for (const groups of groupsPerStore) {
    for (const group of groups) {
      const accumulator = accumulators.get(group.currency) ?? emptyRangeAccumulator();
      accumulator.salesTotal += group.salesTotal;
      accumulator.expensesTotal += group.expensesTotal;
      accumulator.grossProfit += group.grossProfit;
      accumulator.txnCount += group.txnCount;
      // Units are not a KPI field of their own: rebuild the sum from units/txn.
      accumulator.unitsTotal += group.unitsPerTxn * group.txnCount;
      accumulators.set(group.currency, accumulator);
    }
  }
  const rows = [...accumulators.entries()].map(([currency, accumulator]) => ({
    currency,
    amount: accumulator.salesTotal,
  }));
  return orderCurrencyTotals(rows).map(({ currency }) =>
    metricsFromAccumulator(currency, accumulators.get(currency)!),
  );
}

/** Sums per-currency KPI series bucket-by-bucket (all stores share the window). */
function mergeCurrencySeries(
  list: readonly DashboardRangeMetrics[],
  currencies: readonly Currency[],
): CurrencyRangeSeries[] {
  return currencies.map((currency) => ({
    currency,
    buckets: list[0].buckets.map((bucket, index) => {
      const accumulator = emptyRangeAccumulator();
      for (const metrics of list) {
        const bucketRow = metrics.series.find((series) => series.currency === currency)?.buckets[
          index
        ];
        if (!bucketRow) continue;
        accumulator.salesTotal += bucketRow.salesTotal;
        accumulator.expensesTotal += bucketRow.expensesTotal;
        accumulator.grossProfit += bucketRow.grossProfit;
        accumulator.txnCount += bucketRow.txnCount;
        accumulator.unitsTotal += bucketRow.unitsPerTxn * bucketRow.txnCount;
      }
      const { currency: _currency, ...bucketMetrics } = metricsFromAccumulator(
        currency,
        accumulator,
      );
      return { start: bucket.start, end: bucket.end, ...bucketMetrics };
    }),
  }));
}

/** Sums per-currency totals (credits balances) across stores, display-ordered. */
function mergeCurrencyTotals(lists: readonly (readonly CurrencyTotal[])[]): CurrencyTotal[] {
  const entries = lists.flat().map((total) => ({ amount: total.amount, currency: total.currency }));
  return orderCurrencyTotals(groupAmountsByCurrency(entries)).map((total) => ({
    ...total,
    amount: round2(total.amount),
  }));
}

/** Sums the credits balance series bucket-by-bucket across stores. */
function mergeCreditsSeries(
  list: readonly DashboardRangeMetrics[],
  currencies: readonly Currency[],
): CurrencyCreditsSeries[] {
  return currencies.map((currency) => ({
    currency,
    buckets: list[0].buckets.map((bucket, index) => ({
      start: bucket.start,
      end: bucket.end,
      balance: round2(
        list.reduce((sum, metrics) => {
          const bucketRow = metrics.creditsSeries.find((series) => series.currency === currency)
            ?.buckets[index];
          return sum + (bucketRow?.balance ?? 0);
        }, 0),
      ),
    })),
  }));
}

/**
 * Cross-store merge for the multi-store GENERAL view (the user's "todas las
 * tiendas" aggregate): every monetary aggregate is summed PER CURRENCY — amounts
 * of different currencies are never added together — then the derived ratios and
 * the display order are rebuilt exactly as the single-store path does.
 *
 * All entries must belong to the SAME window (they come from one selected range),
 * so the bucket boundaries of the first entry are authoritative. Requires a
 * non-empty list.
 */
export function mergeDashboardRangeMetrics(
  list: readonly DashboardRangeMetrics[],
): DashboardRangeMetrics {
  const first = list[0];
  if (!first) {
    throw new Error('mergeDashboardRangeMetrics requires at least one store');
  }
  const groups = mergeCurrencyMetrics(list.map((metrics) => metrics.groups));
  const previousGroups = mergeCurrencyMetrics(list.map((metrics) => metrics.previousGroups));
  const creditsReceivable = mergeCurrencyTotals(list.map((metrics) => metrics.creditsReceivable));
  const previousCreditsReceivable = mergeCurrencyTotals(
    list.map((metrics) => metrics.previousCreditsReceivable),
  );
  return {
    window: first.window,
    previousWindow: first.previousWindow,
    granularity: first.granularity,
    buckets: first.buckets,
    groups,
    primary: groups[0],
    previousGroups,
    previousPrimary: previousGroups[0],
    series: mergeCurrencySeries(
      list,
      groups.map((group) => group.currency),
    ),
    creditsReceivable,
    creditsReceivablePrimary: creditsReceivable[0],
    previousCreditsReceivable,
    creditsSeries: mergeCreditsSeries(
      list,
      creditsReceivable.map((total) => total.currency),
    ),
    orders: list.flatMap((metrics) => metrics.orders),
    expenses: list.flatMap((metrics) => metrics.expenses),
    unpaidCredits: list.flatMap((metrics) => metrics.unpaidCredits),
  };
}
