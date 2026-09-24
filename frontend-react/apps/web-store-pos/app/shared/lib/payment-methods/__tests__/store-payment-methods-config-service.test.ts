import { describe, it, expect, beforeEach } from 'vitest';
import { Currency, PAYMENT_CHANNELS, SalePaymentMethod, salePaymentMethodLabel } from '@store-mgmt/domain';
import {
  ALL_CHANNEL_KEYS,
  DEFAULT_ENABLED_CHANNEL_KEYS,
  DEFAULT_ENABLED_PAYMENT_METHODS,
  DEFAULT_STORE_PAYMENT_METHODS_CONFIG,
  StorePaymentMethodsConfigService,
  applyStorePaymentMethodsConfig,
  enabledMethodsForCurrency,
  resolveEnabledChannelKeys,
} from '../store-payment-methods-config-service';
import type { StorePaymentMethodsConfig } from '../store-payment-methods-config-service';
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
  it('returns the default (every channel on) when the key is absent', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    expect(service.getConfig()).toEqual(DEFAULT_STORE_PAYMENT_METHODS_CONFIG);
    expect(service.getEnabledChannels()).toEqual([...ALL_CHANNEL_KEYS]);
  });

  it('DEFAULT_ENABLED_CHANNEL_KEYS covers the whole canonical catalogue', () => {
    expect([...DEFAULT_ENABLED_CHANNEL_KEYS]).toEqual([...ALL_CHANNEL_KEYS]);
    expect(DEFAULT_ENABLED_CHANNEL_KEYS).toHaveLength(PAYMENT_CHANNELS.length);
  });

  it('legacy DEFAULT_ENABLED_PAYMENT_METHODS stays Efectivo, Zelle, Transferencia', () => {
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

describe('StorePaymentMethodsConfigService — per-channel set/get round-trip', () => {
  it('disables and re-enables a single channel without touching its siblings', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, false);
    expect(service.getEnabledChannels()).not.toContain('1|1');
    expect(service.getEnabledChannels()).toContain('1|2');
    expect(service.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);

    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, true);
    expect(service.getEnabledChannels()).toEqual([...ALL_CHANNEL_KEYS]);
    expect(service.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('persists the change as the per-channel shape (encrypted wire format)', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, false);
    const stored = localStorage.getItem(storageKey(S1)) as string;
    // No DEK/roster in unit tests -> plaintext passthrough of the JSON.
    const parsed = JSON.parse(stored) as StorePaymentMethodsConfig;
    expect(parsed.enabledChannels).not.toContain('1|1');
    expect(parsed.enabledChannels).toHaveLength(ALL_CHANNEL_KEYS.length - 1);
    expect(parsed.enabledMethods).toBeUndefined();
  });

  it('a fresh service instance reads the same persisted state for the store', () => {
    new StorePaymentMethodsConfigService(S1).setChannelEnabled(
      S1,
      SalePaymentMethod.Zelle,
      Currency.USD,
      false,
    );
    const second = new StorePaymentMethodsConfigService(S1);
    expect(second.getEnabledChannels()).not.toContain('1|1');
  });

  it('is idempotent: toggling to the already-stored state writes nothing new', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, false);
    const afterFirstWrite = localStorage.getItem(storageKey(S1));
    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, false);
    expect(localStorage.getItem(storageKey(S1))).toBe(afterFirstWrite);
  });

  it('disabling only Transferencia (USD) leaves Transferencia (CUP) enabled', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Transferencia, Currency.USD, false);
    expect(service.getEnabledMethodsForCurrency(Currency.CUP)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
    expect(service.getEnabledMethodsForCurrency(Currency.USD)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
    ]);
  });
});

