import type { ProductCategory } from '@store-mgmt/domain';
import { ProductCategoryErrors, Result } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * ProductCategoryRepository — React mirror of Angular's
 * `frontend/src/app/application/categories/product-category.repository.ts` — EXACT public
 * surface (no `upsert`/`remove`; those are forbidden bridges per the Exact-Surface Rule).
 *
 * One deliberate deviation (Angular-bugs-policy: FIX, don't mirror): Angular's
 * `activateProductCategory(id, isActive)`/`deactivateProductCategory(id, isActive)` declare a
 * SECOND `isActive` parameter that the body never reads (always hardcodes `true`/`false`) — a
 * dead param. React drops it: 1-param `activateProductCategory(id)`/`deactivateProductCategory(id)`.
 *
 * `addProductCategoryData` (Angular repo.ts:71-88, technically public there) is intentionally
 * NOT part of the React public surface — spec.md's "ProductCategoryRepository Mirrors Angular
 * Repo Surface" authoritative list omits it; kept here as a private helper shared by
 * `addProductCategory`/`addImportedProductCategory`.
 *
 * Backed by the same storage-only `BaseRepository<ProductCategory>('product-categories', ...)`
 * that `ProductCategoryOfflineService` writes through today, so both layers share one store
 * (storage key `lizoft.store-product-categories-{storeId}`, confirmed via
 * `StorageKeys.entityKey`, matches Angular exactly).
 */
export class ProductCategoryRepository {
  private readonly repo: BaseRepository<ProductCategory>;

  constructor(private readonly storeId: string) {
    this.repo = new BaseRepository<ProductCategory>('product-categories');
  }

  /** 1:1 port of Angular `getStorageCategoriesMap` (product-category.repository.ts:40-45). */
  getStorageCategoriesMap(): Map<string, ProductCategory> {
    return this.repo.getAll(this.storeId);
  }

  private getStorageCategories(): ProductCategory[] {
    return [...this.getStorageCategoriesMap().values()];
  }

  /** 1:1 port of Angular `hasAnyAvailableCategory` (repo.ts:25-27) — NOT sorted, matches Angular. */
  hasAnyAvailableCategory(): boolean {
    return this.getStorageCategories().some((c) => c.isActive);
  }

  /** 1:1 port of Angular `getProductCategoryById` (repo.ts:51-53). */
  getProductCategoryById(id: string): ProductCategory | undefined {
    return this.getStorageCategories().find((c) => c.id === id);
  }

  /** 1:1 port of Angular `getProductCategoryByName` (repo.ts:55-57). */
  getProductCategoryByName(name: string): ProductCategory | undefined {
    return this.getStorageCategories().find((c) => c.name === name);
  }

  /** 1:1 port of Angular `getProductCategories` (repo.ts:59-61) — ALL, sorted ascending by order. */
  getProductCategories(): ProductCategory[] {
    return this.getStorageCategories().sort((c1, c2) => c1.order - c2.order);
  }

  /** 1:1 port of Angular `getAvailableProductCategories` (repo.ts:63-65). */
  getAvailableProductCategories(): ProductCategory[] {
    return this.getProductCategories().filter((c) => c.isActive);
  }

  /** 1:1 port of Angular `hasAnyCategory` (repo.ts:67-69). */
  hasAnyCategory(): boolean {
    return this.getStorageCategories().length > 0;
  }

  /**
   * 1:1 port of Angular `addProductCategoryData` (repo.ts:71-88) — private in React (see class
   * doc). Name-collision fails with NO persistence; else creates + shifts siblings with
   * `order >= order` by `+1`, then reassigns the new category's own order (redundant
   * double-assign — mirror do-not-simplify, matches Angular lines 83-84).
   */
  private addProductCategoryData(id: string, name: string, order: number, isActive: boolean): Result {
    const categories = this.getStorageCategoriesMap();
    const existing = [...categories.values()].find((c) => c.name === name);
    if (existing) return Result.Failure([ProductCategoryErrors.NameExists]);

    const newCategory: ProductCategory = { id, name, isActive, order };
    this.updateCategoriesOrder(categories, order);
    newCategory.order = order;
    categories.set(newCategory.id, newCategory);
    this.repo.save(this.storeId, categories);
    return Result.Success();
  }

  /** 1:1 port of Angular `addProductCategory` (repo.ts:90-92). */
  addProductCategory(name: string, order: number, isActive: boolean): Result {
    return this.addProductCategoryData(generateId(), name, order, isActive);
  }

  /**
   * 1:1 port of Angular `addProductCategoryByName` (repo.ts:94-98) — generated id, next order
   * via private `getNextOrder`, always `isActive: true`. Returns the new id or `null`.
   */
  addProductCategoryByName(name: string): string | null {
    const id = generateId();
    const order = this.getNextOrder();
    const result = this.addProductCategoryData(id, name, order, true);
    return result.succeeded ? id : null;
  }

  /** Private port of Angular `getNextOrder` (repo.ts:100-103). */
  private getNextOrder(): number {
    const categories = this.getProductCategories();
    return Math.max(0, ...categories.map((c) => c.order)) + 1;
  }

  /** 1:1 port of Angular `addImportedProductCategory` (repo.ts:105-107). */
  addImportedProductCategory(category: ProductCategory): Result {
    return this.addProductCategoryData(category.id, category.name, category.order, category.isActive);
  }

  /** Private port of Angular `updateCategoriesOrder` (repo.ts:109-115). */
  private updateCategoriesOrder(categories: Map<string, ProductCategory>, order: number): void {
    categories.forEach((category) => {
      if (category.order >= order) category.order = category.order + 1;
    });
  }

  /** 1:1 port of Angular `updateImportedProductCategory` (repo.ts:117-119). */
  updateImportedProductCategory(category: ProductCategory): Result {
    return this.updateProductCategory(category.id, category.name, category.order, category.isActive);
  }

  /**
   * 1:1 port of Angular `updateProductCategory` (repo.ts:121-137) — not-found fails; name-collision
   * excluding self fails; success updates + same order-shift-then-reassign (redundant
   * double-assign, mirror do-not-simplify, matches Angular lines 130/134).
   */
  updateProductCategory(id: string, name: string, order: number, isActive: boolean): Result {
    const categories = this.getStorageCategoriesMap();
    const category = categories.get(id);
    if (!category) return Result.Failure([ProductCategoryErrors.NotExists]);

    const otherWithSameName = [...categories.values()].find((c) => c.name === name && c.id !== id);
    if (otherWithSameName) return Result.Failure([ProductCategoryErrors.NameExists]);

    category.order = order;
    category.name = name;
    category.isActive = isActive;
    this.updateCategoriesOrder(categories, order);
    category.order = order;
    this.repo.save(this.storeId, categories);
    return Result.Success();
  }

  /** Private port of Angular `updateProductCategoryActive` (repo.ts:139-148). */
  private updateProductCategoryActive(id: string, isActive: boolean): Result {
    const categories = this.getStorageCategoriesMap();
    const category = categories.get(id);
    if (!category) return Result.Failure([ProductCategoryErrors.NotExists]);

    category.isActive = isActive;
    this.repo.save(this.storeId, categories);
    return Result.Success();
  }

  /**
   * 1-param (dead-param fix per angular-bugs-policy — see class doc). 1:1 port of Angular
   * `activateProductCategory` behavior (repo.ts:150-152), minus the unread `isActive` param.
   */
  activateProductCategory(id: string): Result {
    return this.updateProductCategoryActive(id, true);
  }

  /** 1-param (dead-param fix). 1:1 port of Angular `deactivateProductCategory` behavior (repo.ts:154-156). */
  deactivateProductCategory(id: string): Result {
    return this.updateProductCategoryActive(id, false);
  }

  /** 1:1 port of Angular `updateCategories` (repo.ts:29-32). */
  updateCategories(categoriesMap: Map<string, ProductCategory>): void {
    this.repo.save(this.storeId, categoriesMap);
  }

  /** 1:1 port of Angular `setInitCategories` (repo.ts:34-38). */
  setInitCategories(categoriesMap: Map<string, ProductCategory>): void {
    const current = this.getStorageCategoriesMap();
    if (current.size === 0) this.repo.save(this.storeId, categoriesMap);
  }

  /** 1:1 port of Angular `getCategoriesJson` (repo.ts:172-174). */
  getCategoriesJson(): string | null {
    return localStorage.getItem(`lizoft.store-product-categories-${this.storeId}`);
  }
}
