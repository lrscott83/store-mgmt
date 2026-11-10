/**
 * Cost coverage for `deepClone` (R3-PERF-GUARD-REMOVED).
 *
 * `deepClone` replaces `structuredClone` in
 * `WarehouseOfflineService.snapshotPurchaseEdit`, where it runs synchronously
 * over whole-store collections on every purchase-cost edit, so its cost has to
 * scale linearly with payload size — a quadratic clone would stall a real
 * device at whole-store scale.
 *
 * A wall-clock bound does not belong in a unit test (it is either flaky or so
 * loose it proves nothing), so the deterministic guard in
 * `deep-clone.test.ts` covers correctness at scale and this benchmark covers
 * cost. Run it on demand:
 *
 *   pnpm --filter @store-mgmt/web-store-pos exec vitest bench app/shared/lib/browser-compat/__tests__/deep-clone.bench.ts
 *
 * Read the `hz` / `mean` columns against the payload size in the benchmark name:
 * linear cloning keeps the time-per-stock-level roughly constant as the payload
 * grows, while a quadratic implementation makes it grow with the payload. This
 * file is `*.bench.ts`, so `vitest run` (and therefore `pnpm test`) never picks
 * it up.
 */
import { bench, describe } from 'vitest';
import { deepClone } from '../deep-clone';

/** Payload sizes to compare: one small store, one store, one busy store. */
const STOCK_LEVEL_SIZES = [250, 1_000, 4_000];
const LOTS_PER_LEVEL = 3;

interface BenchStockLevel {
  id: string;
  warehouseId: string;
  productId: string;
  onHand: number;
  costPrice: number;
  lots: Array<{ costPrice: number; quantity: number; currency: number }>;
  createdDate: Date;
}

interface BenchMovement {
  id: string;
  warehouseId: string;
  productId: string;
  type: 'purchase_in';
  quantity: number;
  costPrice: number;
  reason: null;
  createdDate: Date;
  createdByName: string;
}

interface BenchEntry {
  id: string;
  productId: string;
  quantity: number;
  available: number;
  costPrice: number;
  currency: number;
  isActive: boolean;
  createdDate: Date;
}

interface BenchOrder {
  id: string;
  total: number;
  isActive: boolean;
  date: Date;
  orderItems: Array<{
    productId: string;
    quantity: number;
    price: number;
    productCosts: Array<{ inventoryId: string; costPrice: number; quantity: number }>;
  }>;
}

/** The four collections `snapshotPurchaseEdit` copies, sized from `levelCount`. */
interface BenchPayload {
  levels: BenchStockLevel[];
  movements: BenchMovement[];
  entries: BenchEntry[];
  orders: BenchOrder[];
}

/**
 * Builds a payload whose collections stay proportional to `levelCount`, so the
 * three benchmark cases differ only in size and the per-level cost is
 * comparable across them.
 */
function buildSnapshot(levelCount: number): BenchPayload {
  const createdDate = new Date('2026-01-01T00:00:00.000Z');

  const levels: BenchStockLevel[] = new Array(levelCount);
  for (let index = 0; index < levelCount; index += 1) {
    levels[index] = {
      id: `sl-${index}`,
      warehouseId: `wh-${index % 20}`,
      productId: `prod-${index}`,
      onHand: 10 + index,
      costPrice: 5.5,
      lots: Array.from({ length: LOTS_PER_LEVEL }, (_unused, lot) => ({
        costPrice: 5 + lot,
        quantity: 3,
        currency: 0,
      })),
      createdDate,
    };
  }

  const movementCount = levelCount * 4;
  const movements: BenchMovement[] = new Array(movementCount);
  for (let index = 0; index < movementCount; index += 1) {
    movements[index] = {
      id: `mv-${index}`,
      warehouseId: `wh-${index % 20}`,
      productId: `prod-${index % levelCount}`,
      type: 'purchase_in',
      quantity: 1,
      costPrice: 5,
      reason: null,
      createdDate,
      createdByName: 'snapshot',
    };
  }

  const entries: BenchEntry[] = new Array(levelCount);
  for (let index = 0; index < levelCount; index += 1) {
    entries[index] = {
      id: `en-${index}`,
      productId: `prod-${index}`,
      quantity: 3,
      available: 2,
      costPrice: 5,
      currency: 0,
      isActive: true,
      createdDate,
    };
  }

  const orderCount = Math.round(levelCount / 2);
  const orders: BenchOrder[] = new Array(orderCount);
  for (let index = 0; index < orderCount; index += 1) {
    orders[index] = {
      id: `o-${index}`,
      total: 1400,
      isActive: index % 2 === 0,
      date: createdDate,
      orderItems: [
        {
          productId: `prod-${index}`,
          quantity: 2,
          price: 700,
          productCosts: [{ inventoryId: `en-${index}`, costPrice: 5, quantity: 2 }],
        },
      ],
    };
  }

  return { levels, movements, entries, orders };
}

describe('deepClone — snapshot-scale cost', () => {
  for (const levelCount of STOCK_LEVEL_SIZES) {
    describe(`${levelCount} stock levels`, () => {
      const payload = buildSnapshot(levelCount);
      bench(`clone ${levelCount} stock levels`, () => {
        deepClone(payload);
      });
    });
  }
});
