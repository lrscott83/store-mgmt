import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoreData } from '../store-data-reset';
import { StorageKeys, BUSINESS_ENTITY_NAMES } from '../storage-keys';

const STORE_A = 's1';
const STORE_B = 's2';

function seedStore(storeId: string): void {
  for (const entity of BUSINESS_ENTITY_NAMES) {
    localStorage.setItem(StorageKeys.entityKey(entity, storeId), `["${entity}"]`);
  }
}

describe('clearStoreData', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('covers exactly the seven business entities', () => {
    expect([...BUSINESS_ENTITY_NAMES]).toEqual([
      'products',
      'product-categories',
      'inventory-entries',
      'orders',
      'expenses',
      'saleCredits',
      'exchangeRates',
      'warehouses',
      'warehouse-stock-levels',
      'warehouse-stock-movements',
    ]);
  });

  it('removes every business-entity key of the given store', () => {
    seedStore(STORE_A);

    clearStoreData(STORE_A);

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(StorageKeys.entityKey(entity, STORE_A))).toBeNull();
    }
  });

  it('leaves another store’s data untouched', () => {
    seedStore(STORE_A);
    seedStore(STORE_B);

    clearStoreData(STORE_A);

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(StorageKeys.entityKey(entity, STORE_B))).not.toBeNull();
    }
  });

  it('leaves session and device keys untouched', () => {
    seedStore(STORE_A);
    localStorage.setItem(StorageKeys.TOKEN, 'tok');
    localStorage.setItem(StorageKeys.AUTH_MODEL, '{"authToken":"tok"}');
    localStorage.setItem(StorageKeys.CURRENT_USER, '{"login":"jdoe"}');
    localStorage.setItem(StorageKeys.LANGUAGE, 'es');

    clearStoreData(STORE_A);

    expect(localStorage.getItem(StorageKeys.TOKEN)).toBe('tok');
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBe('{"authToken":"tok"}');
    expect(localStorage.getItem(StorageKeys.CURRENT_USER)).toBe('{"login":"jdoe"}');
    expect(localStorage.getItem(StorageKeys.LANGUAGE)).toBe('es');
  });

  it('does not create keys for a store that has nothing stored', () => {
    clearStoreData(STORE_A);

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(StorageKeys.entityKey(entity, STORE_A))).toBeNull();
    }
    expect(localStorage.length).toBe(0);
  });

  it('keeps removing the remaining keys when one removal throws, and reports it by name', () => {
    seedStore(STORE_A);
    const failingKey = StorageKeys.entityKey('inventory-entries', STORE_A);
    const realRemoveItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === failingKey) throw new Error('quota');
      realRemoveItem.call(this, key);
    });

    const failedEntities = clearStoreData(STORE_A);

    vi.restoreAllMocks();
    expect(failedEntities).toEqual(['inventory-entries']);
    expect(localStorage.getItem(failingKey)).not.toBeNull();
    expect(localStorage.getItem(StorageKeys.entityKey('orders', STORE_A))).toBeNull();
    expect(localStorage.getItem(StorageKeys.entityKey('saleCredits', STORE_A))).toBeNull();
  });

  it('returns an empty array when every key was removed successfully', () => {
    seedStore(STORE_A);

    const failedEntities = clearStoreData(STORE_A);

    expect(failedEntities).toEqual([]);
  });
});
