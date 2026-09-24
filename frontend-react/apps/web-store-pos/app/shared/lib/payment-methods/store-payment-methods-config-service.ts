import type { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import {
  PAYMENT_CHANNELS,
  SalePaymentMethod as PaymentMethodEnum,
  channelKey,
} from '@store-mgmt/domain';
import { Result } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';

/**
 * Per-store payment configuration (store-payment-methods-config, 2026-09-22;
 * per-channel since payment-channels-and-multipayment T20, 2026-09-24).
 *
 * A CHANNEL is a (method, currency) pair of the canonical catalogue
 * (`PAYMENT_CHANNELS`), persisted as its stable `channelKey`. A store turns
 * individual channels on/off, and a sale method is offered per currency only
 * when at least one enabled channel uses it for that currency.
 *
 * Shape compatibility:
 * - `enabledChannels` (new, T20) is the source of truth when present.
 * - `enabledMethods` (legacy, currency-agnostic) stays readable for data and
 *   backups written before T20; it resolves to every channel whose method it
 *   lists. It is only consulted when `enabledChannels` is absent.
 * - Neither field present (store never configured) resolves to the default:
 *   every channel on — byte-identical to the pre-config catalogue.
 *
 * Efectivo is ALWAYS on: it can never be disabled, and the compositor forces it
 * back in regardless of the stored config (no-regression rule, keeps the
 * vuelto/isCashMethod flow intact).
 *
 * Persisted in the FRONTEND only (localStorage, ChannelRateOfflineService
 * pattern) and it participates in the sync/backup round-trip. Plan/module rules
 * are applied ON TOP at the consumption sites (the `hasMultiMonedas` gate); this
 * service can only REMOVE channels.
 */
export interface StorePaymentMethodsConfig {
  /** Legacy shape: methods the store accepted, currency-agnostic. Read-only compat. */
  enabledMethods?: SalePaymentMethod[];
  /** Per-channel shape: `channelKey` of every enabled channel. Wins over `enabledMethods`. */
  enabledChannels?: string[];
}

/** Every channel key of the canonical catalogue, in catalogue order. */
export const ALL_CHANNEL_KEYS: readonly string[] = PAYMENT_CHANNELS.map((channel) =>
  channelKey(channel.method, channel.currency),
);

/**
 * Legacy method default, kept for the currency-agnostic compatibility query
 * (`getEnabledMethods`). New configs persist channels instead.
 */
export const DEFAULT_ENABLED_PAYMENT_METHODS: readonly SalePaymentMethod[] = [
  PaymentMethodEnum.Efectivo,
  PaymentMethodEnum.Zelle,
  PaymentMethodEnum.Transferencia,
];

/** Default: every channel on (no-regression for unconfigured stores). */
export const DEFAULT_ENABLED_CHANNEL_KEYS: readonly string[] = ALL_CHANNEL_KEYS;

export const DEFAULT_STORE_PAYMENT_METHODS_CONFIG: StorePaymentMethodsConfig = {
  enabledChannels: [...DEFAULT_ENABLED_CHANNEL_KEYS],
};

/**
 * Resolves the enabled channel keys of a stored config, applying the compat
 * rule: `enabledChannels` wins when present; otherwise the equivalent channels
 * of the legacy `enabledMethods` are derived; otherwise the default (all on).
 */
export function resolveEnabledChannelKeys(config: StorePaymentMethodsConfig): string[] {
  if (Array.isArray(config.enabledChannels)) return [...config.enabledChannels];
  if (Array.isArray(config.enabledMethods)) {
    const methods = config.enabledMethods;
    return PAYMENT_CHANNELS.filter((channel) => methods.includes(channel.method)).map((channel) =>
      channelKey(channel.method, channel.currency),
    );
  }
  return [...DEFAULT_ENABLED_CHANNEL_KEYS];
}

/**
 * Methods enabled for a currency: a method is present when at least one enabled
 * channel uses it for that currency. Efectivo is NOT forced here — the
 * compositor (`applyStorePaymentMethodsConfig`) keeps it.
 */
export function enabledMethodsForCurrency(
  enabledChannelKeys: readonly string[],
  currency: Currency | number,
): SalePaymentMethod[] {
  const keys = new Set(enabledChannelKeys);
  return PAYMENT_CHANNELS.filter(
    (channel) =>
      Number(channel.currency) === Number(currency) &&
      keys.has(channelKey(channel.method, channel.currency)),
  ).map((channel) => channel.method);
}

/** True when a channel is enabled. Efectivo channels are ALWAYS enabled. */
export function channelEnabled(
  enabledChannelKeys: readonly string[],
  method: SalePaymentMethod,
  currency: Currency | number,
): boolean {
  if (method === PaymentMethodEnum.Efectivo) return true;
  return enabledChannelKeys.includes(channelKey(method, currency));
}

/**
 * Composition helper: keeps Efectivo unconditionally (it can never be disabled)
 * and drops every method the store disabled for the relevant currency.
 * `baseMethods` is the per-currency plan-gate output at each consumption site
 * and `enabledMethods` is the per-currency enabled list
 * (`enabledMethodsForCurrency`).
 */
export function applyStorePaymentMethodsConfig(
  baseMethods: readonly SalePaymentMethod[],
  enabledMethods: readonly SalePaymentMethod[],
): SalePaymentMethod[] {
  return baseMethods.filter(
    (method) =>
      method === PaymentMethodEnum.Efectivo || enabledMethods.includes(method),
  );
}

/** Set equality for channel-key lists (order-insensitive). */
function sameKeySet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((key) => set.has(key));
}

