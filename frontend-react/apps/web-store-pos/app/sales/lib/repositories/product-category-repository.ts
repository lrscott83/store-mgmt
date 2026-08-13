import type { ProductCategory } from '@store-mgmt/domain';
import { ProductCategoryErrors, Result } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * ProductCategoryRepository — React mirror of Angular's
 * `frontend/src/app/application/categories/product-category.repository.ts` — EXACT public
 * surface (no `upsert`/`remove`; those are forbidden bridges per the Exact-Surface Rule).
 *
 * `activateProductCategory(id, isActive)`/`deactivateProductCategory(id, isActive)` mirror
 * Angular's literal 2-param signature (repo.ts:150,154) — the SECOND `isActive` parameter is
 * NEVER read by the body (always hardcodes `true`/`false`); this is a DELIBERATE literal mirror
 * of Angular's dead parameter (parity-audit-remediation Slice 2, MAXIMAL-parity decision),
 * overriding the angular-bugs-policy "fix, don't replicate" default for this specific dead param.
 *
 * `addProductCategoryData` (Angular repo.ts:71-88) is PUBLIC, matching Angular's default
 * visibility and spec.md's authoritative surface table (spec.md:77); shared by
 * `addProductCategory`/`addProductCategoryByName`/`addImportedProductCategory`.
 *
 * Persistence is inlined (no shared `BaseRepository<T>` — that base class has no Angular
 * correlate, playbook rule 12): per-instance cache (`categories`/`lastCategoriesKey`),
 * reloaded only when empty or the store key changes, auto-init on empty read, Map-entries
 * wire format — 1:1 port of `product-category.repository.ts:40-45,167-229`.
 */
export class ProductCategoryRepository {
  private categories: Map<string, ProductCategory> | null = null;
  private lastCategoriesKey: string | undefined;

  constructor(private readonly storeId: string) {}

  /** 1:1 port of Angular `getStorageCategoriesMap` (product-category.repository.ts:40-45). */
  getStorageCategoriesMap(): Map<string, ProductCategory> {
    if (
      !this.categories ||
      this.categories.size === 0 ||
      this.getCurrentStorageKey() !== this.lastCategoriesKey
    ) {
      this.categories = this.getProductCategoriesFromLocalStorage();
    }
    return this.categories;
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
   * 1:1 port of Angular `addProductCategoryData` (repo.ts:71-88) — PUBLIC (see class doc).
   * Name-collision fails with NO persistence; else creates + shifts siblings with
   * `order >= order` by `+1`, then reassigns the new category's own order (redundant
   * double-assign — mirror do-not-simplify, matches Angular lines 83-84).
   */
  addProductCategoryData(id: string, name: string, order: number, isActive: boolean): Result {
    const categories = this.getStorageCategoriesMap();
    const existing = [...categories.values()].find((c) => c.name === name);
    if (existing) return Result.Failure([ProductCategoryErrors.NameExists]);

    const newCategory: ProductCategory = { id, name, isActive, order };
    this.updateCategoriesOrder(categories, order);
    newCategory.order = order;
    categories.set(newCategory.id, newCategory);
    this.setProductCategoriesLocalStorage(categories);
    return Result.Success();
  }

  /** 1:1 port of Angular `addProductCategory` (repo.ts:90-92). */
  addProductCategory(name: string, order: number, isActive: boolean): Result {
    return this.addProductCategoryData(generateId(), name, order, isActive);
  }

  /**
   * 1:1 port of Angular `addProductCategoryByName` (repo.ts:94-98) — generated id, next order
   * via private `getNextOrder`, always `isActive: true`. Ratified literal-parity exception to
   * angular-bugs-policy (engram #842 / `repository-parity-fixes` spec delta): ALWAYS returns the
   * generated `id`, even when `addProductCategoryData` fails internally (e.g. name collision) —
   * the `Result` is discarded, exactly matching Angular's always-truthy-Result dead-branch
   * behavior. No call-site in Angular or React branches on a falsy/null result.
   */
  addProductCategoryByName(name: string): string {
    const id = generateId();
    const order = this.getNextOrder();
    this.addProductCategoryData(id, name, order, true);
    return id;
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
    this.setProductCategoriesLocalStorage(categories);
    return Result.Success();
  }

  /** Private port of Angular `updateProductCategoryActive` (repo.ts:139-148). */
  private updateProductCategoryActive(id: string, isActive: boolean): Result {
    const categories = this.getStorageCategoriesMap();
    const category = categories.get(id);
    if (!category) return Result.Failure([ProductCategoryErrors.NotExists]);

    category.isActive = isActive;
    this.setProductCategoriesLocalStorage(categories);
    return Result.Success();
  }

  /**
   * 2-param, Angular-exact (repo.ts:150-152) — the `isActive` argument is inert (see class doc).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activateProductCategory(id: string, isActive: boolean): Result {
    return this.updateProductCategoryActive(id, true);
  }

  /** 2-param, Angular-exact (repo.ts:154-156) — the `isActive` argument is inert (see class doc). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deactivateProductCategory(id: string, isActive: boolean): Result {
    return this.updateProductCategoryActive(id, false);
  }

  /** 1:1 port of Angular `updateCategories` (repo.ts:29-32). */
  updateCategories(categoriesMap: Map<string, ProductCategory>): void {
    this.setProductCategoriesLocalStorage(categoriesMap);
    this.categories = this.getProductCategoriesFromLocalStorage();
  }

  /** 1:1 port of Angular `setInitCategories` (repo.ts:34-38). */
  setInitCategories(categoriesMap: Map<string, ProductCategory>): void {
    const current = this.getStorageCategoriesMap();
    if (current.size === 0) this.setProductCategoriesLocalStorage(categoriesMap);
  }

  /**
   * 1:1 port of Angular `getCategoriesJson` (repo.ts:172-174). At-rest encryption seam:
   * decrypted immediately at the `getItem` boundary.
   */
  getCategoriesJson(): string | null {
    return decryptEntity(localStorage.getItem(this.getStorageKey()));
  }

  /** Private port of Angular `getStorageKey` (repo.ts:158-161) — records the last-used key. */
  private getStorageKey(): string {
    this.lastCategoriesKey = this.getCurrentStorageKey();
    return this.lastCategoriesKey;
  }

  /** Private port of Angular `getCurrentStorageKey` (repo.ts:163-165). */
  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('product-categories', this.storeId);
  }

  /**
   * Private port of Angular `setProductCategoriesLocalStorage` (repo.ts:167-170) —
   * Map-entries write. At-rest encryption seam: encrypted immediately after
   * `JSON.stringify`, before `setItem`.
   */
  private setProductCategoriesLocalStorage(categories: Map<string, ProductCategory>): void {
    const categoryMapJson = JSON.stringify(Array.from(categories.entries()));
    localStorage.setItem(this.getStorageKey(), encryptEntity(categoryMapJson));
  }

  /**
   * Private port of Angular `getProductCategoriesFromLocalStorage` (repo.ts:176-229) —
   * on empty/missing/unparsable storage, auto-initializes by writing an empty Map before
   * returning it.
   */
  private getProductCategoriesFromLocalStorage(): Map<string, ProductCategory> {
    // design D4: an unreadable store propagates and is never written over. The
    // auto-init below survives only for its honest case — no stored value at
    // all, i.e. a genuinely new store.
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json && json !== '{}' ? new Map<string, ProductCategory>(JSON.parse(json)) : null,
    );
    if (stored) return stored;

    const categories = new Map<string, ProductCategory>();
    this.setProductCategoriesLocalStorage(categories);
    return categories;
  }
}
