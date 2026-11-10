import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataResult as DataResultImpl, Result } from '@store-mgmt/domain';
import type {
  InventoryEntry,
  Order,
  OrderItem,
  WarehouseStockLevel,
  WarehouseStockMovement,
} from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '../inventory-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';
import type { PurchaseCostOrderPort } from '../warehouse-offline-service';

const storeId = 'test-store-snapshot';

/**
 * Service-level contract of the in-memory rollback snapshot used by the atomic
 * purchase-cost edit (`snapshotPurchaseEdit` / `restorePurchaseEdit`, R3-002).
 *
 * `snapshotPurchaseEdit` is private, so the contract is exercised through its
 * only public entry point — `applyPurchaseCostEdit` — which takes the snapshot
 * before mutating warehouse levels, movements, store entries and orders and
 * restores it when the operation fails afterwards.
 *
 * Findings covered here: R3-002 (contract of the round trip), plus the T6 review
 * advisories R3-A (independent baseline), R3-B (reference independence for every
 * collection, not just orders), R3-C (no pinned internal magnitude), R3-E
 * (failure injected before the order sync, and an empty world). R3-D lives in
 * `deep-clone.test.ts`.
 *
 * The `review-060ec87207bf3a65` advisories are folded in: the baseline is built
 * by a local, dependency-free copy (R3-STRUCTUREDCLONE-BASELINE), the poisoning
 * probe states exactly what it proves (R3-MIDFLIGHT-PROBE-VACUOUS), and the
 * empty-world test asserts the observable contract instead of the reversal's
 * internal routing (R3-PUBLIC-API-MOCK-COUPLING).
 */

function seedProduct(
  productRepo: ProductRepository,
  categoryRepo: ProductCategoryRepository,
  id: string,
  name: string,
) {
  categoryRepo.addImportedProductCategory({
    id: 'cat-1',
    name: 'Cerveza',
    order: 1,
    isActive: true,
  });
  productRepo.addImportedProduct({
    id,
    name,
    categoryId: 'cat-1',
    categoryName: 'Cerveza',
    price: 700,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: storeId,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
  });
}

/**
 * Order port that mutates the LIVE order lines in place (a real mutation, not a
 * no-op) and can then throw, forcing the rollback path. `receivedSnapshot`
 * keeps the exact array reference the service hands to `restoreOrdersSnapshot`,
 * which is the only seam where the in-memory order snapshot is observable: stock
 * levels, movements and entries are persisted, so their identity is masked by
 * the localStorage round trip (their independence is proven by value and by the
 * mid-flight mutation probe below instead).
 */
interface FakeOrderPort extends PurchaseCostOrderPort {
  orders: Order[];
  updateCalls: number;
  restoreCalls: number;
  mutateThenThrow: boolean;
  receivedSnapshot: Order[] | undefined;
  onUpdate?: () => void;
}

function makeOrderPort(): FakeOrderPort {
  const port: FakeOrderPort = {
    orders: [],
    updateCalls: 0,
    restoreCalls: 0,
    mutateThenThrow: false,
    receivedSnapshot: undefined,
    getStorageOrders() {
      return port.orders;
    },
    updateProductCostsByInventoryIds(costs) {
      port.updateCalls += 1;
      let activeOrders = 0;
      let deactivatedOrders = 0;
      let updatedLines = 0;
      for (const order of port.orders) {
        let touched = false;
        for (const item of order.orderItems) {
          for (const cost of item.productCosts) {
            const next = costs.get(cost.inventoryId);
            if (next === undefined) continue;
            touched = true;
            if (order.isActive) {
              cost.costPrice = next;
              updatedLines += 1;
            }
          }
        }
        if (!touched) continue;
        if (order.isActive) activeOrders += 1;
        else deactivatedOrders += 1;
      }
      port.onUpdate?.();
      if (port.mutateThenThrow) throw new Error('order update boom');
      return { activeOrders, deactivatedOrders, updatedLines };
    },
    restoreOrdersSnapshot(orders) {
      port.restoreCalls += 1;
      port.receivedSnapshot = orders;
      port.orders = orders;
    },
  };
  return port;
}

