import { GlobalConfig } from '../config/global-config';

export const StorageKeys = {
  TOKEN: 'token',
  AUTH_MODEL: `${GlobalConfig.APP_VERSION}-authf496fc5a9f17`,
  CURRENT_USER: 'currentUser',
  LANGUAGE: 'language',
  entityKey: (entity: string, storeId: string) =>
    `lizoft.store-${entity}-${storeId}`,
} as const;

/**
 * The six business entities persisted per store, in the order their storage
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
] as const;
