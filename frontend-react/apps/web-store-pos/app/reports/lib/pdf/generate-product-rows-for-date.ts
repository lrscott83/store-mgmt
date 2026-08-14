import type { InventoryEntry, Order, Product } from '@store-mgmt/domain';
import type { InventoryTodaySaleRow } from './inventory-today-sale-pdf';

/**
 * Input bundle for {@link generateProductRowsForDate}. The caller (the
 * sales-history view) passes the same active products, active-only orders, and
 * raw per-product entries the today report would use, plus the UTC date key of
 * the target day group — the same `yyyy-mm-dd` key the view's grouping uses.
 */
export interface GenerateProductRowsForDateInput {
  /** Active products (from `ProductRepository.getAvailableProducts`). */
  products: Product[];
  /** Active orders — the caller pre-filters `isActive === true`. */
  orders: Order[];
  /** Raw per-product entries (from `getProductInventoriesByProductId`), keyed by product id. */
  entriesByProduct: ReadonlyMap<string, InventoryEntry[]>;
  /** UTC date key (`yyyy-mm-dd`) of the day group, from the view's grouping. */
  dayKey: string;
}

/**
 * `generateProductRowsForDate` — per-day sibling of `generateProductRows`
 * (generate-product-rows.ts): rebuilds the same 13-column inventory-at-sale-price
 * ledger for ONE past day instead of today. Every column reflects THAT day's
 * data, never current stock.
 *
 * The day's own columns (entrada, vendido, precioVenta, ...) come only from
 * orders and entries whose UTC date key matches `dayKey`. Stock reconstruction
 * is the mirror image of the FIFO ledger: for an entry `e` created on or before
 * the day, `asOfEndOfDay(e) = max(0, e.available + consumedAfter(e))`, where
 * `consumedAfter(e)` is the sum of `productCosts.quantity` for `e.id` across
 * active orders dated strictly AFTER `dayKey` — the consumption recorded at sale
 * time that the FIFO decrements have since subtracted from `e.available`.
 * Adding it back restores the entry to what it held at the end of the day.
 *
 * Reduce-to-today invariant: with `dayKey` equal to today's key, the output is
 * identical to `generateProductRows` called with equivalent service fakes built
 * from the same data (pinned by generate-product-rows-for-date.test.ts).
 */
export function generateProductRowsForDate(input: GenerateProductRowsForDateInput): InventoryTodaySaleRow[] {
  const { products, orders, entriesByProduct, dayKey } = input;

  const dayKeyOf = (d: Date): string => d.toISOString().split('T')[0];

  const dayOrders = orders.filter((o) => dayKeyOf(o.date) === dayKey);
  const afterDayOrders = orders.filter((o) => dayKeyOf(o.date) > dayKey);

  // Per-entry quantity consumed by orders dated strictly AFTER the day — keyed by
  // entry id so the FIFO consumption ledger can be reversed for any entry.
  const consumedAfterByEntry = new Map<string, number>();
  for (const order of afterDayOrders) {
    for (const item of order.orderItems) {
      for (const cost of item.productCosts) {
        consumedAfterByEntry.set(cost.inventoryId, (consumedAfterByEntry.get(cost.inventoryId) ?? 0) + cost.quantity);
      }
    }
  }

  const asOfEndOfDay = (entry: InventoryEntry): number =>
    Math.max(0, entry.available + (consumedAfterByEntry.get(entry.id) ?? 0));

  return products.map((prod) => {
    const soldItems = dayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);
    const vendido = soldItems.reduce((total, oi) => total + oi.quantity, 0);
    const precioVenta =
      soldItems.length > 0 ? soldItems.reduce((total, oi) => total + oi.price, 0) / soldItems.length : 0;
    const importeVenta = vendido * precioVenta;

    const entries = entriesByProduct.get(prod.id) ?? [];
    const beforeOrOnDay = entries.filter((e) => dayKeyOf(e.date) <= dayKey);
    const final = beforeOrOnDay.reduce((total, e) => total + asOfEndOfDay(e), 0);
    const entrada = entries.filter((e) => dayKeyOf(e.date) === dayKey).reduce((total, e) => total + e.quantity, 0);
    const disponible = final + vendido;
    const inicio = disponible - entrada;

    const costEntries = beforeOrOnDay.filter((e) => asOfEndOfDay(e) > 0);
    const costoUnitario =
      costEntries.length > 0
        ? costEntries.reduce((total, e) => total + e.costPrice * e.quantity, 0) /
          costEntries.reduce((total, e) => total + e.quantity, 0)
        : 0;
    const costoTotal = vendido * costoUnitario;
    const cpVenta = importeVenta > 0 ? costoTotal / importeVenta : 0;
    const final2 = disponible - vendido;
    const importeFinal = final2 * costoUnitario;

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
      final: final2,
      importeFinal,
    };
  });
}
