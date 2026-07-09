import type { ProductCategory, ProductCategoryView } from '../models/product';
import type { BaseResponseModel } from '../models/base';

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
 * `extends BaseService<ProductCategory>` (hence `getAll`/`getById`/`delete`) has been
 * DROPPED (Phase 2 step 8's cross-cutting cleanup, design.md's "`ProductCategoryService`
 * ALSO drops `extends BaseService`" Decision) — the interface is now standalone, exactly
 * the 5 async methods below, no supertype.
 *
 * Flag #3 historical-record correction (tasks-slice8-cleanup.md): design.md's original
 * justification for this drop claimed Angular's category interface has "NO `getAll`/`delete`
 * correlate" — that premise was factually incomplete. Angular's real
 * `ProductCategoryService extends BaseService<ProductCategory>` too
 * (`product-category.service.ts:11`), and its INHERITED `delete` member DOES have a real
 * call site — `products.component.ts:89` (`onDeleteCategory`). However,
 * `ProductCategoryOfflineService` never overrides `delete` there — it inherits
 * `BaseService.delete`, which fires a raw `http.delete(...)` (`base.service.ts:128-140`),
 * i.e. Angular's own OFFLINE category-delete UI feature does NOT actually delete anything
 * from local storage; it hits the network (broken/pointless offline — an Angular-own gap,
 * not something this port should replicate as "working", per angular-bugs-policy). React's
 * `ProductCategoryOfflineService.delete` has its own real local override (`repo.remove(...)`)
 * with ZERO call sites anywhere in `app/` (this feature was never ported to React in any
 * prior slice, confirmed by grep). The drop proceeds exactly as design.md planned — nothing
 * currently depends on React's `delete`, and Angular's own inherited version is
 * non-functional offline anyway — this comment records the corrected justification.
 *
 * `getProductCategories()` stays OFFLINE-CONCRETE-ONLY (per spec.md's method-surface table,
 * "offline concrete additionally exposes the offline-only public `getProductCategories()`")
 * — NOT added to this abstract interface.
 */
export interface ProductCategoryService {
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
