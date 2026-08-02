import { beforeEach, describe, expect, it } from 'vitest';
import { ProductRepository } from '../product-repository';
import { ProductCategoryRepository } from '../product-category-repository';
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

/** Builds a ProductRepository whose injected category repo already has 'cat-1'. */
function makeRepoWithCategory(): ProductRepository {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addProductCategoryData('cat-1', 'Cat 1', 0, true);
  return new ProductRepository(storeId, categoryRepo);
}

describe('product-repository — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const repo = makeRepoWithCategory();
    repo.addProduct('cat-1', 'Widget', 10, 'biz', 0, true, true, false);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();
    expect(repo.getProductByName('Widget')?.price).toBe(10);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const repo = makeRepoWithCategory();
    repo.addProduct('cat-1', 'Widget', 10, 'biz', 0, true, true, false);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    const roundTripped = repo.getProductByName('Widget');
    expect(roundTripped).not.toBeNull();
    expect(roundTripped!.price).toBe(10);
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const repo = makeRepoWithCategory();
    repo.addProduct('cat-1', 'Widget', 10, 'biz', 0, true, true, false);

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const lockedRepo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    expect(() => lockedRepo.getStorageProductsMap()).toThrow(MissingDataKeyError);

    const rawAfter = localStorage.getItem(storageKey);
    expect(rawAfter).toBe(rawBefore);
  });
});
