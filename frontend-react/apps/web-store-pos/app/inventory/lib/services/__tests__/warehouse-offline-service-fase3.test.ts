import { beforeEach, describe, expect, it } from 'vitest';
import type { Order, OrderItem } from '@store-mgmt/domain';
import { WarehouseErrors } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '../inventory-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';
import type { PurchaseCostOrderPort } from '../warehouse-offline-service';

const storeId = 'test-store-fase3';

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

/** Puerto de órdenes en memoria que satisface `PurchaseCostOrderPort`. */
interface FakeOrderPort extends PurchaseCostOrderPort {
  orders: Order[];
  throwOnUpdate: boolean;
  updateCalls: Array<ReadonlyMap<string, number>>;
  restoreCalls: number;
}

function makeOrderPort(): FakeOrderPort {
  const port: FakeOrderPort = {
    orders: [],
    throwOnUpdate: false,
    updateCalls: [],
    restoreCalls: 0,
    getStorageOrders() {
      return port.orders;
    },
    updateProductCostsByInventoryIds(costs) {
      port.updateCalls.push(costs);
      if (port.throwOnUpdate) throw new Error('order update boom');
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
      return { activeOrders, deactivatedOrders, updatedLines };
    },
    restoreOrdersSnapshot(orders) {
      port.restoreCalls += 1;
      port.orders = structuredClone(orders);
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

describe('WarehouseOfflineService — Fase 3 (propagación de costo)', () => {
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

  function warehouse() {
    return service.createWarehouse('A').data!;
  }

  function purchase(warehouseId: string, quantity: number, costPrice: number) {
    const rows = service.recordMovement({
      type: 'purchase_in',
      warehouseId,
      productId: 'prod-1',
      quantity,
      costPrice,
    }).data!;
    return rows[0].id;
  }

  function saleOut(warehouseId: string, quantity: number) {
    return service.recordMovement({
      type: 'sale_out',
      warehouseId,
      productId: 'prod-1',
      quantity,
      toStoreId: 'store-1',
    }).data!;
  }

  it('U-F3-1: sale_out persiste lotOriginMovementId (enlace determinista compra → salida)', () => {
    const wh = warehouse();
    const purchaseId = purchase(wh.id, 10, 5);
    const rows = saleOut(wh.id, 6);
    expect(rows[0].lotOriginMovementId).toBe(purchaseId);
    expect(rows[0].inventoryEntryId).toBeDefined();
  });

  it('U-F3-2: preview sin salidas → hasOutflow false (no rompe E-UI-3/E-R5)', () => {
    const wh = warehouse();
    const purchaseId = purchase(wh.id, 10, 5);
    const preview = service.getPurchasePropagationPreview(purchaseId, 7);
    expect(preview.succeeded).toBe(true);
    expect(preview.data!.hasOutflow).toBe(false);
  });

  it('U-F3-3: edición normal propaga a stock en tienda y a la venta activa', () => {
    const wh = warehouse();
    const purchaseId = purchase(wh.id, 10, 5);
    const sale = saleOut(wh.id, 6);
    const entryId = sale[0].inventoryEntryId!;
    orderPort.orders = [makeOrder('o1', true, [orderItem(entryId, 5, 2)])];

    const result = service.applyPurchaseCostEdit(purchaseId, 4, 7);

    expect(result.succeeded).toBe(true);
    expect(result.data!.costOnly).toBe(false);
    expect(result.data!.storeEntries).toBe(1);
    expect(result.data!.activeOrders).toBe(1);
    // Stock en tienda con el costo nuevo.
    const entry = inventorySvc
      .getProductInventoriesByProductId('prod-1')
      .find((e) => e.id === entryId)!;
    expect(entry.costPrice).toBe(7);
    // Venta activa con el costo nuevo.
    expect(orderPort.orders[0].orderItems[0].productCosts[0].costPrice).toBe(7);
    // Almacén: remanente recreado al costo nuevo; la compra original quedó revertida.
    const level = service.getStockLevel(wh.id, 'prod-1')!;
    expect(level.onHand).toBe(4);
    expect(level.lots).toMatchObject([{ costPrice: 7, quantity: 4 }]);
    expect(service.isReversed(purchaseId)).toBe(true);
  });

  it('U-F3-4: preview cuenta solo ventas activas y reporta las desactivadas (decisión #2)', () => {
    const wh = warehouse();
    const purchaseId = purchase(wh.id, 10, 5);
    const sale = saleOut(wh.id, 6);
    const entryId = sale[0].inventoryEntryId!;
    orderPort.orders = [
      makeOrder('o-active', true, [orderItem(entryId, 5, 2)]),
      makeOrder('o-dead', false, [orderItem(entryId, 5, 3)]),
    ];

    const preview = service.getPurchasePropagationPreview(purchaseId, 9);

    expect(preview.succeeded).toBe(true);
    expect(preview.data).toMatchObject({
      hasOutflow: true,
      activeOrders: 1,
      deactivatedOrders: 1,
      soldUnits: 2,
      storeUnits: 6,
      from: 5,
      to: 9,
    });
  });

  it('U-F3-5: edición de una compra totalmente consumida = corrección de SOLO costo (decisión #1)', () => {
    const wh = warehouse();
    const purchaseId = purchase(wh.id, 10, 5);
    const sale = saleOut(wh.id, 10); // consume el lote completo
    const entryId = sale[0].inventoryEntryId!;
    orderPort.orders = [makeOrder('o1', true, [orderItem(entryId, 5, 4)])];

    // No queda nada en almacén: antes esto se bloqueaba con PurchaseLotConsumed.
    const result = service.applyPurchaseCostEdit(purchaseId, 0, 9);

    expect(result.succeeded).toBe(true);
    expect(result.data!.costOnly).toBe(true);
    expect(service.getStockLevel(wh.id, 'prod-1')!.onHand).toBe(0);
    // Sin reversa: la compra original NO quedó revertida y no se creó fila nueva.
    expect(service.isReversed(purchaseId)).toBe(false);
    expect(service.getMovements().filter((m) => m.type === 'purchase_in')).toHaveLength(1);
    // Costo corregido en tienda y en la venta.
    const entry = inventorySvc
      .getProductInventoriesByProductId('prod-1')
      .find((e) => e.id === entryId)!;
    expect(entry.costPrice).toBe(9);
    expect(orderPort.orders[0].orderItems[0].productCosts[0].costPrice).toBe(9);
  });

  it('U-F3-6: atribución ambigua (dos compras al mismo costo sin referencia) bloquea', () => {
    const wh = warehouse();
    // Datos viejos: compras importadas sin lotOriginMovementId.
    service.addImportedStockLevel({
      id: 'sl-1',
      warehouseId: wh.id,
      productId: 'prod-1',
      onHand: 20,
      costPrice: 5,
      lots: [{ costPrice: 5, quantity: 20 }],
      createdDate: new Date(),
    });
    for (const id of ['mv-old-1', 'mv-old-2']) {
      service.addImportedMovement({
        id,
        warehouseId: wh.id,
        productId: 'prod-1',
        type: 'purchase_in',
        quantity: 10,
        costPrice: 5,
        reason: null,
        createdDate: new Date(),
        createdByName: 'old',
      });
    }
    service.addImportedMovement({
      id: 'mv-old-sale',
      warehouseId: wh.id,
      productId: 'prod-1',
      type: 'sale_out',
      quantity: 4,
      costPrice: 5,
      reason: null,
      createdDate: new Date(),
      createdByName: 'old',
    });

    const preview = service.getPurchasePropagationPreview('mv-old-1', 7);
    expect(preview.succeeded).toBe(false);
    expect(preview.errors[0]).toEqual(WarehouseErrors.PurchasePropagationAmbiguous);

    const applied = service.applyPurchaseCostEdit('mv-old-1', 10, 7);
    expect(applied.succeeded).toBe(false);
    expect(applied.errors[0]).toEqual(WarehouseErrors.PurchasePropagationAmbiguous);
  });

  it('U-F3-7: "todo o nada" — un fallo al actualizar ventas restaura almacén y entradas', () => {
    const wh = warehouse();
    const purchaseId = purchase(wh.id, 10, 5);
    const sale = saleOut(wh.id, 6);
    const entryId = sale[0].inventoryEntryId!;
    orderPort.orders = [makeOrder('o1', true, [orderItem(entryId, 5, 2)])];
    orderPort.throwOnUpdate = true;

    const result = service.applyPurchaseCostEdit(purchaseId, 4, 7);

    expect(result.succeeded).toBe(false);
    // Almacén restaurado (remanente original @ 5, sin reversa).
    const level = service.getStockLevel(wh.id, 'prod-1')!;
    expect(level.onHand).toBe(4);
    expect(level.lots).toMatchObject([{ costPrice: 5, quantity: 4 }]);
    expect(service.isReversed(purchaseId)).toBe(false);
    expect(service.getMovements().filter((m) => m.type === 'purchase_in')).toHaveLength(1);
    // Entrada de tienda restaurada.
    const entry = inventorySvc
      .getProductInventoriesByProductId('prod-1')
      .find((e) => e.id === entryId)!;
    expect(entry.costPrice).toBe(5);
    expect(orderPort.restoreCalls).toBeGreaterThan(0);
  });

  it('U-F3-8: updateWarehouseOriginEntryCost corrige el costo sin abrir la puerta del CRUD (A8)', () => {
    const wh = warehouse();
    purchase(wh.id, 10, 5);
    const sale = saleOut(wh.id, 6);
    const entryId = sale[0].inventoryEntryId!;

    // La edición por CRUD sigue bloqueada (A8)…
    expect(inventorySvc.update(entryId, 'prod-1', 6, 8).succeeded).toBe(false);
    // …pero la corrección dirigida desde el almacén sí actualiza el costo.
    expect(inventorySvc.updateWarehouseOriginEntryCost('prod-1', entryId, 8).succeeded).toBe(true);
    const entry = inventorySvc
      .getProductInventoriesByProductId('prod-1')
      .find((e) => e.id === entryId)!;
    expect(entry.costPrice).toBe(8);
    // El sello de origen permanece intacto.
    expect(entry.warehouseSaleOutMovementId).toBe(sale[0].id);
  });
});