function orderItem(inventoryId: string, costPrice: number, quantity: number): OrderItem {
  return {
    productId: 'prod-1',
    productName: 'Cerveza X',
    categoryId: 'cat-1',
    categoryName: 'Cerveza',
    name: 'Cerveza X',
    quantity,
    price: 700,
    productBusinessId: storeId,
    productCosts: [{ inventoryId, costPrice, quantity }],
    order: 0,
  };
}

function makeOrder(id: string, isActive: boolean, items: OrderItem[]): Order {
  return {
    id,
    orderItems: items,
    total: 0,
    itemsCount: 0,
    date: new Date(),
    type: 0 as never,
    paymentType: 0 as never,
    isCredit: false,
    description: '',
    isActive,
    createdDate: new Date(),
    createdByName: 'test',
    updatedDate: undefined,
    updatedByName: undefined,
  };
}

/** Live state observed from inside the failing operation, before the rollback. */
interface MidFlightObservation {
  movementCount: number;
  lotCostPrice: number;
  entryCostPrice: number;
  orderCostPrice: number;
}

/** The complete pre-failure state the restore must bring back, copied by value. */
interface CapturedState {
  levels: WarehouseStockLevel[];
  movements: WarehouseStockMovement[];
  entries: InventoryEntry[];
  orders: Order[];
}

/**
 * Local, dependency-free deep copy used to build the baseline
 * (R3-STRUCTUREDCLONE-BASELINE).
 *
 * The baseline needs an independent mechanism that does not depend on the API
 * the production helper exists to replace. The global `structuredClone` is not a
 * safe option here: this suite guards a package whose entire purpose is that
 * `structuredClone` is absent on the Chrome 89 floor, so a runtime without it
 * would fail every test at the helper instead of at the behaviour being proven.
 * `deepClone` is not an option either — it is the helper under test. What
 * remains is the collections' actual shape, which is arrays, plain objects and
 * `Date`, copied by hand: no globals, no imports.
 */
function deepCopy<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map((entry) => deepCopy(entry)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      copy[key] = deepCopy((value as Record<string, unknown>)[key]);
    }
    return copy as unknown as T;
  }
  return value;
}

