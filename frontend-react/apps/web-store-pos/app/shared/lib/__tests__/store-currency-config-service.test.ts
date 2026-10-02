import { describe, it, expect, beforeEach } from 'vitest';
import { Currency } from '@store-mgmt/domain';
import {
  DEFAULT_STORE_CURRENCY_CONFIG,
  StoreCurrencyConfigService,
} from '../store-currency-config-service';
import type { StoreCurrencyConfig } from '../store-currency-config-service';
import { StorageKeys, BUSINESS_ENTITY_NAMES } from '~/shared/lib/storage/storage-keys';

const S1 = 's1';

function storageKey(storeId: string): string {
  return StorageKeys.entityKey('storeCurrencyConfig', storeId);
}

beforeEach(() => {
  localStorage.clear();
});

describe('StoreCurrencyConfigService — default / auto-init', () => {
  it('returns the default (CUP/CUP) when the key is absent', () => {
    const service = new StoreCurrencyConfigService(S1);
    expect(service.getConfig()).toEqual(DEFAULT_STORE_CURRENCY_CONFIG);
    expect(service.getConfig()).toEqual({ buyCurrency: Currency.CUP, sellCurrency: Currency.CUP });
  });

  it('auto-inits by PERSISTING the default on the empty read', () => {
    const service = new StoreCurrencyConfigService(S1);
    service.getConfig();
    const stored = localStorage.getItem(storageKey(S1));
    expect(stored).not.toBeNull();
    // No DEK/roster in unit tests -> plaintext passthrough of the JSON.
    expect(JSON.parse(stored as string)).toEqual(DEFAULT_STORE_CURRENCY_CONFIG);
  });
});

describe('StoreCurrencyConfigService — set/get round-trip', () => {
  it('persists and re-reads the configured currencies', () => {
    const service = new StoreCurrencyConfigService(S1);
    service.setConfig({ buyCurrency: Currency.USD, sellCurrency: Currency.EUR });

    const stored = localStorage.getItem(storageKey(S1)) as string;
    expect(JSON.parse(stored)).toEqual({ buyCurrency: Currency.USD, sellCurrency: Currency.EUR });

    const fresh = new StoreCurrencyConfigService(S1);
    expect(fresh.getConfig()).toEqual({ buyCurrency: Currency.USD, sellCurrency: Currency.EUR });
  });

  it('a partial set keeps the other field unchanged', () => {
    const service = new StoreCurrencyConfigService(S1);
    service.setConfig({ buyCurrency: Currency.USD, sellCurrency: Currency.EUR });
    service.setConfig({ buyCurrency: Currency.MLC });

    expect(service.getConfig()).toEqual({ buyCurrency: Currency.MLC, sellCurrency: Currency.EUR });
  });

  it('convenience setters update one field at a time', () => {
    const service = new StoreCurrencyConfigService(S1);
    service.setBuyCurrency(Currency.CAD);
    service.setSellCurrency(Currency.MXN);

    expect(service.getConfig()).toEqual({ buyCurrency: Currency.CAD, sellCurrency: Currency.MXN });
  });
});

describe('StoreCurrencyConfigService — validation', () => {
  it('falls back to CUP for an invalid stored currency, per field', () => {
    localStorage.setItem(
      storageKey(S1),
      JSON.stringify({ buyCurrency: 999, sellCurrency: Currency.USD }),
    );
    const service = new StoreCurrencyConfigService(S1);
    expect(service.getConfig()).toEqual({ buyCurrency: Currency.CUP, sellCurrency: Currency.USD });
  });

  it('defaults missing/unknown fields to CUP', () => {
    localStorage.setItem(storageKey(S1), JSON.stringify({}));
    const service = new StoreCurrencyConfigService(S1);
    expect(service.getConfig()).toEqual(DEFAULT_STORE_CURRENCY_CONFIG);
  });

  it('validates an invalid value passed to setConfig', () => {
    const service = new StoreCurrencyConfigService(S1);
    const patch = {
      buyCurrency: 999,
      sellCurrency: Currency.USD,
    } as unknown as Partial<StoreCurrencyConfig>;
    service.setConfig(patch);

    expect(service.getConfig()).toEqual({ buyCurrency: Currency.CUP, sellCurrency: Currency.USD });
  });
});

describe('storeCurrencyConfig storage registration', () => {
  it('is registered as a business entity so wipe/migration/recovery see it', () => {
    expect(BUSINESS_ENTITY_NAMES).toContain('storeCurrencyConfig');
  });
});
