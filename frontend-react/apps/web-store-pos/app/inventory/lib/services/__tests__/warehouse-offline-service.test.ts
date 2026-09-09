import { beforeEach, describe, expect, it } from 'vitest';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '../inventory-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';
import type { WarehouseStockLevel } from '@store-mgmt/domain';
import { WarehouseErrors } from '@store-mgmt/domain';

const storeId = 'test-store';

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

describe('WarehouseOfflineService', () => {
  let productRepo: ProductRepository;
  let inventorySvc: InventoryOfflineService;
  let service: WarehouseOfflineService;

  beforeEach(() => {
    localStorage.clear();
    const categoryRepo = new ProductCategoryRepository(storeId);
    productRepo = new ProductRepository(storeId, categoryRepo);
    inventorySvc = new InventoryOfflineService(storeId, productRepo);
    service = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
    seedProduct(productRepo, categoryRepo, 'prod-1', 'Cerveza X');
    seedProduct(productRepo, categoryRepo, 'prod-2', 'Refresco Y');
  });

  // ─── warehouses CRUD ───
  describe('createWarehouse', () => {
    it('creates an active warehouse', () => {
      const result = service.createWarehouse('Almacén Central');
      expect(result.succeeded).toBe(true);
      expect(result.data!.name).toBe('Almacén Central');
      expect(result.data!.isActive).toBe(true);
      expect(service.getStorageWarehouses()).toHaveLength(1);
    });

    it('rejects empty/whitespace names with InvalidName', () => {
      expect(service.createWarehouse('').succeeded).toBe(false);
      expect(service.createWarehouse('   ').succeeded).toBe(false);
      expect(service.createWarehouse('').errors[0]).toEqual(WarehouseErrors.InvalidName);
      expect(service.getStorageWarehouses()).toHaveLength(0);
    });

    it('persists and revives across instances', () => {
      service.createWarehouse('A');
      const fresh = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
      const warehouses = fresh.getStorageWarehouses();
      expect(warehouses).toHaveLength(1);
      expect(warehouses[0].createdDate).toBeInstanceOf(Date);
    });
  });

  describe('updateWarehouse', () => {
    it('renames an existing warehouse', () => {
      const created = service.createWarehouse('A');
      const result = service.updateWarehouse(created.data!.id, 'B');
      expect(result.succeeded).toBe(true);
      expect(result.data!.name).toBe('B');
    });

    it('rejects a blank name', () => {
      const created = service.createWarehouse('A');
      expect(service.updateWarehouse(created.data!.id, '  ').succeeded).toBe(false);
    });

    it('fails NotExists for an unknown id', () => {
      const result = service.updateWarehouse('nope', 'B');
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.NotExists);
    });
  });

  describe('deactivateWarehouse', () => {
    it('deactivates an empty warehouse', () => {
      const created = service.createWarehouse('A');
      const result = service.deactivateWarehouse(created.data!.id);
      expect(result.succeeded).toBe(true);
      expect(service.getWarehouseById(created.data!.id)!.isActive).toBe(false);
    });

    it('blocks deactivation when the warehouse has stock', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 700,
      });
      const result = service.deactivateWarehouse(wh.id);
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.CannotDeactivate);
    });

    it('blocks deactivation when the warehouse has movements but no stock', () => {
      const wh = service.createWarehouse('A').data!;
      const wh2 = service.createWarehouse('B').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 700,
      });
      service.recordMovement({
        type: 'transfer_out',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 10,
        toWarehouseId: wh2.id,
      });
      // wh has zero stock but movement history
      expect(service.getStockLevels(wh.id)[0]?.onHand ?? 0).toBe(0);
      expect(service.deactivateWarehouse(wh.id).succeeded).toBe(false);
    });
  });

  // ─── purchase_in ───
  describe('recordMovement purchase_in', () => {
    it('creates a stock level with the incoming cost', () => {
      const wh = service.createWarehouse('A').data!;
      const result = service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 700,
      });
      expect(result.succeeded).toBe(true);
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(10);
      expect(level.costPrice).toBe(700);
      expect(service.getMovements()).toHaveLength(1);
    });

    it('recomputes the weighted average cost', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 700,
      });
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 500,
      });
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(20);
      expect(level.costPrice).toBe(600);
    });

    it('accepts decimal quantities with round2', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 2.555,
        costPrice: 700,
      });
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(2.56);
    });

    it('requires a costPrice', () => {
      const wh = service.createWarehouse('A').data!;
      const result = service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 0,
      });
      expect(result.succeeded).toBe(false);
    });
  });

  // ─── sale_out → InventoryEntry ───
  describe('recordMovement sale_out', () => {
    it('debits the warehouse AND creates a store InventoryEntry with the warehouse cost', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 24,
        costPrice: 660,
      });
      const result = service.recordMovement({
        type: 'sale_out',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 12,
        reason: 'pedido tienda',
      });
      expect(result.succeeded).toBe(true);

      // warehouse debited
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(12);

      // store entry created with warehouse cost
      const entries = inventorySvc.getProductInventoriesByProductId('prod-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].quantity).toBe(12);
      expect(entries[0].available).toBe(12);
      expect(entries[0].costPrice).toBe(660);

      // movement recorded (append-only)
      const movements = service.getMovements();
      expect(movements).toHaveLength(2); // purchase + sale_out
      expect(movements[1].type).toBe('sale_out');
      expect(movements[1].reason).toBe('pedido tienda');
    });

    it('fails with InsufficientStock and creates nothing', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 5,
        costPrice: 660,
      });
      const result = service.recordMovement({
        type: 'sale_out',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 6,
      });
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.InsufficientStock);
      expect(service.getStockLevel(wh.id, 'prod-1')!.onHand).toBe(5);
      expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toHaveLength(0);
    });

    it('fails when the warehouse is inactive', () => {
      // Un almacén con stock no se puede desactivar (decisión #5), así que se
      // siembra uno inactivo directamente (seam de import).
      const inactiveWh = service.addImportedWarehouse({
        id: 'wh-inactive',
        name: 'Inactivo',
        isActive: false,
        createdDate: new Date(),
        createdByName: 'x',
      });
      expect(inactiveWh.succeeded).toBe(true);
      const result = service.recordMovement({
        type: 'sale_out',
        warehouseId: 'wh-inactive',
        productId: 'prod-1',
        quantity: 1,
      });
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.Inactive);
    });

    it('accepts decimal quantities', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 3,
        costPrice: 660,
      });
      const result = service.recordMovement({
        type: 'sale_out',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 1.5,
      });
      expect(result.succeeded).toBe(true);
      expect(service.getStockLevel(wh.id, 'prod-1')!.onHand).toBe(1.5);
    });

    it('does not debit the warehouse nor record a movement when the store entry fails (BUG-2 atomicity)', () => {
      // The warehouse service validates the product against ITS OWN repo; the
      // inventory service below is backed by a repo for ANOTHER store, so its
      // createInventoryEntry finds no product and returns null — the seam that
      // simulates the store-entry failure without stubs.
      const otherCategoryRepo = new ProductCategoryRepository('other-store');
      const otherProductRepo = new ProductRepository('other-store', otherCategoryRepo);
      const otherInventorySvc = new InventoryOfflineService('other-store', otherProductRepo);
      const failingService = new WarehouseOfflineService(storeId, productRepo, otherInventorySvc);

      const wh = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 5,
        costPrice: 660,
      });

      const result = failingService.recordMovement({
        type: 'sale_out',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 3,
      });

      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.ProductNotExists);

      // The warehouse is NOT debited — in memory AND in persisted storage.
      expect(service.getStockLevel(wh.id, 'prod-1')!.onHand).toBe(5);
      const fresh = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
      expect(fresh.getStockLevel(wh.id, 'prod-1')!.onHand).toBe(5);

      // No sale_out movement was recorded (only the purchase_in), in memory
      // and persisted.
      expect(service.getMovements()).toHaveLength(1);
      expect(fresh.getMovements()).toHaveLength(1);
      expect(fresh.getMovements()[0].type).toBe('purchase_in');

      // No store entry was created.
      expect(inventorySvc.getProductInventoriesByProductId('prod-1')).toHaveLength(0);
    });
  });

  // ─── transfer ───
  describe('recordMovement transfer', () => {
    it('moves stock between warehouses and propagates the cost to a fresh destination', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 24,
        costPrice: 660,
      });

      const result = service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 10,
        toWarehouseId: whB.id,
      });
      expect(result.succeeded).toBe(true);

      expect(service.getStockLevel(whA.id, 'prod-1')!.onHand).toBe(14);
      const levelB = service.getStockLevel(whB.id, 'prod-1')!;
      expect(levelB.onHand).toBe(10);
      expect(levelB.costPrice).toBe(660); // propagated as-is (decisión #4)
    });

    it('rejects transferring to the same warehouse', () => {
      const whA = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 24,
        costPrice: 660,
      });
      const result = service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 10,
        toWarehouseId: whA.id,
      });
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.SameWarehouseTransfer);
    });

    it('fails when the origin lacks stock', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      const result = service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 5,
        toWarehouseId: whB.id,
      });
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.InsufficientStock);
    });

    it('supports transfer_in with a fromWarehouseId', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 24,
        costPrice: 660,
      });
      const result = service.recordMovement({
        type: 'transfer_in',
        warehouseId: whB.id,
        productId: 'prod-1',
        quantity: 8,
        fromWarehouseId: whA.id,
      });
      expect(result.succeeded).toBe(true);
      expect(service.getStockLevel(whA.id, 'prod-1')!.onHand).toBe(16);
      expect(service.getStockLevel(whB.id, 'prod-1')!.onHand).toBe(8);
    });

    // ─── GAP-3: transfer to a destination that ALREADY holds stock (plan 2026-09-08, Paso 4) ───

    it('transfer_out to a destination with prior stock recomputes the weighted cost (GAP-3)', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      // Origin: prod-1 @ $10 (10 units). Destination: prod-1 @ $6 (10 units).
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      service.recordMovement({ type: 'purchase_in', warehouseId: whB.id, productId: 'prod-1', quantity: 10, costPrice: 6 });

      const result = service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 5,
        toWarehouseId: whB.id,
      });
      expect(result.succeeded).toBe(true);

      // Origin: 10 − 5 = 5, cost unchanged.
      expect(service.getStockLevel(whA.id, 'prod-1')!.onHand).toBe(5);
      expect(service.getStockLevel(whA.id, 'prod-1')!.costPrice).toBe(10);

      // Destination: 10 + 5 = 15 at weighted cost ((10×6)+(5×10))/15 = 110/15 = 7.33.
      const levelB = service.getStockLevel(whB.id, 'prod-1')!;
      expect(levelB.onHand).toBe(15);
      expect(levelB.costPrice).toBe(7.33);
    });

    it('transfer_in to a destination with prior stock recomputes the weighted cost (GAP-3)', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      service.recordMovement({ type: 'purchase_in', warehouseId: whB.id, productId: 'prod-1', quantity: 10, costPrice: 6 });

      const result = service.recordMovement({
        type: 'transfer_in',
        warehouseId: whB.id,
        productId: 'prod-1',
        quantity: 5,
        fromWarehouseId: whA.id,
      });
      expect(result.succeeded).toBe(true);

      expect(service.getStockLevel(whA.id, 'prod-1')!.onHand).toBe(5);
      const levelB = service.getStockLevel(whB.id, 'prod-1')!;
      expect(levelB.onHand).toBe(15);
      expect(levelB.costPrice).toBe(7.33);
    });
  });

  // ─── movements ───
  describe('movements list', () => {
    it('is append-only and filterable by warehouse/product', () => {
      const whA = service.createWarehouse('A').data!;
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 700,
      });
      service.recordMovement({
        type: 'purchase_in',
        warehouseId: whA.id,
        productId: 'prod-2',
        quantity: 6,
        costPrice: 500,
      });
      expect(service.getMovements()).toHaveLength(2);
      expect(service.getMovements(whA.id, 'prod-1')).toHaveLength(1);
      expect(service.getMovements(whA.id, 'prod-1')[0].productId).toBe('prod-1');
    });

    it('stamps createdByName and keeps reason null when omitted', () => {
      const whA = service.createWarehouse('A').data!;
      const result = service.recordMovement({
        type: 'purchase_in',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 10,
        costPrice: 700,
      });
      const movement = service.getMovements()[0];
      expect(movement.createdByName).toBe('');
      expect(movement.reason).toBeNull();
      // Plan 2026-09-09 (D8): recordMovement devuelve un array de filas (una
      // por lote tocado) — la compra es siempre una sola fila.
      expect([movement]).toEqual(result.data);
    });
  });

  // ─── import seams ───
  describe('import seams', () => {
    it('adds and updates warehouses by id', () => {
      const created = service.createWarehouse('A').data!;
      const imported = { ...created, name: 'Imported' };
      service.updateImportedWarehouse(imported);
      expect(service.getWarehouseById(created.id)!.name).toBe('Imported');
      const fresh = service.addImportedWarehouse({
        id: 'wh-new',
        name: 'Nuevo',
        isActive: true,
        createdDate: new Date(),
        createdByName: 'x',
      });
      expect(fresh.succeeded).toBe(true);
      expect(service.getWarehouseById('wh-new')!.name).toBe('Nuevo');
    });

    it('adds stock levels without mutating onHand through movement rules', () => {
      const level: WarehouseStockLevel = {
        id: 'sl-1',
        warehouseId: 'wh-x',
        productId: 'prod-1',
        onHand: 50,
        costPrice: 640,
        createdDate: new Date(),
      };
      service.addImportedStockLevel(level);
      expect(service.getStockLevel('wh-x', 'prod-1')!.onHand).toBe(50);
    });

    it('adds movements without duplicating ids', () => {
      const wh = service.createWarehouse('A').data!;
      const movement = {
        id: 'mv-1',
        warehouseId: wh.id,
        productId: 'prod-1',
        type: 'purchase_in' as const,
        quantity: 10,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
      };
      expect(service.addImportedMovement(movement).succeeded).toBe(true);
      expect(service.addImportedMovement(movement).succeeded).toBe(true);
      expect(service.getMovements()).toHaveLength(1);
    });
  });

  // ─── Plan 2026-09-09: lotes FIFO exactos (D8) + reversa (D1-D12) ──────────

  describe('recordMovement — lotes FIFO exactos (D8)', () => {
    it('U-S13c: purchase_in crea un lote nuevo con costo exacto y no recalcula lotes ajenos', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(20);
      expect(level.lots).toEqual([
        { costPrice: 5, quantity: 10 },
        { costPrice: 10, quantity: 10 },
      ]);
      // display ponderado de restantes (F1b): (10×5+10×10)/20 = 7.5
      expect(level.costPrice).toBe(7.5);
    });

    it('U-S13: sale_out persiste costPrice e inventoryEntryId 1:1 en cada fila (D11)', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 24, costPrice: 660 });
      const result = service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 12 });
      expect(result.succeeded).toBe(true);

      const saleMovements = service.getMovements().filter((m) => m.type === 'sale_out');
      expect(saleMovements).toHaveLength(1);
      expect(saleMovements[0].costPrice).toBe(660);
      expect(saleMovements[0].inventoryEntryId).toBeDefined();

      const entries = inventorySvc.getProductInventoriesByProductId('prod-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(saleMovements[0].inventoryEntryId);
      expect(entries[0].costPrice).toBe(660);
    });

    it('U-S13b: sale_out multi-lote crea N filas con costo exacto y enlace 1:1 por fila', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      // Salida de 15: consume 10@$5 y 5@$10 → dos filas.
      const result = service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 15 });
      expect(result.succeeded).toBe(true);

      const saleMovements = service.getMovements().filter((m) => m.type === 'sale_out');
      expect(saleMovements).toHaveLength(2);
      expect(saleMovements[0]).toMatchObject({ quantity: 10, costPrice: 5 });
      expect(saleMovements[1]).toMatchObject({ quantity: 5, costPrice: 10 });
      // Enlace 1:1: cada fila apunta a su propia entrada de tienda.
      expect(saleMovements[0].inventoryEntryId).not.toBe(saleMovements[1].inventoryEntryId);

      const entries = inventorySvc.getProductInventoriesByProductId('prod-1');
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => ({ qty: e.quantity, cost: e.costPrice }))).toEqual([
        { qty: 10, cost: 5 },
        { qty: 5, cost: 10 },
      ]);

      // Origen queda con el lote $10 reducido a 5.
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(5);
      expect(level.lots).toEqual([{ costPrice: 10, quantity: 5 }]);
    });

    it('U-S13d: transfer_out multi-lote acredita el destino por lote con costo exacto (sin mezcla)', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      const result = service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 15,
        toWarehouseId: whB.id,
      });
      expect(result.succeeded).toBe(true);

      // Dos filas de transferencia con su costo exacto.
      const transfers = service.getMovements().filter((m) => m.type === 'transfer_out');
      expect(transfers).toHaveLength(2);
      expect(transfers[0]).toMatchObject({ quantity: 10, costPrice: 5 });
      expect(transfers[1]).toMatchObject({ quantity: 5, costPrice: 10 });

      // Origen queda con 5@$10; destino acredita 10@$5 + 5@$10 separados.
      expect(service.getStockLevel(whA.id, 'prod-1')!.lots).toEqual([{ costPrice: 10, quantity: 5 }]);
      const levelB = service.getStockLevel(whB.id, 'prod-1')!;
      expect(levelB.lots).toEqual([
        { costPrice: 5, quantity: 10 },
        { costPrice: 10, quantity: 5 },
      ]);
      // Display ponderado del destino: (10×5+5×10)/15 = 6.67
      expect(levelB.costPrice).toBe(6.67);
    });

    it('I-3c: el consumo FIFO descuenta primero el lote más viejo', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      const result = service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 12 });
      expect(result.succeeded).toBe(true);
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      // Se consumieron 10@$5 completos y 2@$10 → quedan 8@$10.
      expect(level.lots).toEqual([{ costPrice: 10, quantity: 8 }]);
      expect(level.onHand).toBe(8);
    });

    it('U-S20: nivel legacy sin lots → lote sintético único al costo promedio vigente', () => {
      const wh = service.createWarehouse('A').data!;
      // Nivel legacy sembrado directo por la seam de import (sin lots — dato viejo).
      service.addImportedStockLevel({
        id: 'sl-legacy',
        warehouseId: wh.id,
        productId: 'prod-1',
        onHand: 10,
        costPrice: 7,
        createdDate: new Date(),
      });
      // Cualquier salida consume el lote sintético 10@$7.
      const result = service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 4 });
      expect(result.succeeded).toBe(true);
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.lots).toEqual([{ costPrice: 7, quantity: 6 }]);
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;
      expect(sale.costPrice).toBe(7);
      expect(sale.inventoryEntryId).toBeDefined();
    });

    it('I-3d: GAP-3 bajo lotes — los números display pineados no cambian (7.33)', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      service.recordMovement({ type: 'purchase_in', warehouseId: whB.id, productId: 'prod-1', quantity: 10, costPrice: 6 });
      const result = service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 5,
        toWarehouseId: whB.id,
      });
      expect(result.succeeded).toBe(true);
      const levelB = service.getStockLevel(whB.id, 'prod-1')!;
      expect(levelB.onHand).toBe(15);
      expect(levelB.costPrice).toBe(7.33);
      expect(service.getStockLevel(whA.id, 'prod-1')!.costPrice).toBe(10);
    });
  });

  describe('reverseMovement — guardias (plan F2)', () => {
    function seedPurchased(warehouseName: string, qty: number, cost: number, productId = 'prod-1') {
      const wh = service.createWarehouse(warehouseName).data!;
      const purchase = service.recordMovement({
        type: 'purchase_in',
        warehouseId: wh.id,
        productId,
        quantity: qty,
        costPrice: cost,
      });
      return { wh, purchase: purchase.data![0] };
    }

    it('U-S12: movimiento inexistente → MovementNotFound', () => {
      const result = service.reverseMovement('nope');
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.MovementNotFound);
    });

    it('U-S11: no se revierte una reversa → ReversalNotReversible', () => {
      const { wh } = seedPurchased('A', 10, 5);
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 3 });
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;
      const reversal = service.reverseMovement(sale.id);
      expect(reversal.succeeded).toBe(true);
      const reversalRow = service.getMovements().find((m) => m.type === 'reversal')!;
      const again = service.reverseMovement(reversalRow.id);
      expect(again.succeeded).toBe(false);
      expect(again.errors[0]).toEqual(WarehouseErrors.ReversalNotReversible);
    });

    it('U-S9: segunda reversa del mismo original → ReversalAlreadyExists', () => {
      const { wh } = seedPurchased('A', 10, 5);
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 3 });
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;
      expect(service.reverseMovement(sale.id).succeeded).toBe(true);
      const again = service.reverseMovement(sale.id);
      expect(again.succeeded).toBe(false);
      expect(again.errors[0]).toEqual(WarehouseErrors.ReversalAlreadyExists);
    });

    it('U-S10: transfer_in no es reversible → TransferInNotReversible', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({
        type: 'transfer_in',
        warehouseId: whB.id,
        productId: 'prod-1',
        quantity: 4,
        fromWarehouseId: whA.id,
      });
      const transferIn = service.getMovements().find((m) => m.type === 'transfer_in')!;
      const result = service.reverseMovement(transferIn.id);
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.TransferInNotReversible);
    });

    it('U-S12b: almacén involucrado desactivado → WarehouseNotActive', () => {
      // Almacén con movimiento history y stock 0 tras transferir todo, luego revertir la compra
      // con el almacén DESACTIVADO — para desactivarlo hacen falta 0 vivos + 0 stock: primero
      // revertimos la compra y la transferencia, desactivamos, y re-sembramos un nivel importado
      // inactivo... más simple: siembra de almacén inactivo por seam + compra importada.
      const inactive = service.addImportedWarehouse({
        id: 'wh-off',
        name: 'Off',
        isActive: false,
        createdDate: new Date(),
        createdByName: 'x',
      });
      expect(inactive.succeeded).toBe(true);
      service.addImportedMovement({
        id: 'mv-purchase-off',
        warehouseId: 'wh-off',
        productId: 'prod-1',
        type: 'purchase_in',
        quantity: 10,
        costPrice: 5,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
      });
      const result = service.reverseMovement('mv-purchase-off');
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.WarehouseNotActive);
    });
  });

  describe('reverseMovement — efectos por tipo (lotes exactos, D8)', () => {
    it('U-S1: reversa de purchase_in reduce el lote exacto y recalcula display', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      const purchase = service.getMovements().find((m) => m.type === 'purchase_in' && m.costPrice === 5)!;

      const result = service.reverseMovement(purchase.id, 'error de carga');
      expect(result.succeeded).toBe(true);

      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(10);
      expect(level.lots).toEqual([{ costPrice: 10, quantity: 10 }]);
      expect(level.costPrice).toBe(10); // display = lote restante exacto

      const reversal = service.getMovements().find((m) => m.type === 'reversal')!;
      expect(reversal).toMatchObject({
        reversalOfMovementId: purchase.id,
        quantity: 10,
        costPrice: 5,
        reason: 'error de carga',
      });
      // U-S15: isReversed
      expect(service.isReversed(purchase.id)).toBe(true);
    });

    it('U-S1b: reversa de compra con lote parcialmente consumido devuelve SOLO las restantes (D9)', () => {
      const wh = service.createWarehouse('A').data!;
      const p1 = service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      const purchase = p1.data![0];
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      // Transfiere 5: consume del lote $5 → quedan 5@$5.
      service.recordMovement({
        type: 'transfer_out',
        warehouseId: wh.id,
        productId: 'prod-1',
        quantity: 5,
        toWarehouseId: service.createWarehouse('B').data!.id,
      });

      const result = service.reverseMovement(purchase.id);
      expect(result.succeeded).toBe(true);
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      // La reversa quita SOLO las 5 restantes del lote $5 (las 5 transferidas
      // ya no están — D9); el lote $10 queda intacto.
      expect(level.lots).toEqual([{ costPrice: 10, quantity: 10 }]);
      expect(level.onHand).toBe(10);
      const reversal = service.getMovements().find((m) => m.type === 'reversal')!;
      expect(reversal.quantity).toBe(5);
      expect(reversal.costPrice).toBe(5);
    });

    it('U-S1c: reversa de compra con lote totalmente consumido → PurchaseLotConsumed', () => {
      const wh = service.createWarehouse('A').data!;
      const p1 = service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      const purchase = p1.data![0];
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 10 });

      const result = service.reverseMovement(purchase.id);
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.PurchaseLotConsumed);
    });

    it('U-S2: reversa de compra sin stock del producto → InsufficientStock', () => {
      const wh = service.createWarehouse('A').data!;
      const p1 = service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      const purchase = p1.data![0];
      // Salida total (entrada de tienda creada) → 0 stock.
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 10 });
      const result = service.reverseMovement(purchase.id);
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.PurchaseLotConsumed);
    });

    it('U-S3: reversa de sale_out con enlace exacto — entrada íntegra se elimina (soft) y onHand sube al costo exacto', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 24, costPrice: 660 });
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 12 });
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;
      const entryId = sale.inventoryEntryId!;

      const result = service.reverseMovement(sale.id);
      expect(result.succeeded).toBe(true);

      // Almacén re-acredita el lote exacto.
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(24);
      expect(level.lots).toEqual([{ costPrice: 660, quantity: 24 }]);

      // La entrada de tienda queda soft-deleted (isActive=false — no vuelve al
      // ciclo FIFO de getAvailableInventoryCosts, que filtra isActive).
      const entry = inventorySvc
        .getProductInventoriesByProductId('prod-1')
        .find((e) => e.id === entryId);
      expect(entry).toBeDefined();
      expect(entry!.isActive).toBe(false);

      const reversal = service.getMovements().find((m) => m.type === 'reversal')!;
      expect(reversal.reversalInventoryEntryId).toBe(entryId);
      expect(reversal.costPrice).toBe(660);
    });

    it('U-S5/U-S6: sale_out parcialmente consumida bloquea; totalmente consumida bloquea', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 24, costPrice: 660 });
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 12 });
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;

      // Venta FIFO parcial de 5 sobre la entrada de 12.
      inventorySvc.getAvailableInventoryCosts('prod-1', 5);

      const partial = service.reverseMovement(sale.id);
      expect(partial.succeeded).toBe(false);
      expect(partial.errors[0]).toEqual(WarehouseErrors.SaleOutAlreadyConsumed);

      // Consumo total (7 restantes).
      inventorySvc.getAvailableInventoryCosts('prod-1', 7);
      const total = service.reverseMovement(sale.id);
      expect(total.succeeded).toBe(false);
      expect(total.errors[0]).toEqual(WarehouseErrors.SaleOutAlreadyConsumed);
    });

    it('U-S7: reversa de transfer_out devuelve al origen y resta del destino, lotes exactos en ambos', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 6,
        toWarehouseId: whB.id,
      });
      const transfer = service.getMovements().find((m) => m.type === 'transfer_out')!;

      const result = service.reverseMovement(transfer.id);
      expect(result.succeeded).toBe(true);

      // Origen recupera 6@$5; destino queda en 0.
      expect(service.getStockLevel(whA.id, 'prod-1')!.lots).toEqual([{ costPrice: 5, quantity: 10 }]);
      expect(service.getStockLevel(whB.id, 'prod-1')!.onHand).toBe(0);
      expect(service.getStockLevel(whB.id, 'prod-1')!.lots).toEqual([]);

      const reversal = service.getMovements().find((m) => m.type === 'reversal')!;
      expect(reversal.costPrice).toBe(5);
      expect(reversal.quantity).toBe(6);
    });

    it('U-S8: reversa de transfer_out cuando el destino ya gastó las unidades → InsufficientStock', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({
        type: 'transfer_out',
        warehouseId: whA.id,
        productId: 'prod-1',
        quantity: 6,
        toWarehouseId: whB.id,
      });
      const transfer = service.getMovements().find((m) => m.type === 'transfer_out')!;
      // B consume sus 6 (sale_out a tienda).
      service.recordMovement({ type: 'sale_out', warehouseId: whB.id, productId: 'prod-1', quantity: 6 });

      const result = service.reverseMovement(transfer.id);
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.InsufficientStock);
    });
  });

  describe('reverseMovement — huella legacy (D11)', () => {
    it('U-S4: salida legacy sin enlace — huella única revierte; 0 y >1 coincidencias bloquean', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      // Salida legacy: fila sin costPrice ni inventoryEntryId (dato viejo) + entrada manual igual.
      service.addImportedMovement({
        id: 'mv-legacy-sale',
        warehouseId: wh.id,
        productId: 'prod-1',
        type: 'sale_out',
        quantity: 4,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
      });
      const entryResult = inventorySvc.createInventoryEntry('prod-1', 4, 5);
      expect(entryResult).not.toBeNull();
      expect(entryResult!.succeeded).toBe(true);

      // Nivel tras la reversa: la salida legacy nunca consumió lotes (fila
      // importada de datos viejos — el nivel ya refleja la historia previa),
      // así que la reversa re-acredita 4 unidades al lote sintético $5 → 14.
      const result = service.reverseMovement('mv-legacy-sale');
      expect(result.succeeded).toBe(true);
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(14);
      const reversal = service.getMovements().find((m) => m.type === 'reversal')!;
      expect(reversal.reversalInventoryEntryId).toBe(entryResult!.data!.id);

      // 0 coincidencias: salida legacy sin entrada asociada.
      service.addImportedMovement({
        id: 'mv-legacy-sale-2',
        warehouseId: wh.id,
        productId: 'prod-1',
        type: 'sale_out',
        quantity: 2,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
      });
      const noEntry = service.reverseMovement('mv-legacy-sale-2');
      expect(noEntry.succeeded).toBe(false);
      expect(noEntry.errors[0]).toEqual(WarehouseErrors.SaleOutEntryNotFound);

      // >1 coincidencias: dos entradas idénticas activas (huella ambigua).
      inventorySvc.createInventoryEntry('prod-1', 2, 5);
      inventorySvc.createInventoryEntry('prod-1', 2, 5);
      service.addImportedMovement({
        id: 'mv-legacy-sale-3',
        warehouseId: wh.id,
        productId: 'prod-1',
        type: 'sale_out',
        quantity: 2,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
      });
      const ambiguous = service.reverseMovement('mv-legacy-sale-3');
      expect(ambiguous.succeeded).toBe(false);
      expect(ambiguous.errors[0]).toEqual(WarehouseErrors.SaleOutAmbiguousEntry);
    });

    it('U-S6b: entrada encontrada pero isActive=false → SaleOutEntryNotFound', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      const entry = inventorySvc.createInventoryEntry('prod-1', 4, 5);
      inventorySvc.deleteInventoryEntry('prod-1', entry!.data!.id);
      service.addImportedMovement({
        id: 'mv-legacy-inactive-entry',
        warehouseId: wh.id,
        productId: 'prod-1',
        type: 'sale_out',
        quantity: 4,
        reason: null,
        createdDate: new Date(),
        createdByName: 'x',
      });
      const result = service.reverseMovement('mv-legacy-inactive-entry');
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.SaleOutEntryNotFound);
    });
  });

  describe('deactivateWarehouse — recuento de vivos (D5/D12)', () => {
    it('U-S16: todos los movimientos revertidos + stock 0 → desactiva', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 10 });
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;
      expect(service.reverseMovement(sale.id).succeeded).toBe(true);
      const purchase = service.getMovements().find((m) => m.type === 'purchase_in')!;
      expect(service.reverseMovement(purchase.id).succeeded).toBe(true);

      const result = service.deactivateWarehouse(wh.id);
      expect(result.succeeded).toBe(true);
      expect(service.getWarehouseById(wh.id)!.isActive).toBe(false);
    });

    it('U-S16b: stock > 0 aunque todo revertido → bloquea', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      const purchase = service.getMovements().find((m) => m.type === 'purchase_in')!;
      expect(service.reverseMovement(purchase.id).succeeded).toBe(true); // reversa total → prod-1 en 0

      // Stock vivo de OTRO producto (nivel importado) — la guardia debe seguir bloqueando.
      service.addImportedStockLevel({
        id: 'sl-extra',
        warehouseId: wh.id,
        productId: 'prod-2',
        onHand: 3,
        costPrice: 5,
        createdDate: new Date(),
      });
      const result = service.deactivateWarehouse(wh.id);
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.CannotDeactivate);
    });

    it('U-S17: movimiento vivo → bloquea (regresión del comportamiento actual)', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      const result = service.deactivateWarehouse(wh.id);
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.CannotDeactivate);
    });
  });

  // ─── Integration: cruce con InventoryOfflineService (ventas FIFO) ─────────

  describe('integration — costos exactos a la tienda (D8)', () => {
    it('I-3: sale_out multi-lote → dos entradas FIFO para getAvailableInventoryCosts', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 15 });

      // Venta FIFO de 12: consume 10@$5 primero, luego 2@$10.
      const costs = inventorySvc.getAvailableInventoryCosts('prod-1', 12);
      expect(costs).toEqual([
        { inventoryId: expect.any(String), costPrice: 5, quantity: 10 },
        { inventoryId: expect.any(String), costPrice: 10, quantity: 2 },
      ]);
    });

    it('I-1: venta tras sale_out+reversa — la entrada restaurada ya no es consumible', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 6 });
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;
      expect(service.reverseMovement(sale.id).succeeded).toBe(true);

      // Sin entradas activas: getAvailableInventoryCosts no puede consumir nada.
      const costs = inventorySvc.getAvailableInventoryCosts('prod-1', 1);
      expect(costs).toEqual([]);
    });

    it('I-2: reversa bloqueada no altera el FIFO de la entrada original', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 10 });
      const sale = service.getMovements().find((m) => m.type === 'sale_out')!;
      inventorySvc.getAvailableInventoryCosts('prod-1', 4); // consumo parcial

      const blocked = service.reverseMovement(sale.id);
      expect(blocked.succeeded).toBe(false);
      // La entrada sigue consumible por 6.
      const costs = inventorySvc.getAvailableInventoryCosts('prod-1', 6);
      expect(costs).toEqual([{ inventoryId: expect.any(String), costPrice: 5, quantity: 6 }]);
    });

    it('I-3e: reversa de compra multi-lote toca solo su lote', () => {
      const wh = service.createWarehouse('A').data!;
      const p1 = service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 5 });
      const purchase5 = p1.data![0];
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 10 });
      // Consume 5 del lote $5 vía transferencia.
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'transfer_out', warehouseId: wh.id, productId: 'prod-1', quantity: 5, toWarehouseId: whB.id });

      const result = service.reverseMovement(purchase5.id);
      expect(result.succeeded).toBe(true);
      // La reversa quita SOLO las 5 restantes del lote $5 (las 5 transferidas
      // ya salieron); el lote $10 queda intacto — la reversa es por-lote (D9/D10).
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.lots).toEqual([{ costPrice: 10, quantity: 10 }]);
      expect(level.onHand).toBe(10);
      const reversal = service.getMovements().find((m) => m.type === 'reversal')!;
      expect(reversal.quantity).toBe(5);
      expect(reversal.costPrice).toBe(5);
    });
  });
});
