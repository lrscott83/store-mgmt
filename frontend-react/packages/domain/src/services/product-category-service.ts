import type { ProductCategory, ProductCategoryView } from '../models/product';
import type { BaseResponseModel } from '../models/base';
import type { BaseService } from './base-service';

/**
 * ProductCategoryService — React mirror of Angular's abstract `ProductCategoryService`
 * (application/categories/product-category.service.ts:11-27) — Exact-Surface Rule
 * (openspec/changes/product-service-parity/spec.md "Category Service Method Surface
 * Parity"). Angular's abstract surface is exactly `getProductCategoriesView`,
 * `getAvailableProductCategories`, `createProductCategory`, `updateProductCategory`,
 * `getMaxOrder` — all category C (`Promise<BaseResponseModel<T>>`, resolve-never-reject).
 * The React-only members `getByName`/`save`/`hasAnyCategory`/`hasAnyAvailableCategory` have
 * no Angular category-SERVICE correlate (Angular exposes the equivalents on the
 * REPOSITORY only) and are REMOVED, unconditionally, no grace period.
 *
 * `extends BaseService<ProductCategory>` (hence `getAll`/`getById`/`delete`) intentionally
 * STAYS through this slice — dropping it is deferred to Phase 2 step 8's cross-cutting
 * cleanup (see design.md's "`ProductCategoryService` ALSO drops `extends BaseService`"
 * Decision), NOT done here.
 */
export interface ProductCategoryService extends BaseService<ProductCategory> {
  createProductCategory(name: string, order: number, isActive: boolean): Promise<BaseResponseModel<boolean>>;
  updateProductCategory(
    id: string,
    name: string,
    order: number,
    isActive: boolean,
  ): Promise<BaseResponseModel<boolean>>;
  getMaxOrder(): Promise<BaseResponseModel<number>>;
  getAvailableProductCategories(): Promise<BaseResponseModel<ProductCategory[]>>;
  getProductCategoriesView(): Promise<BaseResponseModel<ProductCategoryView[]>>;
}
