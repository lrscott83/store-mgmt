import { describe, it, expect, beforeEach } from 'vitest';
import { Currency, SalePaymentMethod, salePaymentMethodLabel } from '@store-mgmt/domain';
import {
  DEFAULT_ENABLED_PAYMENT_METHODS,
  DEFAULT_STORE_PAYMENT_METHODS_CONFIG,
  StorePaymentMethodsConfigService,
  applyStorePaymentMethodsConfig,
} from '../store-payment-methods-config-service';
import { EntityUnreadableError } from '~/shared/lib/storage/read-entity-or-throw';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';

const S1 = 's1';
const S2 = 's2';

function storageKey(storeId: string): string {
  return StorageKeys.entityKey('storePaymentMethods', storeId);
}

beforeEach(() => {
  localStorage.clear();
});

describe('StorePaymentMethodsConfigService — default / auto-init', () => {
  it('returns the default (all methods on) when the key is absent', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    expect(service.getConfig()).toEqual(DEFAULT_STORE_PAYMENT_METHODS_CONFIG);
  });

  it('DEFAULT has Efectivo, Zelle and Transferencia (no-regression)', () => {
    expect([...DEFAULT_ENABLED_PAYMENT_METHODS]).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('auto-inits by PERSISTING the default on the empty read (ChannelRate parity)', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.getConfig();
    const stored = localStorage.getItem(storageKey(S1));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual(DEFAULT_STORE_PAYMENT_METHODS_CONFIG);
  });
});

describe('StorePaymentMethodsConfigService — set/get round-trip', () => {
  it('disables and re-enables a method', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Zelle, false);
    expect(service.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
    expect(service.getConfig().enabledMethods).not.toContain(SalePaymentMethod.Zelle);

    service.setMethodEnabled(S1, SalePaymentMethod.Zelle, true);
    expect(service.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('persists the change to localStorage (encrypted wire format)', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Transferencia, false);
    const stored = localStorage.getItem(storageKey(S1)) as string;
    // No DEK/roster in unit tests -> plaintext passthrough of the JSON.
    expect(JSON.parse(stored)).toEqual({
      enabledMethods: [SalePaymentMethod.Efectivo, SalePaymentMethod.Zelle],
    });
  });

  it('a fresh service instance reads the same persisted state for the store', () => {
    new StorePaymentMethodsConfigService(S1).setMethodEnabled(
      S1,
      SalePaymentMethod.Zelle,
      false,
    );
    const second = new StorePaymentMethodsConfigService(S1);
    expect(second.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('is idempotent: toggling to the already-stored state writes nothing new', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Zelle, false);
    const afterFirstWrite = localStorage.getItem(storageKey(S1));
    service.setMethodEnabled(S1, SalePaymentMethod.Zelle, false);
    expect(localStorage.getItem(storageKey(S1))).toBe(afterFirstWrite);
  });
});

describe('StorePaymentMethodsConfigService — Efectivo always on', () => {
  it('disabling Efectivo is a no-op (never stored as off)', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Efectivo, false);
    expect(service.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('does not write anything when toggling Efectivo on an absent key', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Efectivo, false);
    // The no-op must not even trigger the auto-init write.
    expect(localStorage.getItem(storageKey(S1))).toBeNull();
  });
});

describe('StorePaymentMethodsConfigService — per-store isolation + cache reload', () => {
  it('isolates configs per store', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Zelle, false);
    expect(service.getConfig(S2)).toEqual(DEFAULT_STORE_PAYMENT_METHODS_CONFIG);
  });

  it('reloads the per-instance cache when the requested store key changes', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    // Cache s1 (default).
    expect(service.getEnabledMethods(S1)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
    // Another store's config mutates s2 independently.
    service.setMethodEnabled(S2, SalePaymentMethod.Zelle, false);
    // Same instance, s1 requested again -> key changed inside, cache reloaded.
    expect(service.getEnabledMethods(S1)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
    expect(service.getEnabledMethods(S2)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
  });
});

describe('StorePaymentMethodsConfigService — read seam', () => {
  it('THROWS EntityUnreadableError on stored bytes that cannot be parsed', () => {
    localStorage.setItem(storageKey(S1), 'this-is-not-json');
    const service = new StorePaymentMethodsConfigService(S1);
    expect(() => service.getConfig(S1)).toThrow(EntityUnreadableError);
  });

  it('never writes over unreadable bytes (no data loss on a damaged read)', () => {
    localStorage.setItem(storageKey(S1), 'not-json');
    const service = new StorePaymentMethodsConfigService(S1);
    try {
      service.getConfig(S1);
    } catch {
      // expected
    }
    expect(localStorage.getItem(storageKey(S1))).toBe('not-json');
  });
});

describe('applyStorePaymentMethodsConfig (compositor)', () => {
  const FULL = [
    SalePaymentMethod.Efectivo,
    SalePaymentMethod.Zelle,
    SalePaymentMethod.Transferencia,
  ] as const;

  it('keeps everything when the store enables everything (no-regression)', () => {
    expect(applyStorePaymentMethodsConfig(FULL, [...DEFAULT_ENABLED_PAYMENT_METHODS])).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('keeps Efectivo even when the config excludes it', () => {
    expect(
      applyStorePaymentMethodsConfig(FULL, [SalePaymentMethod.Transferencia]),
    ).toEqual([SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia]);
  });

  it('removes disabled methods, preserving the base order', () => {
    expect(
      applyStorePaymentMethodsConfig(FULL, [SalePaymentMethod.Efectivo]),
    ).toEqual([SalePaymentMethod.Efectivo]);
  });

  it('composes over the plan gate output (Zelle already filtered for non-MultiMonedas)', () => {
    const planGate = FULL.filter((m) => m !== SalePaymentMethod.Zelle);
    expect(
      applyStorePaymentMethodsConfig(planGate, [...DEFAULT_ENABLED_PAYMENT_METHODS]),
    ).toEqual([SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia]);
  });

  it('a CUP catalogue is unaffected by Zelle being enabled in config (base has no Zelle)', () => {
    const cupBase = [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia];
    expect(applyStorePaymentMethodsConfig(cupBase, [...DEFAULT_ENABLED_PAYMENT_METHODS])).toEqual(
      cupBase,
    );
  });

  it('respects the currency catalogue for USD (Efectivo, Zelle, Transferencia)', () => {
    const usdBase = [
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ];
    expect(
      applyStorePaymentMethodsConfig(usdBase, [
        SalePaymentMethod.Efectivo,
        SalePaymentMethod.Transferencia,
      ]),
    ).toEqual([SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia]);
  });

  it('currency label helper sanity: labels carry the currency like the rest of the app', () => {
    // Pin the shared label contract the modals rely on ('Transferencia (CUP)').
    expect(salePaymentMethodLabel(SalePaymentMethod.Transferencia, Currency.CUP)).toBe(
      'Transferencia (CUP)',
    );
    expect(salePaymentMethodLabel(SalePaymentMethod.Zelle, Currency.CUP)).toBe('Zelle');
  });
});