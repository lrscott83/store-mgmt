import { beforeEach, describe, expect, it } from 'vitest';
import type { Recipe } from '@store-mgmt/domain';
import { RecipeErrors } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { RecipeOfflineService, type RecipeInput } from '../recipe-offline-service';

const storeId = 'test-store';

/** Two finished/ingredient products so every recipe validation has real targets. */
function seedProduct(productRepo: ProductRepository, id: string, name: string): void {
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

describe('RecipeOfflineService', () => {
  let productRepo: ProductRepository;
  let service: RecipeOfflineService;

  function recipeInput(overrides: Partial<RecipeInput> = {}): RecipeInput {
    return {
      productId: 'prod-1',
      outputQty: 20,
      components: [
        { productId: 'prod-2', qty: 3, scrapPct: 2 },
        { productId: 'prod-3', qty: 0.05, scrapPct: 0 },
      ],
      laborCost: 50,
      overheadPct: 10,
      ...overrides,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    const categoryRepo = new ProductCategoryRepository(storeId);
    categoryRepo.addImportedProductCategory({
      id: 'cat-1',
      name: 'Cerveza',
      order: 1,
      isActive: true,
    });
    productRepo = new ProductRepository(storeId, categoryRepo);
    seedProduct(productRepo, 'prod-1', 'Pan de 500g');
    seedProduct(productRepo, 'prod-2', 'Harina');
    seedProduct(productRepo, 'prod-3', 'Levadura');
    service = new RecipeOfflineService(storeId, productRepo);
  });

  // ─── read ───
  describe('getStorageRecipes', () => {
    it('returns an empty array when the store has no recipes', () => {
      expect(service.getStorageRecipes()).toEqual([]);
    });

    it('persists and revives recipes across instances', () => {
      const created = service.addRecipe(recipeInput());
      expect(created.succeeded).toBe(true);

      const fresh = new RecipeOfflineService(storeId, productRepo);
      const recipes = fresh.getStorageRecipes();
      expect(recipes).toHaveLength(1);
      // createdDate is revived to a real Date instance.
      expect(recipes[0].createdDate).toBeInstanceOf(Date);
      expect(recipes[0].components).toEqual([
        { productId: 'prod-2', qty: 3, scrapPct: 2 },
        { productId: 'prod-3', qty: 0.05, scrapPct: 0 },
      ]);
    });
  });

  describe('getRecipeById / getActiveRecipeForProduct', () => {
    it('finds a recipe by id and undefined for an unknown id', () => {
      const created = service.addRecipe(recipeInput()).data!;
      expect(service.getRecipeById(created.id)?.id).toBe(created.id);
      expect(service.getRecipeById('nope')).toBeUndefined();
    });

    it('finds the active recipe of a product and ignores an inactive one', () => {
      const created = service.addRecipe(recipeInput()).data!;
      expect(service.getActiveRecipeForProduct('prod-1')?.id).toBe(created.id);
      expect(service.getActiveRecipeForProduct('prod-2')).toBeUndefined();

      service.deactivateRecipe(created.id);
      expect(service.getActiveRecipeForProduct('prod-1')).toBeUndefined();
    });
  });

  // ─── addRecipe ───
  describe('addRecipe', () => {
    it('creates an active recipe with audit stamps and defaults', () => {
      const result = service.addRecipe(recipeInput());

      expect(result.succeeded).toBe(true);
      expect(result.data!.isActive).toBe(true);
      expect(result.data!.createdDate).toBeInstanceOf(Date);
      expect(result.data!.createdByName).toBeDefined();
      expect(result.data!.outputQty).toBe(20);
      expect(result.data!.laborCost).toBe(50);
      expect(result.data!.overheadPct).toBe(10);
      expect(service.getStorageRecipes()).toHaveLength(1);
    });

    it('defaults laborCost and overheadPct to 0 when omitted', () => {
      const result = service.addRecipe(
        recipeInput({ laborCost: undefined, overheadPct: undefined }),
      );
      expect(result.succeeded).toBe(true);
      expect(result.data!.laborCost).toBe(0);
      expect(result.data!.overheadPct).toBe(0);
    });

    it('rejects a second ACTIVE recipe for the same product with DuplicateForProduct', () => {
      expect(service.addRecipe(recipeInput()).succeeded).toBe(true);

      const duplicate = service.addRecipe(recipeInput({ outputQty: 30 }));
      expect(duplicate.succeeded).toBe(false);
      expect(duplicate.errors).toEqual([RecipeErrors.DuplicateForProduct]);
      expect(service.getStorageRecipes()).toHaveLength(1);
    });

    it('rejects a recipe whose finished product does not exist', () => {
      const result = service.addRecipe(recipeInput({ productId: 'nope' }));
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([RecipeErrors.ProductNotExists]);
      expect(service.getStorageRecipes()).toHaveLength(0);
    });

    it('rejects an empty components list', () => {
      const result = service.addRecipe(recipeInput({ components: [] }));
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([RecipeErrors.EmptyComponents]);
      expect(service.getStorageRecipes()).toHaveLength(0);
    });

    it('rejects a component qty that is not greater than zero', () => {
      for (const qty of [0, -1]) {
        const result = service.addRecipe(
          recipeInput({ components: [{ productId: 'prod-2', qty, scrapPct: 0 }] }),
        );
        expect(result.succeeded).toBe(false);
        expect(result.errors).toEqual([RecipeErrors.InvalidQty]);
      }
      expect(service.getStorageRecipes()).toHaveLength(0);
    });

    it('rejects a component scrapPct outside 0-100', () => {
      for (const scrapPct of [-1, 101]) {
        const result = service.addRecipe(
          recipeInput({ components: [{ productId: 'prod-2', qty: 3, scrapPct }] }),
        );
        expect(result.succeeded).toBe(false);
        expect(result.errors).toEqual([RecipeErrors.InvalidQty]);
      }
      expect(service.getStorageRecipes()).toHaveLength(0);
    });

    it('rejects an outputQty that is not greater than zero', () => {
      for (const outputQty of [0, -5]) {
        const result = service.addRecipe(recipeInput({ outputQty }));
        expect(result.succeeded).toBe(false);
        expect(result.errors).toEqual([RecipeErrors.InvalidQty]);
      }
      expect(service.getStorageRecipes()).toHaveLength(0);
    });

    it('rejects an overheadPct outside 0-100', () => {
      const result = service.addRecipe(recipeInput({ overheadPct: 101 }));
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([RecipeErrors.InvalidQty]);
      expect(service.getStorageRecipes()).toHaveLength(0);
    });
  });

  // ─── updateRecipe ───
  describe('updateRecipe', () => {
    it('updates a recipe in place, excluding itself from the duplicate check', () => {
      const created = service.addRecipe(recipeInput()).data!;

      const updated = service.updateRecipe(
        created.id,
        recipeInput({ outputQty: 25, components: [{ productId: 'prod-2', qty: 4, scrapPct: 5 }] }),
      );

      expect(updated.succeeded).toBe(true);
      expect(updated.data!.id).toBe(created.id);
      expect(updated.data!.outputQty).toBe(25);
      expect(updated.data!.components).toEqual([{ productId: 'prod-2', qty: 4, scrapPct: 5 }]);
      expect(updated.data!.updatedDate).toBeInstanceOf(Date);
      expect(service.getStorageRecipes()).toHaveLength(1);
    });

    it('rejects moving a recipe onto a product that already has another ACTIVE recipe', () => {
      const first = service.addRecipe(recipeInput()).data!;
      expect(service.addRecipe(recipeInput({ productId: 'prod-3' })).succeeded).toBe(true);

      const result = service.updateRecipe(first.id, recipeInput({ productId: 'prod-3' }));
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([RecipeErrors.DuplicateForProduct]);
    });

    it('revalidates the input on update (product-not-exists)', () => {
      const created = service.addRecipe(recipeInput()).data!;
      const result = service.updateRecipe(created.id, recipeInput({ productId: 'nope' }));
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([RecipeErrors.ProductNotExists]);
    });
  });

  // ─── deactivateRecipe ───
  describe('deactivateRecipe', () => {
    it('soft-deletes the recipe and frees the product for a new active recipe', () => {
      const created = service.addRecipe(recipeInput()).data!;

      const deactivated = service.deactivateRecipe(created.id);
      expect(deactivated.succeeded).toBe(true);
      expect(deactivated.data!.isActive).toBe(false);
      expect(deactivated.data!.updatedDate).toBeInstanceOf(Date);
      // The row is preserved (elaborations keep their snapshot).
      expect(service.getStorageRecipes()).toHaveLength(1);

      const replacement = service.addRecipe(recipeInput({ outputQty: 40 }));
      expect(replacement.succeeded).toBe(true);
      expect(service.getStorageRecipes()).toHaveLength(2);
      expect(service.getActiveRecipeForProduct('prod-1')?.id).toBe(replacement.data!.id);
    });
  });

  // ─── dates / cache ───
  describe('persistence', () => {
    it('revives createdDate and updatedDate on load', () => {
      const created = service.addRecipe(recipeInput()).data!;
      service.updateRecipe(created.id, recipeInput({ outputQty: 30 }));

      const fresh = new RecipeOfflineService(storeId, productRepo);
      const reloaded = fresh.getRecipeById(created.id)!;
      expect(reloaded.createdDate).toBeInstanceOf(Date);
      expect(reloaded.updatedDate).toBeInstanceOf(Date);
    });

    it('isolates recipes per store and reloads an empty cache from storage', () => {
      const storeA = new RecipeOfflineService('store-a', productRepo);
      const storeB = new RecipeOfflineService('store-b', productRepo);

      expect(storeA.addRecipe(recipeInput()).succeeded).toBe(true);
      expect(storeA.getStorageRecipes()).toHaveLength(1);
      // Different store id -> different storage key -> no cross-store leakage.
      expect(storeB.getStorageRecipes()).toHaveLength(0);

      // Empty cache reload: another instance appends under the same store key.
      const storeBWriter = new RecipeOfflineService('store-b', productRepo);
      expect(
        storeBWriter.addRecipe(recipeInput({ productId: 'prod-3' })).succeeded,
      ).toBe(true);
      expect(storeB.getStorageRecipes()).toHaveLength(1);
    });

    it('refreshes a non-empty cache before writes so concurrent instances do not lose rows', () => {
      const writerA = new RecipeOfflineService(storeId, productRepo);
      const writerB = new RecipeOfflineService(storeId, productRepo);

      expect(writerA.addRecipe(recipeInput()).succeeded).toBe(true);
      // Warm writerB's cache to a NON-empty, now-stale snapshot.
      expect(writerB.getStorageRecipes()).toHaveLength(1);

      const writtenByA = writerA.addRecipe(recipeInput({ productId: 'prod-3' }));
      expect(writtenByA.succeeded).toBe(true);

      expect(writerB.addRecipe(recipeInput({ productId: 'prod-2' })).succeeded).toBe(true);

      const fresh = new RecipeOfflineService(storeId, productRepo);
      expect(fresh.getStorageRecipes()).toHaveLength(3);
      // writerB's stale cache must not have dropped writerA's prod-3 row.
      expect(fresh.getRecipeById(writtenByA.data!.id)).toBeDefined();
    });
  });

  // ─── import seams ───
  describe('addImportedRecipe / updateImportedRecipe', () => {
    it('exports JSON that round-trips through the import seam with revived dates', () => {
      const created = service.addRecipe(recipeInput()).data!;
      const json = service.getStorageRecipesJson();
      const parsed = JSON.parse(json) as Recipe[];
      expect(parsed).toHaveLength(1);

      const other = new RecipeOfflineService(storeId, productRepo);
      const res = other.addImportedRecipe(parsed[0]);
      expect(res.succeeded).toBe(true);

      const imported = other.getRecipeById(created.id)!;
      expect(imported.createdDate).toBeInstanceOf(Date);
      expect(imported.components).toEqual(created.components);
    });

    it('merges every field onto the recipe with the same id', () => {
      const created = service.addRecipe(recipeInput()).data!;

      const res = service.updateImportedRecipe({
        ...created,
        outputQty: 99,
        isActive: false,
        updatedDate: new Date('2026-05-05T00:00:00.000Z'),
      });
      expect(res.succeeded).toBe(true);

      const merged = service.getRecipeById(created.id)!;
      expect(merged.outputQty).toBe(99);
      expect(merged.isActive).toBe(false);
      expect(merged.updatedDate).toBeInstanceOf(Date);
      expect(service.getStorageRecipes()).toHaveLength(1);
    });
  });
});