describe('WarehouseOfflineService — purchase-edit snapshot contract (R3-002)', () => {
  let productRepo: ProductRepository;
  let inventorySvc: InventoryOfflineService;
  let orderPort: FakeOrderPort;
  let service: WarehouseOfflineService;

  beforeEach(() => {
    localStorage.clear();
    const categoryRepo = new ProductCategoryRepository(storeId);
    productRepo = new ProductRepository(storeId, categoryRepo);
    inventorySvc = new InventoryOfflineService(storeId, productRepo);
    orderPort = makeOrderPort();
    service = new WarehouseOfflineService(storeId, productRepo, inventorySvc, orderPort);
    seedProduct(productRepo, categoryRepo, 'prod-1', 'Cerveza X');
  });

  /** Seeds: warehouse A, a 10×@5 purchase, a 6-unit sale to the store, one active sale line. */
  function seedWorld() {
    const warehouse = service.createWarehouse('A').data!;
    const purchaseId = service.recordMovement({
      type: 'purchase_in',
      warehouseId: warehouse.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    }).data![0].id;
    const saleRow = service.recordMovement({
      type: 'sale_out',
      warehouseId: warehouse.id,
      productId: 'prod-1',
      quantity: 6,
      toStoreId: 'store-1',
    }).data![0];
    const entryId = saleRow.inventoryEntryId!;
    orderPort.orders = [makeOrder('o-1', true, [orderItem(entryId, 5, 2)])];
    return { warehouse, purchaseId, entryId };
  }

  /**
   * Captures every collection the restore must bring back, copied with the local
   * `deepCopy` above — deliberately NOT with `deepClone` (R3-A).
   *
   * `deepClone` is the helper whose fidelity the restore depends on, so building
   * the expectation through it would compare the helper against itself: if it
   * aliased the live collections instead of copying them, the mid-flight in-place
   * mutations would land in this baseline too, the restored data and the baseline
   * would agree, and the rollback assertions would keep passing over a broken
   * rollback. `deepCopy` is a separate mechanism in this file, so a divergence
   * between the two shows up as a failure.
   */
  function captureBaseline(): CapturedState {
    return {
      levels: deepCopy(service.getStorageStockLevels()),
      movements: deepCopy(service.getStorageMovements()),
      entries: deepCopy(inventorySvc.getProductInventoriesByProductId('prod-1')),
      orders: deepCopy(orderPort.orders),
    };
  }

  it('restores every collection by value after a failure past the reversal', () => {
    const { warehouse, purchaseId, entryId } = seedWorld();
    const entryOf = (id: string) =>
      inventorySvc.getProductInventoriesByProductId('prod-1').find((entry) => entry.id === id)!;

    // ── Precondition: the seeded world really is present (guards a vacuous pass).
    const levelBefore = service.getStockLevel(warehouse.id, 'prod-1')!;
    expect(service.getStorageMovements()).toHaveLength(2);
    expect(levelBefore.onHand).toBe(4);
    expect(levelBefore.lots).toMatchObject([{ costPrice: 5, quantity: 4 }]);
    expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toHaveLength(1);
    expect(entryOf(entryId).costPrice).toBe(5);
    expect(orderPort.orders).toHaveLength(1);
    expect(orderPort.orders[0].orderItems[0].productCosts[0].costPrice).toBe(5);

    // The pre-failure state, copied by value with an independent mechanism, so
    // later in-place mutations of the live collections cannot reach it.
    const liveOrders = orderPort.orders;
    const expected = captureBaseline();
    // Independence of the baseline itself: it is a copy, so none of its objects
    // is the live object at any depth. A shallow copy would leave every value
    // comparison below passing over a baseline that shares the very objects the
    // failing operation mutates in place.
    expect(expected.orders).not.toBe(liveOrders);
    expect(expected.orders[0].orderItems[0].productCosts[0]).not.toBe(
      liveOrders[0].orderItems[0].productCosts[0],
    );
    // R3-C: the reference point for "the state really changed", taken from the
    // captured state instead of a hard-coded magnitude.
    const movementsBeforeFailure = expected.movements.length;

    // Precondition of the restore path: the operation must mutate the live
    // collections BEFORE failing, otherwise "restore" could be a silent no-op.
    const midFlight: MidFlightObservation = {
      movementCount: -1,
      lotCostPrice: -1,
      entryCostPrice: -1,
      orderCostPrice: -1,
    };
    orderPort.onUpdate = () => {
      const level = service.getStockLevel(warehouse.id, 'prod-1')!;
      midFlight.movementCount = service.getStorageMovements().length;
      midFlight.lotCostPrice = level.lots?.[0]?.costPrice ?? -1;
      midFlight.entryCostPrice = entryOf(entryId).costPrice;
      midFlight.orderCostPrice = orderPort.orders[0].orderItems[0].productCosts[0].costPrice;
    };
    orderPort.mutateThenThrow = true;

    const result = service.applyPurchaseCostEdit(purchaseId, 4, 7);

    expect(result.succeeded).toBe(false);
    // R3-C: the reversal + recreation really grew the movement collection. This
    // is a comparison against the captured pre-failure count, so it does not pin
    // how many rows the reversal happens to create.
    expect(midFlight.movementCount).toBeGreaterThan(movementsBeforeFailure);
    expect(midFlight.lotCostPrice).toBe(7);
    expect(midFlight.entryCostPrice).toBe(7);
    expect(midFlight.orderCostPrice).toBe(7);

    // ── Restored state is value-equal to the pre-failure state.
    expect(service.isReversed(purchaseId)).toBe(false);
    expect(orderPort.restoreCalls).toBeGreaterThan(0);
    expect(service.getStorageStockLevels()).toEqual(expected.levels);
    expect(service.getStorageMovements()).toEqual(expected.movements);
    expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toEqual(expected.entries);
    expect(orderPort.orders).toEqual(expected.orders);
  });

  it('keeps the snapshot reference-independent from the live collections in both directions', () => {
    const { purchaseId } = seedWorld();

    // The live objects the caller holds before the edit. Orders are compared by
    // reference through the port seam; entries through their own restoration
    // seam (`addImportedEntries` receives the snapshot bucket). Levels and
    // movements are persisted and re-parsed on read, so their identity cannot be
    // observed after the fact — the next test proves their independence through
    // the mutation direction instead.
    const ordersBefore = orderPort.orders;
    const entriesBefore = inventorySvc.getProductInventoriesByProductId('prod-1');
    const entriesSeam = vi.spyOn(inventorySvc, 'addImportedEntries');
    expect(ordersBefore[0].orderItems[0].productCosts[0].costPrice).toBe(5);
    expect(entriesBefore[0].costPrice).toBe(5);

    orderPort.mutateThenThrow = true;
    expect(service.applyPurchaseCostEdit(purchaseId, 4, 7).succeeded).toBe(false);

    const restoredSnapshot = orderPort.receivedSnapshot!;
    expect(restoredSnapshot).toBeDefined();

    // The restored data is a detached copy, not the array/objects the live code
    // handed over at snapshot time.
    expect(restoredSnapshot).not.toBe(ordersBefore);
    expect(restoredSnapshot[0]).not.toBe(ordersBefore[0]);
    expect(restoredSnapshot[0].orderItems[0]).not.toBe(ordersBefore[0].orderItems[0]);
    expect(restoredSnapshot[0].orderItems[0].productCosts[0]).not.toBe(
      ordersBefore[0].orderItems[0].productCosts[0],
    );

    // Direction "live → snapshot": the port really did mutate the LIVE order line
    // in place to 7 before throwing, yet the restored value is 5. A shared
    // reference would have carried 7 into the snapshot and back out.
    expect(ordersBefore[0].orderItems[0].productCosts[0].costPrice).toBe(7);
    expect(orderPort.orders[0].orderItems[0].productCosts[0].costPrice).toBe(5);

    // Direction "snapshot → live": mutating the live collection the caller held
    // must not reach the restored data (they are separate objects now)...
    ordersBefore[0].orderItems[0].productCosts[0].costPrice = 999;
    expect(orderPort.orders[0].orderItems[0].productCosts[0].costPrice).toBe(5);

    // ...and mutating the restored-data copy must not reach the live collection.
    restoredSnapshot[0].orderItems[0].productCosts[0].costPrice = 4242;
    expect(ordersBefore[0].orderItems[0].productCosts[0].costPrice).toBe(999);

    // ── R3-B: same contract for the store entries, at their own seam.
    expect(entriesSeam).toHaveBeenCalled();
    const receivedEntries = entriesSeam.mock.calls.at(-1)![1];
    expect(receivedEntries).not.toBe(entriesBefore);
    // The live bucket really was rewritten mid-flight (the entry was replaced at
    // the new cost), and the restored copy still carries the old one.
    expect(entriesBefore[0].costPrice).toBe(7);
    expect(receivedEntries[0].costPrice).toBe(5);
  });

  it('restores pre-failure values that do not depend on what the collections held at failure time', () => {
    const { warehouse, purchaseId } = seedWorld();
    const expected = captureBaseline();
    const levelBefore = service.getStockLevel(warehouse.id, 'prod-1')!;
    const purchaseBefore = service.getStorageMovements()[0];

    // What this proves: the restored state carries the values the collections
    // held BEFORE the failure, not the values they held at failure time.
    //
    // `levelBefore` and `purchaseBefore` are objects returned by a read that
    // happened before the operation — levels and movements are persisted and
    // re-parsed on every read, so they were never part of the in-memory
    // snapshot; they are just the observable state at that point. Poisoning them
    // in place right before the failure makes the distinction testable: a
    // restoration that re-derived its values from the current collections (or
    // that stored a view instead of a copy) would surface the poisoned values.
    // Snapshot identity itself is evidenced separately, at the order and entry
    // seams of the test above, which are the only places those collections are
    // handed over by reference.
    orderPort.onUpdate = () => {
      levelBefore.lots![0].costPrice = 111;
      purchaseBefore.quantity = 111;
    };
    orderPort.mutateThenThrow = true;

    expect(service.applyPurchaseCostEdit(purchaseId, 4, 7).succeeded).toBe(false);

    // The probe is not a no-op: the pre-failure objects really are poisoned.
    expect(levelBefore.lots![0].costPrice).toBe(111);
    expect(purchaseBefore.quantity).toBe(111);

    // The restored state comes back with the pre-failure values, never with the
    // poisoned ones.
    expect(service.getStockLevel(warehouse.id, 'prod-1')!.lots![0].costPrice).toBe(5);
    expect(service.getStorageMovements()[0].quantity).toBe(expected.movements[0].quantity);
    expect(service.getStorageStockLevels()).toEqual(expected.levels);
    expect(service.getStorageMovements()).toEqual(expected.movements);
    expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toEqual(expected.entries);
  });

  it('restores the baseline when the failure happens before the order sync', () => {
    const { warehouse, purchaseId } = seedWorld();
    const expected = captureBaseline();
    const midFlight = { movementCount: -1, lotCostPrice: -1 };

    // Failure injected at the store-entry stage — the stage that runs BEFORE the
    // order sync — through the collaborator the service was constructed with, so
    // no production code is touched.
    const failEntryStage = vi
      .spyOn(inventorySvc, 'updateWarehouseOriginEntryCost')
      .mockImplementation(() => {
        midFlight.movementCount = service.getStorageMovements().length;
        midFlight.lotCostPrice =
          service.getStockLevel(warehouse.id, 'prod-1')!.lots?.[0]?.costPrice ?? -1;
        return Result.Failure([{ code: 'Test.EntryStageFailure', description: 'entry stage boom' }]);
      });

    const result = service.applyPurchaseCostEdit(purchaseId, 4, 7);

    expect(result.succeeded).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('Test.EntryStageFailure');
    expect(failEntryStage).toHaveBeenCalledTimes(1);
    // The order sync was never reached: the failure provably came from an
    // earlier stage of the same operation.
    expect(orderPort.updateCalls).toBe(0);
    // ...and the warehouse stages had already run, so the restore was not a no-op.
    expect(midFlight.movementCount).toBeGreaterThan(expected.movements.length);
    expect(midFlight.lotCostPrice).toBe(7);

    expect(service.isReversed(purchaseId)).toBe(false);
    expect(service.getStorageStockLevels()).toEqual(expected.levels);
    expect(service.getStorageMovements()).toEqual(expected.movements);
    expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toEqual(expected.entries);
    expect(orderPort.orders).toEqual(expected.orders);
  });

  it('restores the baseline in a world with no store entries and no orders', () => {
    // Empty world for the snapshot collections: one purchase, no outflow, so no
    // store entries and no orders at all.
    const warehouse = service.createWarehouse('A').data!;
    const purchaseId = service.recordMovement({
      type: 'purchase_in',
      warehouseId: warehouse.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    }).data![0].id;
    orderPort.orders = [];

    expect(service.getStorageMovements()).toHaveLength(1);
    expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toHaveLength(0);
    expect(orderPort.orders).toHaveLength(0);

    const expected = captureBaseline();

    // With no store entries and no orders, the store-entry stage the test above
    // fails on has nothing to touch, so the recreation step is the only stage of
    // the operation that can be made to fail through a collaborator seam — it is
    // the earliest mutable stage here, not a shortcut. The mock below is only the
    // failure injector; nothing is asserted about the reversal's internal routing,
    // so a refactor that routes the reversal through `recordMovement` itself
    // keeps this test green as long as the contract holds.
    vi.spyOn(service, 'recordMovement').mockImplementation(
      () =>
        new DataResultImpl<WarehouseStockMovement[]>(undefined, false, [
          { code: 'Test.RecreationFailure', description: 'recreation boom' },
        ]),
    );

    const result = service.applyPurchaseCostEdit(purchaseId, 4, 7);

    // The observable contract of a failed edit with nothing else in the world.
    expect(result.succeeded).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('Test.RecreationFailure');
    expect(orderPort.updateCalls).toBe(0);
    expect(service.isReversed(purchaseId)).toBe(false);
    expect(service.getStorageStockLevels()).toEqual(expected.levels);
    expect(service.getStorageMovements()).toEqual(expected.movements);
    expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toEqual(expected.entries);
    expect(orderPort.orders).toEqual(expected.orders);
  });
});
