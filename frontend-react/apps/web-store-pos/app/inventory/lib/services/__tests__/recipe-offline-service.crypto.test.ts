import { beforeEach, describe, expect, it } from 'vitest';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { RecipeOfflineService, type RecipeInput } from '../recipe-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-recipes-${storeId}`;

function v2Bundle(): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 999_999_999_999,
    formatVersion: 2,
    storeId,
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: storeId,
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
  };
}

function recipeInput(): RecipeInput {
  return {
    productId: 'p1',
    outputQty: 20,
    components: [
      { productId: 'p2', qty: 3, scrapPct: 2 },
      { productId: 'p3', qty: 0.05, scrapPct: 0 },
    ],
    laborCost: 50,
    overheadPct: 10,
  };
}

function makeProductRepo(): ProductRepository {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addProductCategoryData('cat-1', 'Cat 1', 0, true);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  productRepo.addProductData('p1', 'cat-1', 'Pan', 10, 'biz', 0, true, true, false);
  productRepo.addProductData('p2', 'cat-1', 'Harina', 10, 'biz', 0, true, true, false);
  productRepo.addProductData('p3', 'cat-1', 'Levadura', 10, 'biz', 0, true, true, false);
  return productRepo;
}

describe('recipe-offline-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const service = new RecipeOfflineService(storeId, makeProductRepo());
    expect(service.addRecipe(recipeInput()).succeeded).toBe(true);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();

    expect(service.getStorageRecipes()).toHaveLength(1);
    expect(service.getStorageRecipes()[0].outputQty).toBe(20);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const created = new RecipeOfflineService(storeId, makeProductRepo()).addRecipe(recipeInput());
    expect(created.succeeded).toBe(true);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    const fresh = new RecipeOfflineService(storeId, makeProductRepo());
    const recipes = fresh.getStorageRecipes();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].id).toBe(created.data!.id);
    expect(recipes[0].productId).toBe('p1');
    expect(recipes[0].outputQty).toBe(20);
    expect(recipes[0].laborCost).toBe(50);
    expect(recipes[0].components).toHaveLength(2);
    expect(recipes[0].components[0]).toEqual({ productId: 'p2', qty: 3, scrapPct: 2 });
    expect(recipes[0].isActive).toBe(true);
    expect(recipes[0].createdDate).toBeInstanceOf(Date);
    expect(fresh.getActiveRecipeForProduct('p1')?.id).toBe(created.data!.id);
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const productRepo = makeProductRepo();
    new RecipeOfflineService(storeId, productRepo).addRecipe(recipeInput());

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const lockedService = new RecipeOfflineService(storeId, productRepo);
    expect(() => lockedService.getStorageRecipes()).toThrow(MissingDataKeyError);
    expect(() => lockedService.getRecipeById('anything')).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });

  it('a provisioned-but-locked mutation is stopped by its read-before-write guard, ciphertext unchanged', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const productRepo = makeProductRepo();
    const service = new RecipeOfflineService(storeId, productRepo);
    const created = service.addRecipe(recipeInput());

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned; every write reloads first, so it stops before persisting
    expect(() => service.deactivateRecipe(created.data!.id)).toThrow(MissingDataKeyError);
    expect(() => service.updateRecipe(created.data!.id, recipeInput())).toThrow(
      MissingDataKeyError,
    );
    expect(() => service.addRecipe(recipeInput())).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });
});
