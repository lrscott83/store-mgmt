import { Currency } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';

/**
 * Per-store currency configuration: the currency a store BUYS and SELLS in.
 * Persisted in the FRONTEND only (localStorage), following the
 * `StorePaymentMethodsConfigService` seam: per-store `entityKey`, encrypted
 * wire format, auto-init on an absent key.
 */

/** The currencies a store may configure, mirroring cart-currency-preference.ts. */
const VALID_CURRENCIES: ReadonlySet<number> = new Set<number>([
  Currency.CUP,
  Currency.USD,
  Currency.EUR,
  Currency.CLA,
  Currency.MLC,
  Currency.CAD,
  Currency.MXN,
]);

export interface StoreCurrencyConfig {
  buyCurrency: Currency;
  sellCurrency: Currency;
}

export const DEFAULT_STORE_CURRENCY_CONFIG: StoreCurrencyConfig = {
  buyCurrency: Currency.CUP,
  sellCurrency: Currency.CUP,
};

/** Coerces a stored value to a valid Currency; anything else falls back to CUP. */
function toValidCurrency(value: unknown): Currency {
  const numeric = Number(value);
  return VALID_CURRENCIES.has(numeric) ? (numeric as Currency) : Currency.CUP;
}

/** Normalises any stored shape, defaulting missing/unknown fields to CUP. */
function normalizeConfig(raw: unknown): StoreCurrencyConfig {
  const source = (raw ?? {}) as Partial<StoreCurrencyConfig>;
  return {
    buyCurrency: toValidCurrency(source.buyCurrency),
    sellCurrency: toValidCurrency(source.sellCurrency),
  };
}

/**
 * Per-store persistence of the currency config, mirroring the
 * `StorePaymentMethodsConfigService` pattern: encrypted wire format via
 * `StorageKeys` + `encryptEntity` + `readEntityOrThrow`, auto-init on an
 * absent key (persist the default and return it), and a render-path fallback
 * to the default when the stored value is encrypted but no DEK is in memory.
 */
export class StoreCurrencyConfigService {
  constructor(private readonly storeId: string) {}

  /** Reads the store config, auto-initialising the default on an absent key. */
  getConfig(): StoreCurrencyConfig {
    let stored: StoreCurrencyConfig | null;
    try {
      stored = this.readConfigFromLocalStorage();
    } catch (err) {
      // Same Grupo A guard as the payment config: this read runs during render,
      // so a MissingDataKeyError (encrypted value, no DEK in memory) must not
      // crash the UI. Fall back to a copy of the default WITHOUT persisting
      // (encryptEntity needs the same missing key). Other errors propagate.
      if ((err as { name?: string })?.name === 'MissingDataKeyError') {
        return { ...DEFAULT_STORE_CURRENCY_CONFIG };
      }
      throw err;
    }
    if (stored) return stored;

    // Absent key -> auto-init with the default (no-regression).
    const fresh: StoreCurrencyConfig = { ...DEFAULT_STORE_CURRENCY_CONFIG };
    this.setConfigLocalStorage(fresh);
    return fresh;
  }

  /** Merges a patch into the current config, validates it, and persists. */
  setConfig(patch: Partial<StoreCurrencyConfig>): void {
    this.setConfigLocalStorage(normalizeConfig({ ...this.getConfig(), ...patch }));
  }

  /** Convenience: sets only the buy currency. */
  setBuyCurrency(currency: Currency): void {
    this.setConfig({ buyCurrency: currency });
  }

  /** Convenience: sets only the sell currency. */
  setSellCurrency(currency: Currency): void {
    this.setConfig({ sellCurrency: currency });
  }

  private readConfigFromLocalStorage(): StoreCurrencyConfig | null {
    return readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? normalizeConfig(JSON.parse(json)) : null,
    );
  }

  private setConfigLocalStorage(config: StoreCurrencyConfig): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(config)));
  }

  private getStorageKey(): string {
    return StorageKeys.entityKey('storeCurrencyConfig', this.storeId);
  }
}
