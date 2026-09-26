// Owner dashboard — pure presentation-data helpers for the view (batch 2 of the
// dashboard rework). Everything here works over the ACTIVE, in-window order rows
// the aggregator exposes (`DashboardRangeMetrics.orders`), so no storage/filter
// logic is duplicated:
//
//   - `orderCurrencies`   → currency chips (display order: USD → EUR → CUP → …)
//   - `paymentBreakdown`  → "Distribución por método de pago" donut
//   - `categoryBreakdown` → "Distribución por categoría" donut
//   - `topProducts*`      → the two top-product tables
//   - `formatBucketLabel` → X-axis labels of the range charts (plan §Gráficas)
//
// Currency rule: every helper that aggregates money filters by ONE currency —
// amounts of different currencies are never summed (moneda plan §2).
import type { Currency, Order, SalePaymentMethod } from '@store-mgmt/domain';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { addDays } from '~/shared/lib/date-utils';
import { normalizedOrderPaymentMethod } from '~/shared/lib/payment-method-resolved';
import { orderCurrencyTotals, resolveCurrency } from '~/shared/lib/currency-totals';
import type { RangeBucket, RangeGranularity } from './dashboard-range-aggregator';
import { round2 } from '~/shared/lib/money';

/** One slice of a donut: stable id (payment type / category id), label and value. */
export interface BreakdownSlice {
  id: string;
  name: string;
  value: number;
}

/** One row of a top-products table. `value` is money (profit) or units (quantity). */
export interface TopProductRow {
  id: string;
  name: string;
  value: number;
}

/** Orders of ONE currency (rows arrive already ACTIVE + inside the selected window). */
function ordersOfCurrency(orders: readonly Order[], currency: Currency): Order[] {
  return orders.filter((order) => resolveCurrency(order.currency) === currency);
}

/**
 * Currencies present in the window's orders, in the agreed display order
 * (USD → EUR → CUP → el resto por monto DESC). Feeds the currency chips.
 */
export function orderCurrencies(orders: readonly Order[]): Currency[] {
  const totals = new Map<Currency, number>();
  for (const order of orders) {
    const currency = resolveCurrency(order.currency);
    totals.set(currency, (totals.get(currency) ?? 0) + order.total);
  }
  return orderCurrencyTotals(
    [...totals.entries()].map(([currency, amount]) => ({ currency, amount })),
  ).map((total) => total.currency);
}

/**
 * Method-of-payment split of ONE currency's sales, grouped by the REAL channel
 * (`normalizedOrderPaymentMethod`) exactly like today-stats/cuadre. `labelOf`
 * localizes the resolved method (the view owns the intl keys) — the helper stays
 * pure. Zelle collapses into Transferencia, so `Tarjeta` is unreachable.
 */
export function paymentBreakdown(
  orders: readonly Order[],
  currency: Currency,
  labelOf: (method: SalePaymentMethod) => string,
): BreakdownSlice[] {
  const totals = new Map<SalePaymentMethod, number>();
  for (const order of ordersOfCurrency(orders, currency)) {
    const method = normalizedOrderPaymentMethod(order);
    totals.set(method, (totals.get(method) ?? 0) + order.total);
  }
  return [...totals.entries()]
    .map(([method, value]) => ({
      id: String(method),
      name: labelOf(method),
      value: round2(value),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Category split of ONE currency's sales (item totals, same formula as the cuadre). */
export function categoryBreakdown(orders: readonly Order[], currency: Currency): BreakdownSlice[] {
  const totals = new Map<string, { name: string; value: number }>();
  for (const order of ordersOfCurrency(orders, currency)) {
    for (const item of order.orderItems) {
      const entry = totals.get(item.categoryId) ?? { name: item.categoryName, value: 0 };
      entry.value += round2(item.price * item.quantity);
      totals.set(item.categoryId, entry);
    }
  }
  return [...totals.entries()]
    .map(([categoryId, entry]) => ({
      id: categoryId,
      name: entry.name,
      value: round2(entry.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Product rows of ONE currency, keyed by productId — shared by both tables. */
function productRows(
  orders: readonly Order[],
  currency: Currency,
  valueOf: (item: Order['orderItems'][number]) => number,
): TopProductRow[] {
  const rows = new Map<string, TopProductRow>();
  for (const order of ordersOfCurrency(orders, currency)) {
    for (const item of order.orderItems) {
      const entry = rows.get(item.productId) ?? {
        id: item.productId,
        name: item.productName,
        value: 0,
      };
      entry.value += valueOf(item);
      rows.set(item.productId, entry);
    }
  }
  return [...rows.values()].map((row) => ({ ...row, value: round2(row.value) }));
}

/** "Productos mayor ganancias" — Σ `calculateOrderProfit` per product (decision B1). */
export function topProductsByProfit(
  orders: readonly Order[],
  currency: Currency,
  top = 5,
): TopProductRow[] {
  return productRows(orders, currency, (item) => calculateOrderProfit(item).profit)
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

/** "Productos más vendidos" — Σ units sold per product. */
export function topProductsByQuantity(
  orders: readonly Order[],
  currency: Currency,
  top = 5,
): TopProductRow[] {
  return productRows(orders, currency, (item) => item.quantity)
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

// ─── X-axis labels (master plan §Gráficas) ────────────────────────────────────

const WEEKDAYS_ES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
const MONTHS_ES_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

/**
 * X-axis label of one bucket, per the agreed rules:
 *   - daily, window ≤ 7 days → weekday abbreviation (`Lun` … `Dom`)
 *   - daily, window > 7 days → day of month (`7`, `8`, `9`)
 *   - weekly → `Lun 8 – Dom 14` (inclusive last day = exclusive end − 1)
 *   - monthly → `Sep`
 */
export function formatBucketLabel(
  bucket: RangeBucket,
  granularity: RangeGranularity,
  daysInWindow: number,
): string {
  if (granularity === 'monthly') {
    return MONTHS_ES_SHORT[bucket.start.getMonth()];
  }
  if (granularity === 'weekly') {
    const lastDay = addDays(bucket.end, -1);
    return `${WEEKDAYS_ES_SHORT[bucket.start.getDay()]} ${bucket.start.getDate()} – ${
      WEEKDAYS_ES_SHORT[lastDay.getDay()]
    } ${lastDay.getDate()}`;
  }
  return daysInWindow <= 7
    ? WEEKDAYS_ES_SHORT[bucket.start.getDay()]
    : String(bucket.start.getDate());
}

/** Range label of the tables/titles: `8/9 – 14/9` (local calendar days, no padding). */
export function formatRangeLabel(start: Date, end: Date): string {
  return `${start.getDate()}/${start.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
}
