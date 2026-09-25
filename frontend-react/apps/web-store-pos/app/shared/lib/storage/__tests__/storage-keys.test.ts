// Storage keys are a wire format, not an implementation detail: the entity
// rows are encrypted ciphertext under `StorageKeys.entityKey(...)`, so a
// rename does not "reset a store", it strands every byte already on the device
// (nothing can decrypt them, nothing can wipe them, and the store stops
// booting). `BUSINESS_ENTITY_NAMES` has exactly the same weight: it is the
// single source of truth for the encrypt (`entity-migration`), the wipe
// (`store-data-reset`) and the damaged-data report — an entity missing from
// that list is one a wipe silently misses.
//
// So the exact strings are pinned here, in both directions: adding an entity is
// a deliberate act (the list assertion fails until the reviewer sees it), and
// renaming one fails the same way.
import { describe, expect, it } from 'vitest';
import { GlobalConfig } from '../../config/global-config';
import { BUSINESS_ENTITY_NAMES, StorageKeys } from '../storage-keys';

const STORE_A = 's1';
const STORE_B = 's2';

/** The key builder is exercised everywhere through the module, never re-typed. */
function entityKey(entity: string, storeId: string): string {
  return StorageKeys.entityKey(entity, storeId);
}

describe('StorageKeys — session and device keys', () => {
  it('pins the bare localStorage keys exactly', () => {
    expect(StorageKeys.TOKEN).toBe('token');
    expect(StorageKeys.CURRENT_USER).toBe('currentUser');
    expect(StorageKeys.LANGUAGE).toBe('language');
    expect(StorageKeys.TRIAL_NOTICE_DISMISSED).toBe('trialNoticeDismissed');
    expect(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN).toBe('exchangeRatesFirstLogin');
  });

  it('stamps the auth model with the app version so an upgrade forces a re-login', () => {
    // The `-authf496fc5a9f17` suffix is the format marker: it invalidates the
    // cached auth model on any version bump, without touching the key name.
    expect(StorageKeys.AUTH_MODEL).toBe(`${GlobalConfig.APP_VERSION}-authf496fc5a9f17`);
    expect(StorageKeys.AUTH_MODEL.endsWith('-authf496fc5a9f17')).toBe(true);
    expect(GlobalConfig.APP_VERSION.length).toBeGreaterThan(0);
  });

  it('keeps the exchange-rate anchor device-scoped, not store-scoped', () => {
    // The daily USD→MN register is per store, but its first-login anchor is
    // "the first day THE OWNER authenticated ON THIS DEVICE" — one value for
    // the whole origin, which is why it is a bare key and not an entityKey.
    expect(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN).not.toContain('lizoft.store-');
  });
});

describe('StorageKeys.entityKey — per-entity, per-store scoping', () => {
  it('builds `lizoft.store-<entity>-<storeId>`', () => {
    expect(entityKey('products', STORE_A)).toBe('lizoft.store-products-s1');
    expect(entityKey('channelRates', STORE_B)).toBe('lizoft.store-channelRates-s2');
  });

  it('scopes by store: the same entity of two stores never shares a key', () => {
    expect(entityKey('products', STORE_A)).not.toBe(entityKey('products', STORE_B));
  });

  it('scopes by entity: two entities of one store never share a key', () => {
    expect(entityKey('products', STORE_A)).not.toBe(entityKey('orders', STORE_A));
  });

  it('namespaces every entity under `lizoft.store-`, so it can never collide with a session key', () => {
    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(entityKey(entity, STORE_A).startsWith('lizoft.store-')).toBe(true);
    }
    expect(entityKey('products', 'token')).not.toBe(StorageKeys.TOKEN);
  });

  it('embeds the entity and store ids verbatim, with no normalisation', () => {
    // The ids are opaque: a GUID, a hyphenated slug, anything. The builder must
    // not normalise case or trim, or a lookup would miss the stored row.
    const storeId = 'A1b2-C3d4_E5f6';
    expect(entityKey('warehouse-stock-levels', storeId)).toBe(
      `lizoft.store-warehouse-stock-levels-${storeId}`,
    );
  });
});

describe('BUSINESS_ENTITY_NAMES — the encrypt/wipe/report registry', () => {
  it('is exactly these fourteen entities, in this order', () => {
    // elaboration-module added recipes + elaborations;
    // store-payment-methods-config (2026-09-22) added storePaymentMethods on
    // 2026-09-23 — its absence let one damaged entry keep a store locked out,
    // because the recovery dialog could not remove it.
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
      'channelRates',
      'recipes',
      'elaborations',
      'storePaymentMethods',
    ]);
  });

  it('has no duplicates — a repeat would make the registry two lists in one', () => {
    expect(new Set(BUSINESS_ENTITY_NAMES).size).toBe(BUSINESS_ENTITY_NAMES.length);
  });

  it('has no empty or whitespace-only entry', () => {
    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(entity.trim()).toBe(entity);
      expect(entity.length).toBeGreaterThan(0);
    }
  });

  it('never registers a session key — a wipe must never touch the way back in', () => {
    const sessionKeys = [
      StorageKeys.TOKEN,
      StorageKeys.AUTH_MODEL,
      StorageKeys.CURRENT_USER,
      StorageKeys.LANGUAGE,
      StorageKeys.TRIAL_NOTICE_DISMISSED,
      StorageKeys.EXCHANGE_RATES_FIRST_LOGIN,
    ];
    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(sessionKeys).not.toContain(entity);
      for (const key of sessionKeys) {
        expect(entityKey(entity, STORE_A)).not.toBe(key);
      }
    }
  });

  it('gives every registered entity a distinct key for one store', () => {
    const keys = BUSINESS_ENTITY_NAMES.map((entity) => entityKey(entity, STORE_A));
    expect(new Set(keys).size).toBe(BUSINESS_ENTITY_NAMES.length);
  });
});
