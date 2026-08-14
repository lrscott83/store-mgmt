import type { InventoryEntry, Order, Product } from '@store-mgmt/domain';
import { addDays, startOfDay } from '~/shared/lib/date-utils';
import type { InventoryTodaySaleRow } from './inventory-today-sale-pdf';

/**
 * Input bundle for {@link generateProductRowsForDate}. The caller (the
 * sales-history view) passes the same active products, active-only orders, and
 * raw per-product entries the today report would use, plus a LOCAL calendar
 * `day` (a Date at local noon) for the target day group.
 */
export interface GenerateProductRowsForDateInput {
  /** Active products (from `ProductRepository.getAvailableProducts`). */
  products: Product[];
  /** Active orders — the caller pre-filters `isActive === true`. */
  orders: Order[];
  /** Raw per-product entries (from `getProductInventoriesByProductId`), keyed by product id. */
  inventories: ReadonlyMap<string, InventoryEntry[]>;
  /** Local calendar day (local noon) whose report is being built. */
  day: Date;
}

/**
 * Result of {@link generateProductRowsForDate}: the 13-column ledger rows plus
 * the names of products whose stock columns rest on suspect entries (flagged,
 * never silently clamped away).
 */
export interface DayReportResult {
  rows: InventoryTodaySaleRow[];
  suspectProductNames: string[];
}

/**
 * `generateProductRowsForDate` — per-day sibling of `generateProductRows`
 * (generate-product-rows.ts): rebuilds the same 13-column inventory-at-sale-price
 * ledger for ONE past LOCAL day instead of today. Every column reflects THAT day's
 * data, never current stock. The day window is `[startOfDay(day), addDays(startOfDay(day), 1))`
 * — the same LOCAL boundaries the offline day services (`getActiveOrdersInDay`,
 * `getInventoryEntriesInDay`, ...) use, so the view's grouping and the report agree.
 *
 * The day's own columns (entrada, vendido, precioVenta, ...) come only from
 * orders and entries inside that local window. Stock reconstruction is the mirror
 * image of the FIFO ledger: for an entry `e` created on or before the day,
 * `availableAtEndOfDay(e) = e.available + consumedAfter(e)`, where `consumedAfter(e)`
 * is the sum of `productCosts.quantity` for `e.id` across active orders dated strictly
 * AFTER the day — the consumption recorded at sale time that the FIFO decrements have
 * since subtracted from `e.available`. Adding it back restores the entry to what it
 * held at the end of the day.
 *
 * Suspect detection: an entry is suspect when it was touched (`updatedDate`) on/after
 * the day, or its reconstructed stock exceeds its received `quantity`. Suspect products
 * are surfaced (not clamped away) so the user can judge the reconstruction themselves.
 *
 * Reduce-to-today invariant: with `day` equal to today (local), the rows are identical
 * to `generateProductRows` called with equivalent service fakes built from the same data
 * (pinned by generate-product-rows-for-date.test.ts).
 */
export function generateProductRowsForDate(input: GenerateProductRowsForDateInput): DayReportResult {
  const { products, orders, inventories, day } = input;

  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const isInDay = (d: Date): boolean => d >= dayStart && d < dayEnd;

  const dayOrders = orders.filter((o) => o.isActive && isInDay(o.date));
  const afterDayOrders = orders.filter((o) => o.isActive && o.date >= dayEnd);

  // Per-entry quantity consumed by active orders dated strictly AFTER the day — keyed by
  // entry id so the FIFO consumption ledger can be reversed for any entry.
  const consumedAfterByEntry = new Map<string, number>();
  for (const order of afterDayOrders) {
    for (const item of order.orderItems) {
      for (const cost of item.productCosts) {
        consumedAfterByEntry.set(
          cost.inventoryId,
          (consumedAfterByEntry.get(cost.inventoryId) ?? 0) + cost.quantity,
        );
      }
    }
  }

  // `updatedDate` is typed `Date | undefined` on the domain model, but inventory revival
  // hydrates only `date` — an edited/deactivated entry's `updatedDate` may still be the
  // RAW stored string. `new Date` accepts both, so parse defensively and bail on anything
  // absent or unparseable (a "touched after" signal we cannot read is not evidence).
  const wasTouchedAfter = (entry: InventoryEntry, threshold: Date): boolean => {
    if (entry.updatedDate === undefined) return false;
    const parsed = new Date(entry.updatedDate);
    return !Number.isNaN(parsed.getTime()) && parsed >= threshold;
  };

  const availableAtEndOfDay = (entry: InventoryEntry): number =>
    entry.available + (consumedAfterByEntry.get(entry.id) ?? 0);

  const suspectProductNames: string[] = [];

  const rows = products.map((prod) => {
    const soldItems = dayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);
    const vendido = soldItems.reduce((total, oi) => total + oi.quantity, 0);
    const precioVenta =
      soldItems.length > 0 ? soldItems.reduce((total, oi) => total + oi.price, 0) / soldItems.length : 0;
    const importeVenta = vendido * precioVenta;

    const entries = inventories.get(prod.id) ?? [];
    const existedByDay = entries.filter((e) => e.date < dayEnd);

    // `available` (the "Final" basis) sums reconstructed end-of-day stock ONLY over
    // active entries — inactive rows never contribute. Suspects are flagged, not clamped.
    let available = 0;
    let isSuspect = false;
    for (const entry of existedByDay) {
      if (wasTouchedAfter(entry, dayEnd) || availableAtEndOfDay(entry) > entry.quantity) {
        isSuspect = true;
      }
      if (entry.isActive) available += availableAtEndOfDay(entry);
    }
    if (isSuspect) suspectProductNames.push(prod.name);

    // Entrada counts only ACTIVE entries dated inside the day.
    const entrada = entries.filter((e) => e.isActive && isInDay(e.date)).reduce((total, e) => total + e.quantity, 0);
    const disponible = available + vendido;
    const inicio = disponible - entrada;

    // Cost entries mirror the today report: any entry existing by the day with positive
    // end-of-day stock (no isActive filter), weighted by RECEIVED quantity.
    const costEntries = existedByDay.filter((e) => availableAtEndOfDay(e) > 0);
    const costoUnitario =
      costEntries.length > 0
        ? costEntries.reduce((total, e) => total + e.costPrice * e.quantity, 0) /
          costEntries.reduce((total, e) => total + e.quantity, 0)
        : 0;
    const costoTotal = vendido * costoUnitario;
    const cpVenta = importeVenta > 0 ? costoTotal / importeVenta : 0;
    const final = disponible - vendido;
    const importeFinal = final * costoUnitario;

    return {
      productId: prod.id,
      productName: prod.name,
      unit: 'U',
      inicio,
      entrada,
      disponible,
      vendido,
      precioVenta,
      importeVenta,
      costoUnitario,
      costoTotal,
      cpVenta,
      final,
      importeFinal,
    };
  });

  return { rows, suspectProductNames };
}