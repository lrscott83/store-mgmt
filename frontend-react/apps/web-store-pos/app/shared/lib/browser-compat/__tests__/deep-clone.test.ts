import { describe, it, expect } from 'vitest';
import { deepClone } from '../deep-clone';

describe('deepClone', () => {
  it('returns primitives unchanged', () => {
    expect(deepClone(undefined)).toBeUndefined();
    expect(deepClone(null)).toBeNull();
    expect(deepClone(42)).toBe(42);
    expect(deepClone(0)).toBe(0);
    expect(deepClone('text')).toBe('text');
    expect(deepClone('')).toBe('');
    expect(deepClone(true)).toBe(true);
    expect(deepClone(false)).toBe(false);
    expect(deepClone(10n)).toBe(10n);
  });

  it('clones a plain object by value with a distinct reference', () => {
    const original = { id: 'a-1', quantity: 3, nested: { cost: 7.5 } };
    const clone = deepClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.nested).not.toBe(original.nested);

    clone.nested.cost = 99;
    clone.quantity = 1000;
    expect(original.nested.cost).toBe(7.5);
    expect(original.quantity).toBe(3);
  });

  it('clones a nested array of objects with distinct references at every level', () => {
    const original = [{ lots: [{ costPrice: 1 }, { costPrice: 2 }] }, { lots: [] }];
    const clone = deepClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone[0]).not.toBe(original[0]);
    expect(clone[0].lots).not.toBe(original[0].lots);
    expect(clone[0].lots[0]).not.toBe(original[0].lots[0]);

    clone[0].lots[0].costPrice = 500;
    clone.push({ lots: [] });
    expect(original[0].lots[0].costPrice).toBe(1);
    expect(original).toHaveLength(2);
  });

  it('clones a Date by value with a distinct reference', () => {
    const original = new Date('2026-11-10T08:30:00.000Z');
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(Date);
    expect(clone).not.toBe(original);
    expect(clone.getTime()).toBe(original.getTime());

    clone.setUTCFullYear(1990);
    expect(original.getUTCFullYear()).toBe(2026);
  });

  it('clones a Map by value with a distinct reference', () => {
    const original = new Map<string, unknown>([
      ['a', { quantity: 1 }],
      ['b', [1, 2]],
    ]);
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(Map);
    expect(clone).not.toBe(original);
    expect(clone.size).toBe(2);
    expect(clone.get('b')).toEqual([1, 2]);
    expect(clone.get('b')).not.toBe(original.get('b'));

    const clonedEntry = clone.get('a') as { quantity: number };
    clonedEntry.quantity = 9;
    expect((original.get('a') as { quantity: number }).quantity).toBe(1);
  });

  it('clones a Set by value with a distinct reference', () => {
    const member = { id: 1 };
    const original = new Set<unknown>(['x', member]);
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(Set);
    expect(clone).not.toBe(original);
    expect(clone.size).toBe(2);
    expect(clone.has('x')).toBe(true);
    expect(clone.has(member)).toBe(false);

    const clonedMember = [...clone].find((value) => typeof value === 'object') as { id: number };
    expect(clonedMember).not.toBe(member);
    clonedMember.id = 2;
    expect(member.id).toBe(1);
  });

  it('clones a RegExp by value with a distinct reference', () => {
    const original = /ab+c/gi;
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(RegExp);
    expect(clone).not.toBe(original);
    expect(clone.source).toBe(original.source);
    expect(clone.flags).toBe(original.flags);
    expect(clone.test('ABBc')).toBe(true);
  });

  it('clones ArrayBuffer and typed-array views into independent buffers', () => {
    const buffer = new ArrayBuffer(8);
    new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8]);
    const bufferClone = deepClone(buffer);

    expect(bufferClone).toMatchObject({ byteLength: 8 });
    expect(bufferClone).not.toBe(buffer);
    new Uint8Array(bufferClone)[0] = 99;
    expect(new Uint8Array(buffer)[0]).toBe(1);

    const view = new Uint16Array(buffer, 2, 2);
    const viewClone = deepClone(view);
    expect(viewClone).toBeInstanceOf(Uint16Array);
    expect(viewClone).not.toBe(view);
    expect(Array.from(viewClone)).toEqual(Array.from(view));
    expect(viewClone.buffer).not.toBe(view.buffer);
    viewClone[0] = 4242;
    expect(view[0]).not.toBe(4242);

    const dataView = new DataView(buffer, 0, 4);
    const dataViewClone = deepClone(dataView);
    expect(dataViewClone).toBeInstanceOf(DataView);
    expect(dataViewClone).not.toBe(dataView);
    expect(dataViewClone.byteLength).toBe(dataView.byteLength);
    expect(dataViewClone.buffer).not.toBe(dataView.buffer);
  });

  it('preserves cyclic references', () => {
    const original: Record<string, unknown> = { name: 'cycle' };
    original.self = original;

    const clone = deepClone(original);

    expect(clone).not.toBe(original);
    expect(clone.self).toBe(clone);
    expect(clone.name).toBe('cycle');
  });

  it('throws TypeError when a function appears as a value', () => {
    expect(() => deepClone({ run: () => 1 })).toThrow(TypeError);
    expect(() => deepClone([() => 1])).toThrow(TypeError);
  });

  it('throws TypeError when a symbol appears as a value', () => {
    expect(() => deepClone({ token: Symbol('token') })).toThrow(TypeError);
  });

  it('returns undefined for undefined input', () => {
    expect(deepClone<undefined>(undefined)).toBeUndefined();
  });
});

