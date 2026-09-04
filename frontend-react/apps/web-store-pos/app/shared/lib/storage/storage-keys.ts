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
  // First local calendar day (YYYY-MM-DD) the STORE OWNER (OwnerAdmin)
  // authenticated on this device. The daily USD→MN register's list runs from
  // today down to this day; stamped once, never updated (daily-exchange-rate).
  EXCHANGE_RATES_FIRST_LOGIN: 'exchangeRatesFirstLogin',
  entityKey: (entity: string, storeId: string) =>
    `lizoft.store-${entity}-${storeId}`,
} as const;

/**
 * The seven business entities persisted per store, in the order their storage
 * seams landed. Single source of truth: consumed by `entity-migration.ts`
 * (which encrypts them) and `store-data-reset.ts` (which wipes them). A new
 * entity added here reaches both, which is the point — a private copy in
 * either module would let a wipe silently miss one.
 */
export const BUSINESS_ENTITY_NAMES = [
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
] as const;