describe('StorePaymentMethodsConfigService — legacy shape compatibility', () => {
  it('reads an old enabledMethods config as the equivalent channels', () => {
    localStorage.setItem(
      storageKey(S1),
      JSON.stringify({
        enabledMethods: [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia],
      }),
    );
    const service = new StorePaymentMethodsConfigService(S1);
    expect(service.isChannelEnabled(SalePaymentMethod.Zelle, Currency.USD)).toBe(false);
    expect(service.isChannelEnabled(SalePaymentMethod.Transferencia, Currency.USD)).toBe(true);
    expect(service.getEnabledMethodsForCurrency(Currency.USD)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('lets enabledChannels win over a lingering enabledMethods field', () => {
    const config = {
      enabledMethods: [SalePaymentMethod.Efectivo, SalePaymentMethod.Zelle, SalePaymentMethod.Transferencia],
      enabledChannels: ['0|0'],
    } satisfies StorePaymentMethodsConfig;
    expect(resolveEnabledChannelKeys(config)).toEqual(['0|0']);
  });

  it('an explicit empty enabledMethods resolves to no channels (except Efectivo)', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setConfigFromBackup({ enabledMethods: [] });
    expect(service.getEnabledChannels()).toEqual([]);
    expect(service.getEnabledMethodsForCurrency(Currency.CUP)).toEqual([]);
    expect(service.isChannelEnabled(SalePaymentMethod.Efectivo, Currency.CUP)).toBe(true);
  });

  it('an empty config object falls back to every channel on', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setConfigFromBackup({});
    expect(service.getEnabledChannels()).toEqual([...ALL_CHANNEL_KEYS]);
  });

  it('migrates a legacy config to the channel shape on the first toggle', () => {
    localStorage.setItem(
      storageKey(S1),
      JSON.stringify({
        enabledMethods: [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia],
      }),
    );
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, true);
    const parsed = JSON.parse(localStorage.getItem(storageKey(S1)) as string) as StorePaymentMethodsConfig;
    expect(parsed.enabledMethods).toBeUndefined();
    expect(parsed.enabledChannels).toContain('1|1');
  });
});

describe('StorePaymentMethodsConfigService — Efectivo always on', () => {
  it('disabling an Efectivo channel is a no-op (never stored as off)', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Efectivo, Currency.USD, false);
    expect(service.getEnabledChannels()).toEqual([...ALL_CHANNEL_KEYS]);
    expect(service.isChannelEnabled(SalePaymentMethod.Efectivo, Currency.USD)).toBe(true);
  });

  it('does not write anything when toggling Efectivo on an absent key', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Efectivo, Currency.CUP, false);
    // The no-op must not even trigger the auto-init write.
    expect(localStorage.getItem(storageKey(S1))).toBeNull();
  });

  it('setMethodEnabled(Efectivo) is also a no-op', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Efectivo, false);
    expect(localStorage.getItem(storageKey(S1))).toBeNull();
  });
});

describe('enabledMethodsForCurrency (pure)', () => {
  it('returns the per-currency methods of the enabled channels', () => {
    expect(enabledMethodsForCurrency([...ALL_CHANNEL_KEYS], Currency.USD)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
    expect(enabledMethodsForCurrency([...ALL_CHANNEL_KEYS], Currency.MLC)).toEqual([
      SalePaymentMethod.Transferencia,
    ]);
    expect(enabledMethodsForCurrency(['0|0'], Currency.USD)).toEqual([]);
  });
});

describe('StorePaymentMethodsConfigService — legacy method-level compat', () => {
  it('setMethodEnabled disables every channel of the method', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Transferencia, false);
    expect(service.getEnabledMethodsForCurrency(Currency.CUP)).toEqual([SalePaymentMethod.Efectivo]);
    expect(service.getEnabledMethodsForCurrency(Currency.MLC)).toEqual([]);
    expect(service.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
    ]);
  });

  it('setMethodEnabled is idempotent', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setMethodEnabled(S1, SalePaymentMethod.Zelle, false);
    const afterFirstWrite = localStorage.getItem(storageKey(S1));
    service.setMethodEnabled(S1, SalePaymentMethod.Zelle, false);
    expect(localStorage.getItem(storageKey(S1))).toBe(afterFirstWrite);
  });
});