/**
 * Scale-correctness guard (R4-DEEPCLONE-NO-PERF-MEASUREMENT, reworked by R3-D).
 *
 * `deepClone` replaced `structuredClone` in `WarehouseOfflineService.snapshotPurchaseEdit`,
 * where it runs synchronously over whole-store collections on every purchase-cost
 * edit — so it has to stay CORRECT at whole-store scale, not merely fast.
 *
 * The previous version of this guard used wall-clock time as its verdict. That is
 * not a unit-test assertion: the number depends on the machine's load, so it is
 * either flaky or so loose that it proves nothing. Wall-clock benchmarking belongs
 * outside a unit test. What is deterministic and still catches a real regression is
 * the observable result on a payload shaped like the actual snapshot: cardinality,
 * value equality, and no shared references at any nesting level.
 */
const STOCK_LEVEL_COUNT = 250;
const LOTS_PER_LEVEL = 3;
const MOVEMENT_COUNT = 1_000;
const ENTRY_COUNT = 250;
const ORDER_COUNT = 100;

interface SnapshotStockLevel {
  id: string;
  warehouseId: string;
  productId: string;
  onHand: number;
  costPrice: number;
  lots: Array<{ costPrice: number; quantity: number; currency: number }>;
  createdDate: Date;
}

interface SnapshotMovement {
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

interface SnapshotEntry {
  id: string;
  productId: string;
  quantity: number;
  available: number;
  costPrice: number;
  currency: number;
  isActive: boolean;
  createdDate: Date;
}

interface SnapshotOrder {
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

/** The four collections `snapshotPurchaseEdit` copies, at whole-store scale. */
interface SnapshotPayload {
  levels: SnapshotStockLevel[];
  movements: SnapshotMovement[];
  entries: SnapshotEntry[];
  orders: SnapshotOrder[];
}

function buildSnapshotPayload(): SnapshotPayload {
  const levels: SnapshotStockLevel[] = new Array(STOCK_LEVEL_COUNT);
  for (let index = 0; index < STOCK_LEVEL_COUNT; index += 1) {
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
      createdDate: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  const movements: SnapshotMovement[] = new Array(MOVEMENT_COUNT);
  for (let index = 0; index < MOVEMENT_COUNT; index += 1) {
    movements[index] = {
      id: `mv-${index}`,
      warehouseId: `wh-${index % 20}`,
      productId: `prod-${index % STOCK_LEVEL_COUNT}`,
      type: 'purchase_in',
      quantity: 1,
      costPrice: 5,
      reason: null,
      createdDate: new Date('2026-01-01T00:00:00.000Z'),
      createdByName: 'snapshot',
    };
  }

  const entries: SnapshotEntry[] = new Array(ENTRY_COUNT);
  for (let index = 0; index < ENTRY_COUNT; index += 1) {
    entries[index] = {
      id: `en-${index}`,
      productId: `prod-${index}`,
      quantity: 3,
      available: 2,
      costPrice: 5,
      currency: 0,
      isActive: true,
      createdDate: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  const orders: SnapshotOrder[] = new Array(ORDER_COUNT);
  for (let index = 0; index < ORDER_COUNT; index += 1) {
    orders[index] = {
      id: `o-${index}`,
      total: 1400,
      isActive: index % 2 === 0,
      date: new Date('2026-01-01T00:00:00.000Z'),
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

describe('deepClone — snapshot-scale correctness', () => {
  it('clones a payload shaped like the purchase-edit snapshot without sharing references', () => {
    const payload = buildSnapshotPayload();
    const clone = deepClone(payload);

    // Cardinality: nothing is dropped or duplicated at scale.
    expect(clone.levels).toHaveLength(STOCK_LEVEL_COUNT);
    expect(clone.movements).toHaveLength(MOVEMENT_COUNT);
    expect(clone.entries).toHaveLength(ENTRY_COUNT);
    expect(clone.orders).toHaveLength(ORDER_COUNT);

    // Value equality across the whole payload (Dates included)...
    expect(clone).toEqual(payload);

    // ...and on a sampled element at every nesting level.
    expect(clone.levels[123]).toEqual(payload.levels[123]);
    expect(clone.levels[123].lots[1].costPrice).toBe(payload.levels[123].lots[1].costPrice);
    expect(clone.movements[MOVEMENT_COUNT - 1]).toEqual(payload.movements[MOVEMENT_COUNT - 1]);
    expect(clone.entries[ENTRY_COUNT - 1]).toEqual(payload.entries[ENTRY_COUNT - 1]);
    expect(clone.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0]).toEqual(
      payload.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0],
    );

    // No shared references, at the collection level and down through nesting.
    expect(clone).not.toBe(payload);
    expect(clone.levels).not.toBe(payload.levels);
    expect(clone.movements).not.toBe(payload.movements);
    expect(clone.entries).not.toBe(payload.entries);
    expect(clone.orders).not.toBe(payload.orders);
    expect(clone.levels[123]).not.toBe(payload.levels[123]);
    expect(clone.levels[123].lots).not.toBe(payload.levels[123].lots);
    expect(clone.levels[123].lots[1]).not.toBe(payload.levels[123].lots[1]);
    expect(clone.levels[123].createdDate).not.toBe(payload.levels[123].createdDate);
    expect(clone.entries[ENTRY_COUNT - 1]).not.toBe(payload.entries[ENTRY_COUNT - 1]);
    expect(clone.orders[ORDER_COUNT - 1]).not.toBe(payload.orders[ORDER_COUNT - 1]);
    expect(clone.orders[ORDER_COUNT - 1].orderItems[0]).not.toBe(
      payload.orders[ORDER_COUNT - 1].orderItems[0],
    );
    expect(clone.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0]).not.toBe(
      payload.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0],
    );

    // Mutating the clone at any depth leaves the original untouched.
    clone.levels[123].lots[1].costPrice = 999;
    clone.movements[7].quantity = 999;
    clone.entries[7].costPrice = 999;
    clone.orders[7].orderItems[0].productCosts[0].costPrice = 999;
    expect(payload.levels[123].lots[1].costPrice).toBe(6);
    expect(payload.movements[7].quantity).toBe(1);
    expect(payload.entries[7].costPrice).toBe(5);
    expect(payload.orders[7].orderItems[0].productCosts[0].costPrice).toBe(5);
  });
});
