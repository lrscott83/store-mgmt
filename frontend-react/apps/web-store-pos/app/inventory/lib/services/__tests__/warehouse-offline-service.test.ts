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
  categoryRepo.addImportedProductCategory({ id: 'cat-1', name: 'Cerveza', order: 1, isActive: true });
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
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 700 });
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 500 });
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(20);
      expect(level.costPrice).toBe(600);
    });

    it('accepts decimal quantities with round2', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 2.555, costPrice: 700 });
      const level = service.getStockLevel(wh.id, 'prod-1')!;
      expect(level.onHand).toBe(2.56);
    });

    it('requires a costPrice', () => {
      const wh = service.createWarehouse('A').data!;
      const result = service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 10, costPrice: 0 });
      expect(result.succeeded).toBe(false);
    });
  });

  // ─── sale_out → InventoryEntry ───
  describe('recordMovement sale_out', () => {
    it('debits the warehouse AND creates a store InventoryEntry with the warehouse cost', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 24, costPrice: 660 });
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
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 5, costPrice: 660 });
      const result = service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 6 });
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
      const result = service.recordMovement({ type: 'sale_out', warehouseId: 'wh-inactive', productId: 'prod-1', quantity: 1 });
      expect(result.succeeded).toBe(false);
      expect(result.errors[0]).toEqual(WarehouseErrors.Inactive);
    });

    it('accepts decimal quantities', () => {
      const wh = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: wh.id, productId: 'prod-1', quantity: 3, costPrice: 660 });
      const result = service.recordMovement({ type: 'sale_out', warehouseId: wh.id, productId: 'prod-1', quantity: 1.5 });
      expect(result.succeeded).toBe(true);
      expect(service.getStockLevel(wh.id, 'prod-1')!.onHand).toBe(1.5);
    });
  });

  // ─── transfer ───
  describe('recordMovement transfer', () => {
    it('moves stock between warehouses and propagates the cost to a fresh destination', () => {
      const whA = service.createWarehouse('A').data!;
      const whB = service.createWarehouse('B').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 24, costPrice: 660 });

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
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 24, costPrice: 660 });
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
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 24, costPrice: 660 });
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
  });

  // ─── movements ───
  describe('movements list', () => {
    it('is append-only and filterable by warehouse/product', () => {
      const whA = service.createWarehouse('A').data!;
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 700 });
      service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-2', quantity: 6, costPrice: 500 });
      expect(service.getMovements()).toHaveLength(2);
      expect(service.getMovements(whA.id, 'prod-1')).toHaveLength(1);
      expect(service.getMovements(whA.id, 'prod-1')[0].productId).toBe('prod-1');
    });

    it('stamps createdByName and keeps reason null when omitted', () => {
      const whA = service.createWarehouse('A').data!;
      const result = service.recordMovement({ type: 'purchase_in', warehouseId: whA.id, productId: 'prod-1', quantity: 10, costPrice: 700 });
      const movement = service.getMovements()[0];
      expect(movement.createdByName).toBe('');
      expect(movement.reason).toBeNull();
      expect(movement).toEqual(result.data);
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
});