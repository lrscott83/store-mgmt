import { GlobalConfig } from '../config/global-config';

export const StorageKeys = {
  TOKEN: 'token',
  AUTH_MODEL: `${GlobalConfig.APP_VERSION}-authf496fc5a9f17`,
  CURRENT_USER: 'currentUser',
  LANGUAGE: 'language',
  // Dismissed-flag for the closable billing TRIAL notice (payment-banner.tsx).
  // Lifecycle: set when the user closes the banner; cleared by logout() so the
  // notice reappears after the next authentication.
  TRIAL_NOTICE_DISMISSED: 'trialNoticeDismissed',
  // RETIRED with the daily USD→MN register (retire-exchange-rates-register),
  // KEPT because the migration that resolves it is the only thing that can
  // still wipe it: `migrate-exchange-rates-to-channel-rates` removes this
  // anchor together with the register once its days are migrated (or once the
  // store turns out to have no MultiMonedas to hold them). Deleting the key
  // constant would leave that wipe with no single source of truth.
  EXCHANGE_RATES_FIRST_LOGIN: 'exchangeRatesFirstLogin',
  entityKey: (entity: string, storeId: string) => `lizoft.store-${entity}-${storeId}`,
} as const;

/**
 * The business entities persisted per store, in the order their storage seams
 * landed. Single source of truth: consumed by `entity-migration.ts` (which
 * encrypts them), `store-data-reset.ts` (which wipes them) and
 * `damaged-data-recovery.ts` (which reports them). A new entity added here
 * reaches all three, which is the point — a private copy in any module would
 * let a wipe silently miss one.
 */
export const BUSINESS_ENTITY_NAMES = [
  'products',
  'product-categories',
  'inventory-entries',
  'orders',
  'expenses',
  'saleCredits',
  // Retired with the daily USD→MN register (retire-exchange-rates-register),
  // KEPT on this list on purpose: it is the single source of truth that makes
  // `entity-migration` encrypt a legacy plaintext entry, `store-data-reset`
  // wipe it and `damaged-data-recovery` offer to remove it. A device upgraded
  // from the old app can still carry one, and dropping the name would leave
  // that data invisible to all three.
  'exchangeRates',
  'warehouses',
  'warehouse-stock-levels',
  'warehouse-stock-movements',
  // multipayments (T4): append-only channel-rate register.
  'channelRates',
  // elaboration-module: recetas + elaboraciones, the two entities the
  // production module persists offline per store.
  'recipes',
  'elaborations',
  // store-payment-methods-config (2026-09-22): per-store payment-methods
  // config, persisted with the same `entityKey` convention as the rest.
  // Registered here on 2026-09-23: its absence let one damaged entry keep a
  // store locked out — the damaged-data recovery dialog could not remove it,
  // so the store failed to boot on every attempt. Being on this list is what
  // makes `entity-migration` encrypt it, `store-data-reset` wipe it and
  // `damaged-data-recovery` report it.
  'storePaymentMethods',
  // owner-messaging (T8): offline-queued text messages, flushed on reconnect.
  'messagesQueue',
  // store-currency-config: per-store buy/sell currency config, persisted with
  // the same `entityKey` convention as the rest.
  'storeCurrencyConfig',
] as const;
