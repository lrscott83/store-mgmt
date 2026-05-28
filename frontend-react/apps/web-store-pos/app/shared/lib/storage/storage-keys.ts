import { GlobalConfig } from '../config/global-config';

export const StorageKeys = {
  TOKEN: 'token',
  AUTH_MODEL: `${GlobalConfig.APP_VERSION}-authf496fc5a9f17`,
  CURRENT_USER: 'currentUser',
  LANGUAGE: 'language',
  entityKey: (entity: string, storeId: string) =>
    `lizoft.store-${entity}-${storeId}`,
} as const;
