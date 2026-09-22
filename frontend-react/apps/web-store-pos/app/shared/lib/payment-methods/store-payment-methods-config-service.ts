import type { SalePaymentMethod } from '@store-mgmt/domain';
import { SalePaymentMethod as PaymentMethodEnum } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';

/**
 * Per-store payment-methods config (store-payment-methods-config, 2026-09-22):
 * which of the plan-catalogue payment methods the store actually accepts.
 * Persisted in the FRONTEND only (localStorage, ChannelRateOfflineService
 * pattern) — no backend, no sync/export participation; config is local per
 * device, exactly like channel-rates.
 *
 * Semantics:
 * - Efectivo is ALWAYS on and is never stored as disabled: toggling it is a
 *   no-op, and `applyStorePaymentMethodsConfig` forces it back in regardless
 *   of `enabledMethods` (no-regression rule, keeps the vuelto/isCashMethod
 *   flow intact).
 * - Absent key (store never configured) auto-inits to the DEFAULT (all
 *   methods on) — byte-identical to the pre-config catalogue.
 * - Plan/module rules are applied ON TOP at the consumption sites (the
 *   `hasMultiMonedas` gate); this service can only REMOVE methods.
 */
export interface StorePaymentMethodsConfig {
  /** Methods the store accepts. Efectivo is always implied on top. */
  enabledMethods: SalePaymentMethod[];
}

/** Default catalogue: all methods on (no-regression for unconfigured stores). */
export const DEFAULT_ENABLED_PAYMENT_METHODS: readonly SalePaymentMethod[] = [
  PaymentMethodEnum.Efectivo,
  PaymentMethodEnum.Zelle,
  PaymentMethodEnum.Transferencia,
];

export const DEFAULT_STORE_PAYMENT_METHODS_CONFIG: StorePaymentMethodsConfig = {
  enabledMethods: [...DEFAULT_ENABLED_PAYMENT_METHODS],
};

/**
 * Composition helper: keeps Efectivo unconditionally (it can never be
 * disabled) and drops every other method the store disabled. `baseMethods` is
 * the plan gate output at each consumption site.
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

/**
 * Per-store persistence of the payment-methods config, mirroring the
 * `ChannelRateOfflineService` shape: encrypted wire format via
 * `StorageKeys` + `encryptEntity` + `readEntityOrThrow`, per-instance cache
 * reloaded when the store key changes, auto-init on a genuinely empty read
 * (absent key -> persist the default -> return it).
 *
 * The constructor storeId is the convenience default for the methods'
 * `storeId` parameter (callers usually act on their own store only).
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

  getEnabledMethods(storeId: string = this.storeId): SalePaymentMethod[] {
    return [...this.getConfig(storeId).enabledMethods];
  }

  /**
   * Enables/disables a method for the store. Efectivo cannot be disabled:
   * toggling it is a no-op (it is never stored as off, the compositor forces
   * it on anyway). `false` removes the method from `enabledMethods`; `true`
   * adds it back. Idempotent.
   */
  setMethodEnabled(
    storeId: string,
    method: SalePaymentMethod,
    enabled: boolean,
  ): void {
    if (method === PaymentMethodEnum.Efectivo) return;
    const current = this.getConfig(storeId).enabledMethods;
    const hasMethod = current.includes(method);
    if (enabled === hasMethod) return;

    const enabledMethods = enabled
      ? [...current, method]
      : current.filter((m) => m !== method);
    // Canonical order (default catalogue order), so re-enabling a method
    // restores its original position and storage stays stable. The
    // compositor only checks membership, but deterministic bytes are easier
    // to reason about.
    const ordered = [...DEFAULT_ENABLED_PAYMENT_METHODS].filter((m) =>
      enabledMethods.includes(m),
    );
    const next: StorePaymentMethodsConfig = { enabledMethods: ordered };
    this.config = next;
    this.lastConfigKey = this.getCurrentStorageKey(storeId);
    localStorage.setItem(
      this.getStorageKey(storeId),
      encryptEntity(JSON.stringify(next)),
    );
  }

  private getConfigFromLocalStorage(storeId: string): StorePaymentMethodsConfig {
    const stored = readEntityOrThrow(this.getStorageKey(storeId), (json) =>
      json ? (JSON.parse(json) as StorePaymentMethodsConfig) : null,
    );
    if (stored) return stored;

    // Absent key -> auto-init with the default (no-regression).
    const fresh: StorePaymentMethodsConfig = { ...DEFAULT_STORE_PAYMENT_METHODS_CONFIG };
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