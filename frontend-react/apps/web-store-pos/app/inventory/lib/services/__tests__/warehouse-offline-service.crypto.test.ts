import { beforeEach, describe, expect, it } from 'vitest';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '../inventory-offline-service';
import { WarehouseOfflineService } from '../warehouse-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const warehousesKey = `lizoft.store-warehouses-${storeId}`;
const stockLevelsKey = `lizoft.store-warehouse-stock-levels-${storeId}`;
const movementsKey = `lizoft.store-warehouse-stock-movements-${storeId}`;

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

interface Harness {
  productRepo: ProductRepository;
  inventorySvc: InventoryOfflineService;
  service: WarehouseOfflineService;
  warehouseId: string;
}

function makeHarness(): Harness {
  const categoryRepo = new ProductCategoryRepository(storeId);
  categoryRepo.addProductCategoryData('cat-1', 'Cat 1', 0, true);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  productRepo.addProductData('p1', 'cat-1', 'Widget', 10, 'biz', 0, true, true, false);
  const inventorySvc = new InventoryOfflineService(storeId, productRepo);
  const service = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
  const warehouseId = service.createWarehouse('Central').data!.id;
  service.recordMovement({
    type: 'purchase_in',
    warehouseId,
    productId: 'p1',
    quantity: 10,
    costPrice: 2.5,
  });
  return { productRepo, inventorySvc, service, warehouseId };
}

describe('warehouse-offline-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const { service, warehouseId } = makeHarness();

    for (const key of [warehousesKey, stockLevelsKey, movementsKey]) {
      const raw = localStorage.getItem(key);
      expect(raw).not.toBeNull();
      expect(raw!.startsWith('enc:v1:')).toBe(false);
      expect(() => JSON.parse(raw!)).not.toThrow();
    }

    expect(service.getStorageWarehouses()).toHaveLength(1);
    expect(service.getStorageWarehouses()[0].name).toBe('Central');
    expect(service.getStockLevel(warehouseId, 'p1')?.onHand).toBe(10);
    expect(service.getStorageMovements()).toHaveLength(1);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext on all three entity keys, read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const { productRepo, inventorySvc, warehouseId } = makeHarness();

    for (const key of [warehousesKey, stockLevelsKey, movementsKey]) {
      const raw = localStorage.getItem(key);
      expect(raw).not.toBeNull();
      expect(raw!.startsWith('enc:v1:')).toBe(true);
    }

    const fresh = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
    expect(fresh.getStorageWarehouses()).toHaveLength(1);
    expect(fresh.getStorageWarehouses()[0].name).toBe('Central');
    expect(fresh.getStorageWarehouses()[0].createdDate).toBeInstanceOf(Date);

    const level = fresh.getStockLevel(warehouseId, 'p1');
    expect(level?.onHand).toBe(10);
    expect(level?.costPrice).toBe(2.5);

    const movements = fresh.getStorageMovements();
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('purchase_in');
    expect(movements[0].quantity).toBe(10);
    expect(movements[0].createdDate).toBeInstanceOf(Date);
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const { productRepo, inventorySvc } = makeHarness();

    const rawsBefore = [warehousesKey, stockLevelsKey, movementsKey].map((key) => {
      const raw = localStorage.getItem(key);
      expect(raw!.startsWith('enc:v1:')).toBe(true);
      return raw;
    });

    clearDek(); // lock — roster still provisioned
    const locked = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
    expect(() => locked.getStorageWarehouses()).toThrow(MissingDataKeyError);
    expect(() => locked.getStorageStockLevels()).toThrow(MissingDataKeyError);
    expect(() => locked.getStorageMovements()).toThrow(MissingDataKeyError);

    [warehousesKey, stockLevelsKey, movementsKey].forEach((key, index) => {
      expect(localStorage.getItem(key)).toBe(rawsBefore[index]);
    });
  });

  it('a provisioned-but-locked write throws and leaves ciphertext unchanged (by design)', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const { service, warehouseId } = makeHarness();

    const rawBefore = localStorage.getItem(warehousesKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned; writing plaintext over ciphertext is impossible
    expect(() => service.createWarehouse('Nordeste')).toThrow(MissingDataKeyError);
    expect(() =>
      service.recordMovement({
        type: 'purchase_in',
        warehouseId,
        productId: 'p1',
        quantity: 5,
        costPrice: 3,
      }),
    ).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(warehousesKey)).toBe(rawBefore);
  });
});
