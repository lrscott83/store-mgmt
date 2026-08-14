import type { InventoryEntry, Order, Product } from '@store-mgmt/domain';
import { isInLocalDay, localDayRange } from '~/shared/lib/date-utils';
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
 * The day's own orders — active orders whose `date` falls inside the LOCAL
 * calendar window of `day` (via `isInLocalDay`). They drive the day's sold
 * (`vendido`) and sale-price (`precioVenta`/`importeVenta`) columns.
 */
export function getActiveOrdersOfDay(orders: Order[], day: Date): Order[] {
  return orders.filter((o) => o.isActive && isInLocalDay(o.date, day));
}

/**
 * The day's own inventory entries: every ACTIVE entry dated inside the LOCAL day,
 * collected across every product bucket. Mirrors `getActiveOrdersOfDay` for the
 * "entrada" column source.
 */
export function getEntriesOfDay(
  inventories: ReadonlyMap<string, InventoryEntry[]>,
  day: Date,
): InventoryEntry[] {
  const result: InventoryEntry[] = [];
  for (const entries of inventories.values()) {
    for (const entry of entries) {
      if (entry.isActive && isInLocalDay(entry.date, day)) result.push(entry);
    }
  }
  return result;
}

/**
 * FIFO consumption ledger reversal — the quantity of each inventory entry sold
 * by ACTIVE orders dated strictly AFTER the day (`date >= dayEnd`, the day's
 * closing local midnight), summed per `cost.inventoryId` across every
 * `orderItems[].productCosts`. The consumption recorded at sale time is exactly
 * what the FIFO decrements have since subtracted from the entry's live
 * `available`; adding it back restores the entry to what it held at the end of
 * the day.
 */
export function getConsumedAfterDayByEntry(orders: Order[], day: Date): ReadonlyMap<string, number> {
  const { end: dayEnd } = localDayRange(day);
  const consumedAfterByEntry = new Map<string, number>();
  for (const order of orders) {
    if (!order.isActive || order.date < dayEnd) continue;
    for (const item of order.orderItems) {
      for (const cost of item.productCosts) {
        consumedAfterByEntry.set(
          cost.inventoryId,
          (consumedAfterByEntry.get(cost.inventoryId) ?? 0) + cost.quantity,
        );
      }
    }
  }
  return consumedAfterByEntry;
}

/**
 * True when an entry was "touched" on or after `threshold`.
 *
 * `updatedDate` is typed `Date | undefined` on the domain model, but inventory revival
 * hydrates only `date` — an edited/deactivated entry's `updatedDate` may still be the
 * RAW stored string. `new Date` accepts both, so parse defensively and bail on anything
 * absent or unparseable (a "touched after" signal we cannot read is not evidence).
 */
export function wasTouchedAfter(entry: InventoryEntry, threshold: Date): boolean {
  if (entry.updatedDate === undefined) return false;
  const parsed = new Date(entry.updatedDate);
  return !Number.isNaN(parsed.getTime()) && parsed >= threshold;
}

/**
 * Reconstructed end-of-day stock of an entry: its live `available` plus whatever
 * {@link getConsumedAfterDayByEntry} recorded for its id (a missing key leaves the
 * available untouched — `?? 0`).
 */
export function availableAtEndOfDay(
  entry: InventoryEntry,
  consumedAfterByEntry: ReadonlyMap<string, number>,
): number {
  return entry.available + (consumedAfterByEntry.get(entry.id) ?? 0);
}

/**
 * An inventory entry as it stood at the close of a LOCAL day: the raw entry plus
 * its reconstructed end-of-day stock (see {@link availableAtEndOfDay}).
 *
 * `isSuspect` flags an entry that was touched on/after the day's closing midnight
 * (`wasTouchedAfter`) or whose reconstructed stock exceeds its received `quantity` —
 * flagged, never clamped.
 */
export interface EntryAtDay {
  entry: InventoryEntry;
  availableAtEndOfDay: number;
  isSuspect: boolean;
}

/**
 * The stock snapshot for a day: every entry that EXISTED by the day
 * (`date < dayEnd`, the day's closing local midnight — entries dated on the day
 * itself are included), each carrying its reconstructed end-of-day stock and the
 * `isSuspect` flag (see {@link EntryAtDay}).
 */
