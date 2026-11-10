import { beforeEach, describe, expect, it } from 'vitest';
import type { Order, OrderItem } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { deepClone } from '~/shared/lib/browser-compat/deep-clone';
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
 * T6 findings covered: R3-002 (no contract test for the round trip) and
 * R4-DEEPCLONE-NO-PERF-MEASUREMENT (perf guard, see `deep-clone.test.ts`).
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
 * which is the only seam where the in-memory snapshot is observable: stock
 * levels, movements and entries are persisted, so a leaked reference there is
 * masked by the localStorage round trip.
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

    // The pre-failure state, copied by value so later in-place mutations of the
    // live collections cannot reach it.
    const expected = {
      levels: deepClone(service.getStorageStockLevels()),
      movements: deepClone(service.getStorageMovements()),
      entries: deepClone(inventorySvc.getProductInventoriesByProductId('prod-1')),
      orders: deepClone(orderPort.orders),
    };

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
    expect(midFlight.movementCount).toBeGreaterThan(2);
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

    // The live objects the caller holds before the edit. Only the order port is
    // compared by reference: it is the one collection that lives in memory only
    // (levels, movements and entries are persisted, so an aliased snapshot is
    // masked there by the localStorage round trip after the rollback).
    const ordersBefore = orderPort.orders;
    expect(ordersBefore[0].orderItems[0].productCosts[0].costPrice).toBe(5);

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
  });
});
