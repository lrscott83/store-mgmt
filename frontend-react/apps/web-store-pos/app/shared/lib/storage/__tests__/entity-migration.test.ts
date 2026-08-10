// design §12 / spec entity-migration — the eager, one-time pass. Tasks
// 13.1-13.4 (RED-then-GREEN discovery) + 13.5 (documented, wiring test
// lives with the caller in auth-store.dek.test.ts / offline-auth-service
// per task 13.6, not here).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runEntityMigration } from '../entity-migration';
import { decryptEntity, isEncrypted, ENTITY_ENVELOPE_PREFIX } from '../entity-crypto';
import { setDek, clearDek } from '../data-key-store';
import { StorageKeys } from '../storage-keys';
import { importRoster, clearRoster } from '../../offline/roster-store';
import type { OfflineRosterBundle } from '../../offline/roster-types';

const STORE_A = 's1';
const STORE_B = 's2';
const DEK = new Uint8Array(32).fill(0x09);

function v2Bundle(storeId: string): OfflineRosterBundle {
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

const ENTITY_KEYS = [
  StorageKeys.entityKey('products', STORE_A),
  StorageKeys.entityKey('product-categories', STORE_A),
  StorageKeys.entityKey('inventory-entries', STORE_A),
  StorageKeys.entityKey('orders', STORE_A),
  StorageKeys.entityKey('expenses', STORE_A),
  StorageKeys.entityKey('saleCredits', STORE_A),
] as const;

describe('runEntityMigration — provisioning guard (entity-migration#Migration runs only when provisioned)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('unprovisioned device: no entity key is read or written (the guard itself reading the roster key to decide is not an entity read)', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    runEntityMigration();

    const entityKeyReads = getItemSpy.mock.calls.filter(([key]) =>
      (ENTITY_KEYS as readonly string[]).includes(key),
    );
    expect(entityKeyReads).toHaveLength(0);
    expect(setItemSpy).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});

describe('runEntityMigration — byte-preserving conversion + idempotency', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
    importRoster(v2Bundle(STORE_A), 500);
    setDek(DEK, STORE_A);
  });

  it('converts a plaintext key to enc:v1: (decrypts back to the identical original string), leaves an already-marked key untouched, and is idempotent on a second run', () => {
    const productsRaw = '[{"id":1,"name":"widget"}]';
    const ordersEncrypted = `${ENTITY_ENVELOPE_PREFIX}already-marked-untouched`;
    localStorage.setItem(ENTITY_KEYS[0], productsRaw); // products, plaintext
    localStorage.setItem(ENTITY_KEYS[3], ordersEncrypted); // orders, already marked
    // expenses/saleCredits/product-categories/inventory-entries left absent.

    runEntityMigration();

    const productsAfter = localStorage.getItem(ENTITY_KEYS[0]);
    expect(productsAfter).not.toBeNull();
    expect(isEncrypted(productsAfter!)).toBe(true);
    expect(decryptEntity(productsAfter)).toBe(productsRaw);

    // Already-marked key is byte-identical (not re-encrypted).
    expect(localStorage.getItem(ENTITY_KEYS[3])).toBe(ordersEncrypted);

    // Absent keys stay absent — never created as an empty encrypted container.
    expect(localStorage.getItem(ENTITY_KEYS[4])).toBeNull(); // expenses

    // Second run: no further setItem calls at all (fully idempotent).
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    runEntityMigration();
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});

describe('runEntityMigration — partial failure is per-key isolated', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
    importRoster(v2Bundle(STORE_A), 500);
    setDek(DEK, STORE_A);
  });

  it('a setItem failure on the third key does not prevent the other five from converting, and leaves the third key unchanged', () => {
    for (const key of ENTITY_KEYS) {
      localStorage.setItem(key, `["${key}-plaintext"]`);
    }
    const thirdKeyOriginal = localStorage.getItem(ENTITY_KEYS[2])!; // inventory-entries
    expect(isEncrypted(thirdKeyOriginal)).toBe(false);

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === ENTITY_KEYS[2]) {
          throw new Error('QuotaExceededError');
        }
        originalSetItem(key, value);
      });

    expect(() => runEntityMigration()).not.toThrow();

    for (const key of ENTITY_KEYS) {
      const value = localStorage.getItem(key);
      expect(value).not.toBeNull();
      if (key === ENTITY_KEYS[2]) {
        expect(value).toBe(thirdKeyOriginal); // unchanged plaintext, still readable
        expect(isEncrypted(value!)).toBe(false);
      } else {
        expect(isEncrypted(value!)).toBe(true); // the other five converted
      }
    }

    setItemSpy.mockRestore();
  });
});

describe('runEntityMigration — scoped to the roster store, not the active store (entity-migration#scoped to roster store)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('a v2 roster scoped to store A only converts store A keys; store B keys are untouched', () => {
    importRoster(v2Bundle(STORE_A), 500);
    setDek(DEK, STORE_A);

    const storeAKey = StorageKeys.entityKey('products', STORE_A);
    const storeBKey = StorageKeys.entityKey('products', STORE_B);
    localStorage.setItem(storeAKey, '[{"id":1}]');
    localStorage.setItem(storeBKey, '[{"id":2}]');

    runEntityMigration();

    expect(isEncrypted(localStorage.getItem(storeAKey)!)).toBe(true);
    expect(localStorage.getItem(storeBKey)).toBe('[{"id":2}]'); // untouched, still plaintext
  });
});

// device-wrapped-dek design §4: guard and scope now derive from
// `getDekStoreId()` instead of `isEncryptionProvisioned()`/`getRawRoster()`,
// so a local-DEK device (no roster at all) also gets migrated — today this
// is a no-op, which is the RED.
describe('runEntityMigration — local-DEK device with no roster (device-wrapped-dek §4)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('a local-DEK device (setDek only, no roster) converts its own store keys', () => {
    setDek(DEK, STORE_A);
    const productsRaw = '[{"id":1,"name":"widget"}]';
    localStorage.setItem(StorageKeys.entityKey('products', STORE_A), productsRaw);

    runEntityMigration();

    const after = localStorage.getItem(StorageKeys.entityKey('products', STORE_A));
    expect(after).not.toBeNull();
    expect(isEncrypted(after!)).toBe(true);
    expect(decryptEntity(after)).toBe(productsRaw);
  });
});