/**
 * Per-store persistence of the payment config, mirroring the
 * `ChannelRateOfflineService` shape: encrypted wire format via
 * `StorageKeys` + `encryptEntity` + `readEntityOrThrow`, per-instance cache
 * reloaded when the store key changes, auto-init on a genuinely empty read
 * (absent key -> persist the default -> return it).
 *
 * The constructor storeId is the convenience default for the methods' `storeId`
 * parameter (callers usually act on their own store only).
 */
export class StorePaymentMethodsConfigService {
  private config: StorePaymentMethodsConfig | null = null;
  private lastConfigKey: string | undefined;

  constructor(private readonly storeId: string) {}

  getConfig(storeId: string = this.storeId): StorePaymentMethodsConfig {
    if (
      !this.config ||
      this.getCurrentStorageKey(storeId) !== this.lastConfigKey
    ) {
      this.config = this.getConfigFromLocalStorage(storeId);
    }
    return this.config;
  }

  /** Resolved enabled channel keys for the store. */
  getEnabledChannels(storeId: string = this.storeId): string[] {
    return resolveEnabledChannelKeys(this.getConfig(storeId));
  }

  /** Per-channel resolution: methods enabled for a currency. */
  getEnabledMethodsForCurrency(
    currency: Currency | number,
    storeId: string = this.storeId,
  ): SalePaymentMethod[] {
    return enabledMethodsForCurrency(this.getEnabledChannels(storeId), currency);
  }

  /** True when the (method, currency) channel is enabled. Efectivo is always on. */
  isChannelEnabled(
    method: SalePaymentMethod,
    currency: Currency | number,
    storeId: string = this.storeId,
  ): boolean {
    return channelEnabled(this.getEnabledChannels(storeId), method, currency);
  }

  /**
   * Legacy currency-agnostic query: methods with at least one enabled channel,
   * in canonical order. Kept for compatibility checks; consumers working per
   * currency must use `getEnabledMethodsForCurrency`.
   */
  getEnabledMethods(storeId: string = this.storeId): SalePaymentMethod[] {
    const keys = new Set(this.getEnabledChannels(storeId));
    return [...DEFAULT_ENABLED_PAYMENT_METHODS].filter((method) =>
      PAYMENT_CHANNELS.some(
        (channel) =>
          channel.method === method &&
          keys.has(channelKey(channel.method, channel.currency)),
      ),
    );
  }

  /**
   * Enables/disables a single channel. Efectivo cannot be disabled: toggling a
   * cash channel is a no-op (never stored as off, the compositor forces it on
   * anyway). Writes the per-channel shape (migrating any legacy
   * `enabledMethods`) in canonical catalogue order. Idempotent.
   */
  setChannelEnabled(
    storeId: string,
    method: SalePaymentMethod,
    currency: Currency | number,
    enabled: boolean,
  ): void {
    if (method === PaymentMethodEnum.Efectivo) return;
    const current = this.getEnabledChannels(storeId);
    const key = channelKey(method, currency);
    const hasChannel = current.includes(key);
    if (enabled === hasChannel) return;

    const next = enabled
      ? [...current, key]
      : current.filter((candidate) => candidate !== key);
    this.persistChannels(storeId, next);
  }

