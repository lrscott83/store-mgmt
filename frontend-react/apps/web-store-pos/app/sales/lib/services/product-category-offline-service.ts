import type { BaseResponseModel, ProductCategory, ProductCategoryService, ProductCategoryView } from '@store-mgmt/domain';
import { failure, success } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '../repositories/product-category-repository';
import { ProductRepository } from '../repositories/product-repository';

/**
 * ProductCategoryOfflineService — React mirror of Angular's
 * `application/categories/product-category-offline.service.ts`. Reconciled (Phase 2,
 * slice 5 + step 8 cleanup) to Angular's exact category-service surface: the 5 abstract
 * methods (`createProductCategory`/`updateProductCategory`/`getMaxOrder`/
 * `getAvailableProductCategories`/`getProductCategoriesView`) plus the offline-only
 * public `getProductCategories()`, ALL category C (`Promise<BaseResponseModel<T>>`,
 * resolve-never-reject) — delegating persistence to `ProductCategoryRepository` (and,
 * for `getProductCategoriesView`'s per-category product count, `ProductRepository`),
 * mirroring Angular's 3-arg constructor (`http, categoryRepository, productRepository`,
 * product-category-offline.service.ts:21).
 *
 * `extends BaseService<ProductCategory>` (hence the legacy `getAll`/`getById`/`delete`
 * sync surface, previously backed by a module-level `BaseRepository`) has been fully
 * retired (Phase 2 step 8, Flag #3) — the local `delete` override had zero call sites
 * anywhere in `app/` (never ported from Angular), confirmed by grep at WU5.
 *
 * The React-only members `save`/`addByName`/`getByName`/`hasAnyCategory`/
 * `hasAnyAvailableCategory` are REMOVED — Angular exposes their equivalents on the
 * REPOSITORY only (`ProductCategoryRepository.addProductCategoryByName`/
 * `getProductCategoryByName`/`hasAnyCategory`/`hasAnyAvailableCategory`), never on the
 * service (spec.md "Category Service Method Surface Parity").
 */
export class ProductCategoryOfflineService implements ProductCategoryService {
  private readonly categoryRepository: ProductCategoryRepository;
  private readonly productRepository: ProductRepository;

  constructor(
    private readonly storeId: string,
    categoryRepository?: ProductCategoryRepository,
    productRepository?: ProductRepository,
  ) {
    this.categoryRepository = categoryRepository ?? new ProductCategoryRepository(storeId);
    this.productRepository = productRepository ?? new ProductRepository(storeId, new ProductCategoryRepository(storeId));
  }

  /** 1:1 port of Angular `createProductCategory` (product-category-offline.service.ts:30-33). */
  createProductCategory(name: string, order: number, isActive: boolean): Promise<BaseResponseModel<boolean>> {
    const result = this.categoryRepository.addProductCategory(name, order, isActive);
    return Promise.resolve(result.succeeded ? success(true) : failure(result.errors));
  }

  /** 1:1 port of Angular `updateProductCategory` (product-category-offline.service.ts:35-38). */
  updateProductCategory(
    id: string,
    name: string,
    order: number,
    isActive: boolean,
  ): Promise<BaseResponseModel<boolean>> {
    const result = this.categoryRepository.updateProductCategory(id, name, order, isActive);
    return Promise.resolve(result.succeeded ? success(true) : failure(result.errors));
  }

  /**
   * Offline-only public method (NOT on the abstract interface), 1:1 port of Angular
   * `getProductCategories` (product-category-offline.service.ts:40-43) — never fails.
   */
  getProductCategories(): Promise<BaseResponseModel<ProductCategory[]>> {
    return Promise.resolve(success(this.categoryRepository.getProductCategories()));
  }

  /** 1:1 port of Angular `getAvailableProductCategories` (product-category-offline.service.ts:45-48) — never fails. */
  getAvailableProductCategories(): Promise<BaseResponseModel<ProductCategory[]>> {
    return Promise.resolve(success(this.categoryRepository.getAvailableProductCategories()));
  }

  /**
   * Catalog view projection — ALL categories, each with its TOTAL product count.
   *
   * DIVERGES DELIBERATELY from the Angular 1:1 port
   * (`product-category-offline.service.ts:50-65`, which projects only
   * `getAvailableProductCategories()` and counts with the stricter
   * `isActive && availableToSale` predicate). See
   * `openspec/changes/catalog-show-all-and-clear-data/superpowers-design.md` §D1.
   *
   * `ProductsPage`'s `loadData` in `products.tsx` is the sole production
   * consumer of this method, so widening it reaches no other screen. It must
   * show every category, inactive included — `isActive` travels on each row
   * so the UI can mark them.
   *
   * `productsCount` deliberately resolves through the SAME repository method
   * the catalog uses for its per-category list,
   * `ProductRepository.getProductsByCategoryId` (reached from that same sole
   * consumer via `ProductOfflineService.getAvailableProductsByCategoryId`).
   * Two different predicates are exactly how the badge came to disagree with
   * the rows below it; sharing one makes them agree by construction. Never
   * fails.
   */
  getProductCategoriesView(): Promise<BaseResponseModel<ProductCategoryView[]>> {
    const categories = this.categoryRepository.getProductCategories();
    const categoriesView: ProductCategoryView[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      order: category.order,
      isActive: category.isActive,
      productsCount: this.productRepository.getProductsByCategoryId(category.id).length,
    }));
    return Promise.resolve(success(categoriesView));
  }

  /**
   * 1:1 port of Angular `getMaxOrder` (product-category-offline.service.ts:100-103) — GLOBAL
   * max across ALL categories (store-wide scope), never fails. Distinct from
   * `ProductService.getMaxOrderByCategoryId(categoryId)`, which is per-category.
   * Do not unify.
   */
  getMaxOrder(): Promise<BaseResponseModel<number>> {
    const categories = this.categoryRepository.getProductCategories();
    return Promise.resolve(success(Math.max(...categories.map((c) => c.order), 0)));
  }
}
