import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryOfflineService } from '../inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-inventory-entries-${storeId}`;

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

/** Builds an InventoryOfflineService whose injected product repo already has 'p1'. */
function makeServiceWithProduct(): InventoryOfflineService {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addProductCategoryData('cat-1', 'Cat 1', 0, true);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  productRepo.addProductData('p1', 'cat-1', 'Widget', 10, 'biz', 0, true, true, false);
  return new InventoryOfflineService(storeId, productRepo);
}

describe('inventory-offline-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const service = makeServiceWithProduct();
    service.createInventoryEntry('p1', 5, 2.5);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();
    expect(service.getAvailableQuantity('p1').available).toBe(5);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = makeServiceWithProduct();
    service.createInventoryEntry('p1', 5, 2.5);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    expect(service.getAvailableQuantity('p1').available).toBe(5);
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const service = makeServiceWithProduct();
    service.createInventoryEntry('p1', 5, 2.5);

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const categoryRepo = new ProductCategoryRepository(storeId);
    const productRepo = new ProductRepository(storeId, categoryRepo);
    const lockedService = new InventoryOfflineService(storeId, productRepo);
    expect(() => lockedService.getStorageInventoriesMap()).toThrow(MissingDataKeyError);

    const rawAfter = localStorage.getItem(storageKey);
    expect(rawAfter).toBe(rawBefore);
  });
});