  /**
   * Legacy method-level convenience: disables EVERY channel of the method (or
   * re-enables them for their valid currencies). Efectivo is a no-op. Kept so
   * callers/tests written against the pre-channel shape keep working; new UI
   * toggles individual channels through `setChannelEnabled`.
   */
  setMethodEnabled(
    storeId: string,
    method: SalePaymentMethod,
    enabled: boolean,
  ): void {
    if (method === PaymentMethodEnum.Efectivo) return;
    const current = this.getEnabledChannels(storeId);
    const methodKeys = PAYMENT_CHANNELS.filter((channel) => channel.method === method).map(
      (channel) => channelKey(channel.method, channel.currency),
    );
    const next = enabled
      ? [...current, ...methodKeys.filter((key) => !current.includes(key))]
      : current.filter((key) => !methodKeys.includes(key));
    if (sameKeySet(current, next)) return;
    this.persistChannels(storeId, next);
  }

  /**
   * Backup read seam (store-payment-methods-backup): returns the stored config
   * WITHOUT auto-initialising — an absent key yields `null` (store never
   * configured), never the default. Structurally satisfies the serializer's
   * `StorePaymentMethodsReader`.
   */
  getStorageStorePaymentMethods(
    storeId: string = this.storeId,
  ): StorePaymentMethodsConfig | null {
    return this.readConfigFromLocalStorage(storeId);
  }

  /**
   * Backup write seam (store-payment-methods-backup): persists the imported
   * config as-is (encrypted wire format), bypassing the auto-init path — an
   * archive's config replaces the local one wholesale. Also refreshes the
   * in-memory cache so subsequent `getConfig()` calls see the imported value.
   * An old archive carrying `enabledMethods` imports unchanged and resolves
   * through the compat rule.
   */
  setConfigFromBackup(
    config: StorePaymentMethodsConfig,
    storeId: string = this.storeId,
  ): void {
    this.setConfigLocalStorage(storeId, config);
    this.config = config;
    this.lastConfigKey = this.getCurrentStorageKey(storeId);
  }

  /**
   * Import seam (store-payment-methods-backup): Result-returning wrapper over
   * {@link setConfigFromBackup} that structurally satisfies the synchronizer's
   * `StorePaymentMethodsImportService`. A throw while persisting becomes a
   * failed Result.
   */
  setImportedStorePaymentMethods(config: StorePaymentMethodsConfig): Result {
    try {
      this.setConfigFromBackup(config);
      return Result.Success();
    } catch {
      return Result.Failure([]);
    }
  }

  private persistChannels(storeId: string, channelKeys: readonly string[]): void {
    const ordered = ALL_CHANNEL_KEYS.filter((key) => channelKeys.includes(key));
    const next: StorePaymentMethodsConfig = { enabledChannels: ordered };
    this.config = next;
    this.lastConfigKey = this.getCurrentStorageKey(storeId);
    localStorage.setItem(
      this.getStorageKey(storeId),
      encryptEntity(JSON.stringify(next)),
    );
  }

  private readConfigFromLocalStorage(storeId: string): StorePaymentMethodsConfig | null {
    return readEntityOrThrow(this.getStorageKey(storeId), (json) =>
      json ? (JSON.parse(json) as StorePaymentMethodsConfig) : null,
    );
  }

  private getConfigFromLocalStorage(storeId: string): StorePaymentMethodsConfig {
    const stored = this.readConfigFromLocalStorage(storeId);
    if (stored) return stored;

    // Absent key -> auto-init with the default (no-regression).
    const fresh: StorePaymentMethodsConfig = {
      enabledChannels: [...DEFAULT_ENABLED_CHANNEL_KEYS],
    };
    this.setConfigLocalStorage(storeId, fresh);
    return fresh;
  }

  private setConfigLocalStorage(
    storeId: string,
    config: StorePaymentMethodsConfig,
  ): void {
    localStorage.setItem(
      this.getStorageKey(storeId),
      encryptEntity(JSON.stringify(config)),
    );
  }

  private getStorageKey(storeId: string): string {
    this.lastConfigKey = this.getCurrentStorageKey(storeId);
    return this.lastConfigKey;
  }

  private getCurrentStorageKey(storeId: string): string {
    return StorageKeys.entityKey('storePaymentMethods', storeId);
  }
}
