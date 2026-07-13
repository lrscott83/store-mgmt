import type { ProductCategoryService } from '@store-mgmt/domain';
import { GlobalConfig } from '~/shared/lib/config/global-config';
import { ProductCategoryOnlineService } from './product-category-online-service';
import { ProductCategoryOfflineService } from './product-category-offline-service';

/**
 * React mirror of Angular's `productCategoryServiceFactory`: returns the online or offline
 * `ProductCategoryService` implementation gated by `GlobalConfig.USE_ONLINE_SERVICE`. Byte-for-byte
 * shape of `createProductService` — the online service has no store concept (Angular's online
 * constructor takes only `HttpClient`), so `storeId` is only forwarded to the offline branch.
 */
export function createProductCategoryService(storeId: string): ProductCategoryService {
  return GlobalConfig.USE_ONLINE_SERVICE
    ? new ProductCategoryOnlineService()
    : new ProductCategoryOfflineService(storeId);
}
