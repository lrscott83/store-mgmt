import { GlobalConfig } from '~/shared/lib/config/global-config';
import type { AsyncProductService } from './product-online-service';
import { ProductOnlineService } from './product-online-service';
import { ProductOfflineService } from './product-offline-service';

/**
 * React mirror of Angular's `productServiceFactory` (_services/factories/product-service.factory.ts):
 * returns the online or offline `ProductService` implementation gated by
 * `GlobalConfig.USE_ONLINE_SERVICE`. Typed as the async-only `AsyncProductService` (Flag C) — the
 * offline service (full `ProductService`, structural superset) and the online service (the 12
 * async methods) are both assignable. Online is reference-only (never validated live).
 *
 * The offline service needs `storeId`; the online one has no store concept (Angular's online
 * constructor takes only `HttpClient`), so `storeId` is only forwarded to the offline branch.
 */
export function createProductService(storeId: string): AsyncProductService {
  return GlobalConfig.USE_ONLINE_SERVICE
    ? new ProductOnlineService()
    : new ProductOfflineService(storeId);
}
