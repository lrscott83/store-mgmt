import { beforeEach, describe, expect, it } from 'vitest';
import type { Elaboration } from '@store-mgmt/domain';
import { ElaborationErrors, RecipeErrors } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ElaborationOfflineService } from '../elaboration-offline-service';
import { InventoryOfflineService } from '../inventory-offline-service';
import { RecipeOfflineService, type RecipeInput } from '../recipe-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';

const storeId = 'test-store';

function seedProduct(productRepo: ProductRepository, id: string, name: string): void {
  productRepo.addImportedProduct({
    id,
    name,
    categoryId: 'cat-1',
    categoryName: 'Elaborados',
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

describe('ElaborationOfflineService', () => {
  let productRepo: ProductRepository;
  let inventorySvc: InventoryOfflineService;
  let warehouseSvc: WarehouseOfflineService;
  let recipeSvc: RecipeOfflineService;
  let service: ElaborationOfflineService;
  let warehouseId: string;

  function recipeInput(overrides: Partial<RecipeInput> = {}): RecipeInput {
    return {
      productId: 'pan',
      outputQty: 20,
      components: [
        { productId: 'harina', qty: 3, scrapPct: 2 },
        { productId: 'levadura', qty: 0.05, scrapPct: 0 },
        { productId: 'sal', qty: 0.04, scrapPct: 0 },
        { productId: 'agua', qty: 2, scrapPct: 5 },
      ],
      laborCost: 50,
      overheadPct: 10,
      ...overrides,
    };
  }

  function seedStock(productId: string, quantity: number, costPrice: number): void {
    const result = warehouseSvc.recordMovement({
      type: 'purchase_in',
      warehouseId,
      productId,
      quantity,
      costPrice,
    });
    expect(result.succeeded).toBe(true);
  }

  function movementsOfType(type: string): number {
    return warehouseSvc.getMovements().filter((movement) => movement.type === type).length;
  }

  beforeEach(() => {
    localStorage.clear();
    const categoryRepo = new ProductCategoryRepository(storeId);
    categoryRepo.addImportedProductCategory({
      id: 'cat-1',
      name: 'Elaborados',
      order: 1,
      isActive: true,
    });
    productRepo = new ProductRepository(storeId, categoryRepo);
    seedProduct(productRepo, 'pan', 'Pan de 500g');
    seedProduct(productRepo, 'harina', 'Harina');
    seedProduct(productRepo, 'levadura', 'Levadura');
    seedProduct(productRepo, 'sal', 'Sal');
    seedProduct(productRepo, 'agua', 'Agua');

    inventorySvc = new InventoryOfflineService(storeId, productRepo);
    warehouseSvc = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
    recipeSvc = new RecipeOfflineService(storeId, productRepo);
    service = new ElaborationOfflineService(
      storeId,
      productRepo,
      recipeSvc,
      warehouseSvc,
      inventorySvc,
    );
    warehouseId = warehouseSvc.createWarehouse('Central').data!.id;
  });

  // ─── confirm: the happy path ───
  describe('confirmElaboration — happy path', () => {
    it('produces consumption/elaboration movements, the record and the store entry', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const result = service.confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 });

      expect(result.succeeded).toBe(true);
      const elaboration = result.data!;
      expect(service.getElaborations()).toHaveLength(1);
      expect(elaboration.producedQty).toBe(20);
      expect(elaboration.batches).toBe(1);

      // Movements: 4 purchases + 4 consumption_out + 1 elaboration_in.
      expect(movementsOfType('purchase_in')).toBe(4);
      expect(movementsOfType('consumption_out')).toBe(4);
      expect(movementsOfType('elaboration_in')).toBe(1);
      expect(warehouseSvc.getStockLevel(warehouseId, 'harina')!.onHand).toBeCloseTo(96.94, 2);

      // The sellable store entry, at the REAL unit cost.
      const entries = inventorySvc.getProductInventoriesByProductId('pan');
      expect(entries).toHaveLength(1);
      expect(entries[0].quantity).toBe(20);
      expect(entries[0].costPrice).toBe(6.18);
    });

    it('snapshots the pinned real cost (total 123.535, unit 6.18)', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const elaboration = service.confirmElaboration({
        recipeId: recipe.id,
        warehouseId,
        batches: 1,
      }).data!;

      expect(elaboration.components).toEqual([
        { productId: 'harina', theoreticalQty: 3.06, actualQty: 3.06, costPrice: 20 },
        { productId: 'levadura', theoreticalQty: 0.05, actualQty: 0.05, costPrice: 80 },
        { productId: 'sal', theoreticalQty: 0.04, actualQty: 0.04, costPrice: 15 },
        { productId: 'agua', theoreticalQty: 2.1, actualQty: 2.1, costPrice: 0.5 },
      ]);
      expect(elaboration.laborCost).toBe(50);
      expect(elaboration.overheadPct).toBe(10);
      expect(elaboration.totalCost).toBe(123.535);
      expect(elaboration.unitCost).toBe(6.18);
      expect(elaboration.recipeName).toBe('Pan de 500g');
      expect(elaboration.createdDate).toBeInstanceOf(Date);
    });

    it('uses the warehouse level costPrice for the snapshot', () => {
      seedStock('harina', 100, 33.33);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const elaboration = service.confirmElaboration({
        recipeId: recipe.id,
        warehouseId,
        batches: 1,
      }).data!;

      expect(elaboration.components[0].costPrice).toBe(33.33);
    });

    it('scales produced quantity and labor with the batch count', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const elaboration = service.confirmElaboration({
        recipeId: recipe.id,
        warehouseId,
        batches: 2,
      }).data!;

      expect(elaboration.producedQty).toBe(40);
      expect(elaboration.laborCost).toBe(100);
      expect(elaboration.components[0].theoreticalQty).toBe(6.12);
      expect(movementsOfType('elaboration_in')).toBe(1);
    });
  });

  // ─── atomicity ───
  describe('confirmElaboration — insufficient stock is atomic', () => {
    it('blocks ALL writes when an ingredient does not have enough stock', () => {
      seedStock('harina', 1, 20); // recipe needs 3.06
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const result = service.confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 });

      expect(result.succeeded).toBe(false);
      expect(result.errors[0].code).toBe(ElaborationErrors.InsufficientStock.code);
      expect(result.errors[0].description).toContain('Harina');
      expect(result.errors[0].description).toContain('3.06');
      // Zero records, zero entries, zero consumption/production movements.
      expect(service.getElaborations()).toHaveLength(0);
      expect(inventorySvc.getProductInventoriesByProductId('pan')).toHaveLength(0);
      expect(movementsOfType('consumption_out')).toBe(0);
      expect(movementsOfType('elaboration_in')).toBe(0);
      expect(warehouseSvc.getMovements()).toHaveLength(4); // only the purchases
      expect(warehouseSvc.getStockLevel(warehouseId, 'harina')!.onHand).toBe(1);
    });

    it('rejects an unknown recipe and an unknown warehouse', () => {
      const missingRecipe = service.confirmElaboration({
        recipeId: 'nope',
        warehouseId,
        batches: 1,
      });
      expect(missingRecipe.succeeded).toBe(false);
      expect(missingRecipe.errors).toEqual([RecipeErrors.ProductNotExists]);

      const recipe = recipeSvc.addRecipe(recipeInput()).data!;
      const missingWarehouse = service.confirmElaboration({
        recipeId: recipe.id,
        warehouseId: 'nope',
        batches: 1,
      });
      expect(missingWarehouse.succeeded).toBe(false);
      expect(missingWarehouse.errors).toEqual([ElaborationErrors.WarehouseNotExists]);
    });
  });

  // ─── scrap + real divergence ───
  describe('scrap and real divergence', () => {
    it('inflates the theoretical quantity by the scrap percentage', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const elaboration = service.confirmElaboration({
        recipeId: recipe.id,
        warehouseId,
        batches: 1,
      }).data!;

      // harina 3 × 1.02 = 3.06 ; agua 2 × 1.05 = 2.10
      expect(elaboration.components[0].theoreticalQty).toBe(3.06);
      expect(elaboration.components[3].theoreticalQty).toBe(2.1);
    });

    it('an edited actualQty diverges the real cost from the estimate', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const elaboration = service.confirmElaboration({
        recipeId: recipe.id,
        warehouseId,
        batches: 1,
        actualComponents: [{ productId: 'harina', actualQty: 3.2 }],
      }).data!;

      expect(elaboration.components[0]).toEqual({
        productId: 'harina',
        theoreticalQty: 3.06,
        actualQty: 3.2,
        costPrice: 20,
      });
      // 3.2×20 + 0.05×80 + 0.04×15 + 2.1×0.5 = 69.65 → +6.965 + 50 = 126.615 → /20 = 6.33
      expect(elaboration.totalCost).toBeCloseTo(126.615, 10);
      expect(elaboration.unitCost).toBe(6.33);
      expect(elaboration.unitCost).not.toBe(6.18);
      // The real consumption is what actually left the warehouse.
      expect(warehouseSvc.getStockLevel(warehouseId, 'harina')!.onHand).toBeCloseTo(96.8, 2);
    });
  });

  // ─── immutability ───
  describe('immutability', () => {
    it('has no update/delete API and keeps a confirmed record frozen', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const first = service
        .confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 })
        .data!;
      const snapshot = JSON.parse(JSON.stringify(first)) as Elaboration;

      // A second elaboration appends; it never rewrites the first.
      service.confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 });
      expect(service.getElaborations()).toHaveLength(2);
      expect(service.getElaborations()[0]).toEqual({
        ...snapshot,
        createdDate: first.createdDate,
      });

      const surface = service as unknown as Record<string, unknown>;
      expect(surface.updateElaboration).toBeUndefined();
      expect(surface.deleteElaboration).toBeUndefined();
    });
  });

  // ─── persistence / import ───
  describe('persistence and import seams', () => {
    it('revives dates and round-trips through the JSON import seam', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;
      const created = service
        .confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 })
        .data!;

      const json = service.getStorageElaborationsJson();
      const parsed = JSON.parse(json) as Elaboration[];
      expect(parsed).toHaveLength(1);

      const other = new ElaborationOfflineService(
        storeId,
        productRepo,
        recipeSvc,
        warehouseSvc,
        inventorySvc,
      );
      // Fresh cache (empty) reads the persisted row with a revived Date.
      const reloaded = other.getElaborations()[0];
      expect(reloaded.createdDate).toBeInstanceOf(Date);
      expect(reloaded.id).toBe(created.id);

      const imported = new ElaborationOfflineService(
        storeId,
        productRepo,
        recipeSvc,
        warehouseSvc,
        inventorySvc,
      );
      localStorage.clear();
      const res = imported.addImportedElaboration(parsed[0]);
      expect(res.succeeded).toBe(true);
      const roundTripped = imported.getElaborations()[0];
      expect(roundTripped.createdDate).toBeInstanceOf(Date);
      expect(roundTripped.createdDate.getTime()).toBe(created.createdDate.getTime());
      expect(roundTripped.components).toEqual(created.components);
    });

    it('keeps elaborations isolated per store', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;
      service.confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 });

      const otherStore = new ElaborationOfflineService(
        'store-b',
        productRepo,
        recipeSvc,
        warehouseSvc,
        inventorySvc,
      );
      expect(otherStore.getElaborations()).toHaveLength(0);
    });

    it('refreshes a non-empty cache before writes so concurrent instances do not lose rows', () => {
      seedStock('harina', 100, 20);
      seedStock('levadura', 100, 80);
      seedStock('sal', 100, 15);
      seedStock('agua', 100, 0.5);
      const recipe = recipeSvc.addRecipe(recipeInput()).data!;

      const writerA = new ElaborationOfflineService(
        storeId,
        productRepo,
        recipeSvc,
        warehouseSvc,
        inventorySvc,
      );
      const writerB = new ElaborationOfflineService(
        storeId,
        productRepo,
        recipeSvc,
        warehouseSvc,
        inventorySvc,
      );

      expect(writerA.confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 }).succeeded).toBe(true);
      // Warm writerB's cache to a NON-empty, now-stale snapshot.
      expect(writerB.getElaborations()).toHaveLength(1);

      expect(writerA.confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 }).succeeded).toBe(true);
      expect(writerB.confirmElaboration({ recipeId: recipe.id, warehouseId, batches: 1 }).succeeded).toBe(true);

      const fresh = new ElaborationOfflineService(
        storeId,
        productRepo,
        recipeSvc,
        warehouseSvc,
        inventorySvc,
      );
      // writerB's stale cache must not have dropped writerA's second row.
      expect(fresh.getElaborations()).toHaveLength(3);
    });
  });
});
