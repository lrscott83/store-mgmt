import type { Product } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';

/**
 * ProductRepository — React mirror of Angular's
 * `frontend/src/app/application/products/product.repository.ts`.
 *
 * This slice ports the LOOKUP surface consumed by `InventoryOfflineService`'s
 * product-existence guards: `getProductById`, `getAvailableProductById`,
 * `getStorageProductsMap`. These are Angular category-A methods — plain synchronous
 * domain-value reads (no envelope). The command/validation surface
 * (add/update/soft-delete/activate-deactivate/order-shift/setDiscountFromInvantory) is
 * added by `product-service-parity`, which EXTENDS this class rather than re-creating it
 * (see openspec/changes/product-service-parity/design.md — dedicated ProductRepository).
 *
 * Backed by the same storage-only `BaseRepository<Product>('products', ...)` that
 * `ProductOfflineService` writes through, so both layers share a single product store.
 */
export class ProductRepository {
  private readonly repo: BaseRepository<Product>;

  constructor(private readonly storeId: string) {
    this.repo = new BaseRepository<Product>('products', ['createdDate', 'updatedDate']);
  }

  /** 1:1 port of Angular `getStorageProductsMap` (product.repository.ts:36-40). */
  getStorageProductsMap(): Map<string, Product> {
    return this.repo.getAll(this.storeId);
  }

  /**
   * 1:1 port of Angular `getProductById` (product.repository.ts:55-57) — plain sync,
   * returns the product or `undefined` when absent (Angular returns the raw Map lookup,
   * which is `undefined` for a missing key).
   */
  getProductById(id: string): Product | undefined {
    return this.repo.getById(this.storeId, id);
  }

  /**
   * 1:1 port of Angular `getAvailableProductById` (product.repository.ts:50-53): returns
   * the product only when it exists AND `isActive`, else `undefined`. Angular returns
   * `null`; React uses `undefined` (both falsy — the existence guards check truthiness).
   */
  getAvailableProductById(id: string): Product | undefined {
    const product = this.repo.getById(this.storeId, id);
    return product && product.isActive ? product : undefined;
  }
}