export function reconstructEntriesAtDay(
  entries: InventoryEntry[],
  day: Date,
  consumedAfterByEntry: ReadonlyMap<string, number>,
): EntryAtDay[] {
  const { end: dayEnd } = localDayRange(day);
  return entries
    .filter((e) => e.date < dayEnd)
    .map((entry) => ({
      entry,
      availableAtEndOfDay: availableAtEndOfDay(entry, consumedAfterByEntry),
      isSuspect:
        wasTouchedAfter(entry, dayEnd) || availableAtEndOfDay(entry, consumedAfterByEntry) > entry.quantity,
    }));
}

/**
 * `generateProductRowsForDate` — per-day sibling of `generateProductRows`
 * (generate-product-rows.ts): rebuilds the same 13-column inventory-at-sale-price
 * ledger for ONE past LOCAL day instead of today. Every column reflects THAT day's
 * data, never current stock. The day window is `localDayRange(day)` — the same
 * LOCAL boundaries the offline day services (`getActiveOrdersInDay`,
 * `getInventoryEntriesInDay`, ...) use, so the view's grouping and the report agree.
 * It is composed from the exported helpers above (`getActiveOrdersOfDay`,
 * `getConsumedAfterDayByEntry`, `wasTouchedAfter`, `availableAtEndOfDay`,
 * `reconstructEntriesAtDay`), so the reconstruction math is unit-testable on its own.
 *
 * The day's own columns (entrada, vendido, precioVenta, ...) come only from
 * orders and entries inside that local window. Stock reconstruction is the mirror
 * image of the FIFO ledger: for an entry `e` created on or before the day,
 * `availableAtEndOfDay(e) = e.available + consumedAfter(e)`, where `consumedAfter(e)`
 * (from `getConsumedAfterDayByEntry`) is the sum of `productCosts.quantity` for `e.id`
 * across active orders dated strictly AFTER the day — the consumption recorded at sale
 * time that the FIFO decrements have since subtracted from `e.available`. Adding it back
 * restores the entry to what it held at the end of the day (`reconstructEntriesAtDay`).
 *
 * Suspect detection: `reconstructEntriesAtDay` flags an entry (its `isSuspect`) when it was
 * touched (`updatedDate`, see `wasTouchedAfter`) on/after the day, or its reconstructed stock
 * exceeds its received `quantity`. Suspect products are surfaced (not clamped away) so the
 * user can judge the reconstruction themselves.
 *
 * Reduce-to-today invariant: with `day` equal to today (local), the rows are identical
 * to `generateProductRows` called with equivalent service fakes built from the same data
 * (pinned by generate-product-rows-for-date.test.ts).
 */
export function generateProductRowsForDate(input: GenerateProductRowsForDateInput): DayReportResult {
  const { products, orders, inventories, day } = input;

  const isInDay = (d: Date): boolean => isInLocalDay(d, day);

  const dayOrders = getActiveOrdersOfDay(orders, day);
  const consumedAfterByEntry = getConsumedAfterDayByEntry(orders, day);

  const suspectProductNames: string[] = [];

  const rows = products.map((prod) => {
    const soldItems = dayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);
    const vendido = soldItems.reduce((total, oi) => total + oi.quantity, 0);
    const precioVenta =
      soldItems.length > 0 ? soldItems.reduce((total, oi) => total + oi.price, 0) / soldItems.length : 0;
    const importeVenta = vendido * precioVenta;

    const entries = inventories.get(prod.id) ?? [];
    const entriesAtDay = reconstructEntriesAtDay(entries, day, consumedAfterByEntry);

    // `available` (the "Final" basis) sums reconstructed end-of-day stock ONLY over
    // active entries — inactive rows never contribute. Suspects are flagged, not clamped.
    let available = 0;
    let isSuspect = false;
    for (const atDay of entriesAtDay) {
      if (atDay.isSuspect) isSuspect = true;
      if (atDay.entry.isActive) available += atDay.availableAtEndOfDay;
    }
    if (isSuspect) suspectProductNames.push(prod.name);

    // Entrada counts only ACTIVE entries dated inside the day.
    const entrada = entries.filter((e) => e.isActive && isInDay(e.date)).reduce((total, e) => total + e.quantity, 0);
    const disponible = available + vendido;
    const inicio = disponible - entrada;

    // Cost entries mirror the today report: any entry existing by the day with positive
    // end-of-day stock (no isActive filter), weighted by RECEIVED quantity.
    const costEntries = entriesAtDay.filter((x) => x.availableAtEndOfDay > 0);
    const costoUnitario =
      costEntries.length > 0
        ? costEntries.reduce((total, x) => total + x.entry.costPrice * x.entry.quantity, 0) /
          costEntries.reduce((total, x) => total + x.entry.quantity, 0)
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