describe('StorePaymentMethodsConfigService — per-store isolation + cache reload', () => {
  it('isolates configs per store', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, false);
    expect(service.getConfig(S2)).toEqual(DEFAULT_STORE_PAYMENT_METHODS_CONFIG);
  });

  it('reloads the per-instance cache when the requested store key changes', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    expect(service.getEnabledChannels(S1)).toEqual([...ALL_CHANNEL_KEYS]);
    service.setChannelEnabled(S2, SalePaymentMethod.Zelle, Currency.USD, false);
    expect(service.getEnabledChannels(S1)).toEqual([...ALL_CHANNEL_KEYS]);
    expect(service.getEnabledChannels(S2)).not.toContain('1|1');
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

describe('StorePaymentMethodsConfigService — backup seams (store-payment-methods-backup)', () => {
  const LEGACY_CONFIG: StorePaymentMethodsConfig = {
    enabledMethods: [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia],
  };
  const CHANNEL_CONFIG: StorePaymentMethodsConfig = {
    enabledChannels: ['0|0', '0|2'],
  };

  it('getStorageStorePaymentMethods returns null on an absent key and does NOT auto-initialise', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    expect(service.getStorageStorePaymentMethods()).toBeNull();
    expect(localStorage.getItem(storageKey(S1))).toBeNull();
  });

  it('getStorageStorePaymentMethods returns the persisted config when present, without touching it', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setChannelEnabled(S1, SalePaymentMethod.Zelle, Currency.USD, false);
    const stored = service.getStorageStorePaymentMethods() as StorePaymentMethodsConfig;
    expect(stored.enabledChannels).not.toContain('1|1');
    expect(service.getStorageStorePaymentMethods(S2)).toBeNull();
  });

  it('imports an OLD backup carrying enabledMethods and resolves it', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    const result = service.setImportedStorePaymentMethods(LEGACY_CONFIG);
    expect(result.succeeded).toBe(true);
    expect(service.getStorageStorePaymentMethods()).toEqual(LEGACY_CONFIG);
    expect(service.getEnabledMethodsForCurrency(Currency.USD)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('round-trips the NEW channel shape through setConfigFromBackup + fresh read', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setConfigFromBackup(CHANNEL_CONFIG);

    const stored = localStorage.getItem(storageKey(S1)) as string;
    // No DEK/roster in unit tests -> plaintext passthrough of the JSON.
    expect(JSON.parse(stored)).toEqual(CHANNEL_CONFIG);

    const fresh = new StorePaymentMethodsConfigService(S1);
    expect(fresh.getStorageStorePaymentMethods()).toEqual(CHANNEL_CONFIG);
    expect(fresh.getConfig()).toEqual(CHANNEL_CONFIG);
    expect(fresh.getEnabledChannels()).toEqual(['0|0', '0|2']);
  });

  it('setConfigFromBackup refreshes the in-memory cache of the same instance', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.getConfig();
    service.setConfigFromBackup(CHANNEL_CONFIG);
    expect(service.getConfig()).toEqual(CHANNEL_CONFIG);
    expect(service.getEnabledChannels()).toEqual(['0|0', '0|2']);
  });

  it('setConfigFromBackup is per-store: another store is untouched', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    service.setConfigFromBackup(CHANNEL_CONFIG, S2);
    expect(service.getStorageStorePaymentMethods(S1)).toBeNull();
    expect(service.getStorageStorePaymentMethods(S2)).toEqual(CHANNEL_CONFIG);
  });

  it('setImportedStorePaymentMethods persists and returns a success Result', () => {
    const service = new StorePaymentMethodsConfigService(S1);
    const result = service.setImportedStorePaymentMethods(CHANNEL_CONFIG);
    expect(result.succeeded).toBe(true);
    expect(service.getStorageStorePaymentMethods()).toEqual(CHANNEL_CONFIG);
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

  it('respects the per-currency catalogue for USD (Efectivo, Zelle, Transferencia)', () => {
    const usdBase = [
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ];
    expect(
      applyStorePaymentMethodsConfig(
        usdBase,
        enabledMethodsForCurrency(['1|0', '1|2'], Currency.USD),
      ),
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
