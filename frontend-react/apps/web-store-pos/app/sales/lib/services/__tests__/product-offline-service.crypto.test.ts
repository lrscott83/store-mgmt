import { beforeEach, describe, expect, it } from 'vitest';
import { ProductOfflineService } from '../product-offline-service';
import { ProductCategoryOfflineService } from '../product-category-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-products-${storeId}`;

function v2Bundle(): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 999_999_999_999,
    formatVersion: 2,
    storeId,
    users: [{
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
    }],
  };
}

describe('product-offline-service — at-rest encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw JSON', async () => {
    const categoryService = new ProductCategoryOfflineService(storeId);
    await categoryService.createProductCategory('Cat', 0, true);

    const categories = await categoryService.getProductCategories();
    const catId = categories.data![0].id;

    const service = new ProductOfflineService(storeId);
    await service.createProduct(catId, 'Laptop', 999.99, 'biz1', 1, true, true, false);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();

    const result = await service.getAvailableProductsByCategoryId(catId);
    expect(result.data).toHaveLength(1);
  });

  it('provisioned + unlocked write produces ciphertext, round-trips', async () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const categoryService = new ProductCategoryOfflineService(storeId);
    await categoryService.createProductCategory('Cat', 0, true);
    const categories = await categoryService.getProductCategories();
    const catId = categories.data![0].id;

    const service = new ProductOfflineService(storeId);
    await service.createProduct(catId, 'Encrypted', 100, 'biz1', 1, true, true, false);

    const raw = localStorage.getItem(storageKey);
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    const result = await service.getAvailableProductsByCategoryId(catId);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe('Encrypted');
  });

  it('locked read throws MissingDataKeyError without destroying data', async () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const categoryService = new ProductCategoryOfflineService(storeId);
    await categoryService.createProductCategory('Cat', 0, true);
    const categories = await categoryService.getProductCategories();
    const catId = categories.data![0].id;

    const service = new ProductOfflineService(storeId);
    await service.createProduct(catId, 'Locked', 50, 'biz1', 1, true, true, false);

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek();
    const lockedService = new ProductOfflineService(storeId);
    await expect(lockedService.getAvailableProductsByCategoryId(catId)).rejects.toThrow(MissingDataKeyError);

    const rawAfter = localStorage.getItem(storageKey);
    expect(rawAfter).toBe(rawBefore);
  });
});
