import type { ProductService } from '@store-mgmt/domain';
import { GlobalConfig } from '~/shared/lib/config/global-config';
import { ProductOnlineService } from './product-online-service';
import { ProductOfflineService } from './product-offline-service';

/**
 * React mirror of Angular's `productServiceFactory` (_services/factories/product-service.factory.ts):
 * returns the online or offline `ProductService` implementation gated by
 * `GlobalConfig.USE_ONLINE_SERVICE`. Typed as `ProductService` directly — `ProductService` is now
 * standalone async (Phase 2 step 8 dropped `extends BaseService<Product>` + the legacy sync
 * members), so the Flag-C `AsyncProductService` coexistence alias has been retired; both the
 * offline service and the online service (reference-only, never validated live) implement
 * `ProductService` directly.
 *
 * The offline service needs `storeId`; the online one has no store concept (Angular's online
 * constructor takes only `HttpClient`), so `storeId` is only forwarded to the offline branch.
 */
export function createProductService(storeId: string): ProductService {
  return GlobalConfig.USE_ONLINE_SERVICE
    ? new ProductOnlineService()
    : new ProductOfflineService(storeId);
}
