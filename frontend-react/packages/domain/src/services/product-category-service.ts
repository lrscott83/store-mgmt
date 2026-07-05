import type { ProductCategory } from '../models/product';
import type { BaseService } from './base-service';

/**
 * ProductCategoryService — sync equivalent of Angular's ProductCategoryService
 * (application/categories/product-category.service.ts). Angular never declares
 * getProductCategories() abstract (commented out), causing its own two impls to
 * diverge — this interface declares the full read surface explicitly (bug fix,
 * spec #673 requirement). Slice 1 declares only the surface the current offline
 * implementation already satisfies (design ADR-3); Slice 2 extends this with
 * getMaxOrder, getProductCategoriesView, getAvailableProductCategories.
 */
export interface ProductCategoryService extends BaseService<ProductCategory> {
  getByName(name: string): ProductCategory | undefined;
  save(category: ProductCategory): ProductCategory;
}
