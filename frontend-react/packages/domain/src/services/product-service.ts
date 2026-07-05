import type { Product } from '../models/product';
import type { BaseService } from './base-service';

/**
 * ProductService — sync equivalent of Angular's abstract Product service
 * (domain/interfaces/product.service.ts). Slice 1 declares only the surface the
 * current offline implementation already satisfies (design ADR-3); Slice 2 extends
 * this with getByName, getMaxOrder, activate/deactivate, getAvailableProductsByCategoryId,
 * getProductsToSelect, createCsvProducts.
 */
export interface ProductService extends BaseService<Product> {
  getByBarcode(barcode: string): Product | undefined;
  update(product: Product): Product;
}
