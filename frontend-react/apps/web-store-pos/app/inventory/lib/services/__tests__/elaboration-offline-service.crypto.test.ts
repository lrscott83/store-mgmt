import { beforeEach, describe, expect, it } from 'vitest';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ElaborationOfflineService } from '../elaboration-offline-service';
import { InventoryOfflineService } from '../inventory-offline-service';
import { RecipeOfflineService, type RecipeInput } from '../recipe-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-elaborations-${storeId}`;

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
    productId: 'pan',
    outputQty: 20,
    components: [{ productId: 'harina', qty: 3, scrapPct: 2 }],
    laborCost: 50,
    overheadPct: 10,
  };
}

interface Harness {
  elaborationSvc: ElaborationOfflineService;
  recipeId: string;
  warehouseId: string;
}

function makeHarness(): Harness {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addProductCategoryData('cat-1', 'Elaborados', 0, true);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  productRepo.addProductData('pan', 'cat-1', 'Pan de 500g', 700, 'biz', 0, true, true, false);
  productRepo.addProductData('harina', 'cat-1', 'Harina', 300, 'biz', 0, true, true, false);

  const inventorySvc = new InventoryOfflineService(storeId, productRepo);
  const warehouseSvc = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
  const recipeSvc = new RecipeOfflineService(storeId, productRepo);
  const elaborationSvc = new ElaborationOfflineService(
    storeId,
    productRepo,
    recipeSvc,
    warehouseSvc,
    inventorySvc,
  );

  const recipe = recipeSvc.addRecipe(recipeInput());
  expect(recipe.succeeded).toBe(true);
  const warehouseId = warehouseSvc.createWarehouse('Central').data!.id;
  const stock = warehouseSvc.recordMovement({
    type: 'purchase_in',
    warehouseId,
    productId: 'harina',
    quantity: 100,
    costPrice: 3,
  });
  expect(stock.succeeded).toBe(true);

  return { elaborationSvc, recipeId: recipe.data!.id, warehouseId };
}

describe('elaboration-offline-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const { elaborationSvc, recipeId, warehouseId } = makeHarness();
    const result = elaborationSvc.confirmElaboration({ recipeId, warehouseId, batches: 1 });
    expect(result.succeeded).toBe(true);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();

    const elaborations = elaborationSvc.getStorageElaborations();
    expect(elaborations).toHaveLength(1);
    expect(elaborations[0].recipeId).toBe(recipeId);
    expect(elaborations[0].producedQty).toBe(20);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const { elaborationSvc, recipeId, warehouseId } = makeHarness();
    const result = elaborationSvc.confirmElaboration({ recipeId, warehouseId, batches: 2 });
    expect(result.succeeded).toBe(true);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    const elaborations = elaborationSvc.getStorageElaborations();
    expect(elaborations).toHaveLength(1);
    expect(elaborations[0].id).toBe(result.data!.id);
    expect(elaborations[0].batches).toBe(2);
    expect(elaborations[0].producedQty).toBe(40);
    expect(elaborations[0].recipeName).toBe('Pan de 500g');
    expect(elaborations[0].components).toHaveLength(1);
    expect(elaborations[0].components[0].productId).toBe('harina');
    expect(elaborations[0].components[0].costPrice).toBe(3);
    expect(elaborations[0].unitCost).toBe(result.data!.unitCost);
    expect(elaborations[0].createdDate).toBeInstanceOf(Date);
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const { elaborationSvc, recipeId, warehouseId } = makeHarness();
    elaborationSvc.confirmElaboration({ recipeId, warehouseId, batches: 1 });

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const categoryRepo = new ProductCategoryRepository(storeId);
    const productRepo = new ProductRepository(storeId, categoryRepo);
    const inventorySvc = new InventoryOfflineService(storeId, productRepo);
    const lockedService = new ElaborationOfflineService(
      storeId,
      productRepo,
      new RecipeOfflineService(storeId, productRepo),
      new WarehouseOfflineService(storeId, productRepo, inventorySvc),
      inventorySvc,
    );
    expect(() => lockedService.getStorageElaborations()).toThrow(MissingDataKeyError);
    expect(() => lockedService.getStorageElaborationsJson()).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });

  it('a provisioned-but-locked confirm is stopped by its read-before-write guard, ciphertext unchanged', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const { elaborationSvc, recipeId, warehouseId } = makeHarness();
    elaborationSvc.confirmElaboration({ recipeId, warehouseId, batches: 1 });

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned; confirmElaboration reloads first, so it stops before persisting
    expect(() =>
      elaborationSvc.confirmElaboration({ recipeId, warehouseId, batches: 3 }),
    ).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });
});
