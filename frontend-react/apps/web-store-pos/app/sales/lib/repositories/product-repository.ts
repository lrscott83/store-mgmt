import type { Product } from '@store-mgmt/domain';
import { ProductCategoryErrors, ProductErrors, Result } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { ProductCategoryRepository } from './product-category-repository';

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * ProductRepository — React mirror of Angular's
 * `frontend/src/app/application/products/product.repository.ts` — EXACT public surface
 * (no `upsert`/`remove`; those are forbidden bridges per the Exact-Surface Rule).
 *
 * Depends on `ProductCategoryRepository` (Angular repo.ts:21-23 injects it via DI,
 * a REQUIRED constructor param — no default). React mirrors this exactly: the
 * `categoryRepository` param is MANDATORY (Phase 2 step 9 — retired the Phase-1 temporary
 * optional-with-default divergence). Every call site now constructs its own
 * `new ProductCategoryRepository(storeId)` explicitly, reproducing the old default's
 * runtime behavior byte-for-byte (zero behavior change, signature-only tightening).
 *
 * Persistence is inlined (no shared `BaseRepository<T>` — that base class has no Angular
 * correlate, playbook rule 12): per-instance cache (`products`/`lastProductsKey`), reloaded
 * only when empty or the store key changes, auto-init on empty read, Map-entries wire
 * format, and NO date revival — 1:1 port of `product.repository.ts:36-40,287-499`.
 */
export class ProductRepository {
  private readonly categoryRepository: ProductCategoryRepository;

  private products: Map<string, Product> | null = null;
  private lastProductsKey: string | undefined;

  constructor(
    private readonly storeId: string,
    categoryRepository: ProductCategoryRepository,
  ) {
    this.categoryRepository = categoryRepository;
  }

  /**
   * Fase 4 (inventory-offline-service-parity, GATE-B, rule-12 minimal accessor): surfaces the
   * already-injected `ProductCategoryRepository` so `InventoryOfflineService` can source category
   * names for `getInventoryCategoriesView()` the same way Angular does
   * (`categoryRepository.getStorageCategoriesMap()`, inventory-offline.service.ts:288) — without
   * adding a THIRD top-level DI param to `InventoryOfflineService` (which still only takes
   * `storeId` + `productRepository`, mirroring Angular's constructor) or constructing a second,
   * divergent `ProductCategoryRepository` instance. One-line passthrough, no new behavior.
   */
  getCategoryRepository(): ProductCategoryRepository {
    return this.categoryRepository;
  }

  /** 1:1 port of Angular `getStorageProductsMap` (product.repository.ts:36-40). */
  getStorageProductsMap(): Map<string, Product> {
    if (!this.products || this.products.size === 0 || this.getCurrentStorageKey() !== this.lastProductsKey) {
      this.products = this.getProductsFromLocalStorage();
    }
    return this.products;
  }

  private getStorageProducts(): Product[] {
    return [...this.getStorageProductsMap().values()];
  }

  /** 1:1 port of Angular `getAvailableProducts` (product.repository.ts:46-48) — isActive-only, unsorted. */
  getAvailableProducts(): Product[] {
    return this.getStorageProducts().filter((p) => p.isActive);
  }

  /**
   * 1:1 port of Angular `getProductById` (product.repository.ts:55-57) — plain sync,
   * returns the product or `undefined` when absent (Angular returns the raw Map lookup,
   * which is `undefined` for a missing key).
   */
  getProductById(id: string): Product | undefined {
    return this.getStorageProductsMap().get(id);
  }

  /**
   * 1:1 port of Angular `getAvailableProductById` (product.repository.ts:50-53): returns
   * the product only when it exists AND `isActive`, else `null` — mirrors Angular exactly,
   * matching sibling methods `getProductByName`/`getProductByBarcode`.
   */
  getAvailableProductById(id: string): Product | null {
    const product = this.getStorageProductsMap().get(id);
    return product && product.isActive ? product : null;
  }

  /** 1:1 port of Angular `getProductByName` (product.repository.ts:59-61) — returns `null` (Angular parity). */
  getProductByName(name: string): Product | null {
    return this.getStorageProducts().find((p) => p.name === name) ?? null;
  }

  /** 1:1 port of Angular `getProductByBarcode` (product.repository.ts:63-66) — empty barcode -> `null`. */
  getProductByBarcode(barcode: string): Product | null {
    if (!barcode) return null;
    return this.getStorageProducts().find((p) => p.barcode === barcode) ?? null;
  }

  /** 1:1 port of Angular `hasAnyProduct` (product.repository.ts:68-70). */
  hasAnyProduct(): boolean {
    return this.getStorageProductsMap().size > 0;
  }

  /** 1:1 port of Angular `getProductsByCategoryId` (product.repository.ts:72-76) — sorted by order. */
  getProductsByCategoryId(categoryId: string): Product[] {
    return this.getStorageProducts()
      .filter((p) => p.categoryId === categoryId)
      .sort((p1, p2) => p1.order - p2.order);
  }

  /**
   * 1:1 port of Angular `getAvailableToSaleProductsByCategoryId` (product.repository.ts:78-82) —
   * `isActive && availableToSale`, sorted by order.
   */
  getAvailableToSaleProductsByCategoryId(categoryId: string): Product[] {
    return this.getStorageProducts()
      .filter((p) => p.categoryId === categoryId && p.isActive && p.availableToSale)
      .sort((p1, p2) => p1.order - p2.order);
  }

  /**
   * 1:1 port of Angular `hasAnyAvailableToSaleProduct` (product.repository.ts:84-86) —
   * delegates to `categoryRepository.hasAnyAvailableCategory()` AND at least one product
   * with `isActive && availableToSale`.
   */
  hasAnyAvailableToSaleProduct(): boolean {
    return (
      this.categoryRepository.hasAnyAvailableCategory() &&
      this.getStorageProducts().some((p) => p.isActive && p.availableToSale)
    );
  }

  /**
   * 1:1 port of Angular `deleteProduct` (product.repository.ts:88-98) — soft-delete:
   * `isActive=false` + stamps `updatedDate`/`updatedByName`, returns `true`. Missing id
   * returns `false` without throwing.
   */
  deleteProduct(id: string): boolean {
    const products = this.getStorageProductsMap();
    const product = products.get(id);
    if (!product) return false;

    product.isActive = false;
    product.updatedDate = new Date();
    product.updatedByName = getCurrentUserLogin();
    this.setProductsLocalStorage(products);
    return true;
  }

  /**
   * 1:1 port of Angular `addProductData` (product.repository.ts:100-146) — category-exists
   * fails `ProductCategoryErrors.NotExists`; barcode-uniqueness fails
   * `ProductErrors.BarcodeExists`; name-uniqueness-per-category fails
   * `ProductErrors.NameExists`; else creates + order-shift (`updateProductsOrderByCategory`)
   * + reassigns own order (redundant double-assign — mirror do-not-simplify, matches
   * Angular lines 141-142).
   */
  addProductData(
    id: string,
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
  ): Result {
    const category = this.categoryRepository.getProductCategoryById(categoryId);
    if (!category) return Result.Failure([ProductCategoryErrors.NotExists]);

    if (barcode) {
      const existingProduct = this.getProductByBarcode(barcode);
      if (existingProduct) return Result.Failure([ProductErrors.BarcodeExists]);
    }

    const nameCollision = this.getStorageProducts().find((p) => p.categoryId === categoryId && p.name === name);
    if (nameCollision) return Result.Failure([ProductErrors.NameExists]);

    const products = this.getStorageProductsMap();
    const newProduct: Product = {
      id,
      name,
      barcode,
      categoryId,
      categoryName: category.name,
      price,
      businessId,
      isActive,
      createdDate: new Date(),
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
      order,
      availableToSale,
      discountFromInvantory,
    };
    this.updateProductsOrderByCategory(products, categoryId, order);
    newProduct.order = order;
    products.set(newProduct.id, newProduct);
    this.setProductsLocalStorage(products);
    return Result.Success();
  }

  /** 1:1 port of Angular `addProduct` (product.repository.ts:148-171) — generated id. */
  addProduct(
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
  ): Result {
    return this.addProductData(
      generateId(),
      categoryId,
      name,
      price,
      businessId,
      order,
      isActive,
      availableToSale,
      discountFromInvantory,
      barcode,
    );
  }

  /** 1:1 port of Angular `addImportedProduct` (product.repository.ts:173-185). */
  addImportedProduct(product: Product): Result {
    return this.addProductData(
      product.id,
      product.categoryId,
      product.name,
      product.price,
      product.businessId,
      product.order,
      product.isActive,
      product.availableToSale,
      product.discountFromInvantory,
    );
  }

  /** Private port of Angular `updateProductsOrderByCategory` (product.repository.ts:187-191). */
  private updateProductsOrderByCategory(products: Map<string, Product>, categoryId: string, order: number): void {
    products.forEach((product) => {
      if (product.categoryId === categoryId && product.order >= order) product.order = product.order + 1;
    });
  }

  /**
   * 1:1 port of Angular `updateProduct` (product.repository.ts:193-242) — category-exists
   * fails; not-found fails `ProductErrors.NotExists`; barcode-uniqueness excluding self;
   * name-uniqueness excluding self; success updates all fields + same
   * order-shift-then-reassign (redundant double-assign, mirror do-not-simplify, matches
   * Angular lines 237-238).
   */
  updateProduct(
    id: string,
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
    updatedDate: Date = new Date(),
    updatedByName: string = getCurrentUserLogin(),
  ): Result {
    const category = this.categoryRepository.getProductCategoryById(categoryId);
    if (!category) return Result.Failure([ProductCategoryErrors.NotExists]);

    const products = this.getStorageProductsMap();
    const product = products.get(id);
    if (!product) return Result.Failure([ProductErrors.NotExists]);

    if (barcode && barcode !== product.barcode) {
      const existingProduct = this.getProductByBarcode(barcode);
      if (existingProduct && existingProduct.id !== id) {
        return Result.Failure([ProductErrors.BarcodeExists]);
      }
    }

    const otherProductWithSameName = [...products.values()].find(
      (p) => p.categoryId === categoryId && p.name === name && p.id !== id,
    );
    if (otherProductWithSameName) return Result.Failure([ProductErrors.NameExists]);

    product.order = order;
    product.businessId = businessId;
    product.categoryId = categoryId;
    product.categoryName = category.name;
    product.price = price;
    product.name = name;
    product.barcode = barcode;
    product.isActive = isActive;
    product.availableToSale = availableToSale;
    product.discountFromInvantory = discountFromInvantory;
    product.updatedDate = updatedDate;
    product.updatedByName = updatedByName;

    this.updateProductsOrderByCategory(products, categoryId, order);
    product.order = order;

    this.setProductsLocalStorage(products);
    return Result.Success();
  }

  /** 1:1 port of Angular `updateImportedProduct` (product.repository.ts:244-259). */
  updateImportedProduct(product: Product): Result {
    return this.updateProduct(
      product.id,
      product.categoryId,
      product.name,
      product.price,
      product.businessId,
      product.order,
      product.isActive,
      product.availableToSale,
      product.discountFromInvantory,
      product.barcode,
      product.updatedDate,
      product.updatedByName,
    );
  }

  /**
   * 1:1 port of Angular `setDiscountFromInvantory` (product.repository.ts:261-268) — only
   * that flag, no audit stamps. Missing id fails `ProductErrors.NotExists`.
   */
  setDiscountFromInvantory(id: string, discountFromInvantory: boolean): Result {
    const products = this.getStorageProductsMap();
    const product = products.get(id);
    if (!product) return Result.Failure([ProductErrors.NotExists]);

    product.discountFromInvantory = discountFromInvantory;
    this.setProductsLocalStorage(products);
    return Result.Success();
  }

  /** Private port of Angular `updateProductActive` (product.repository.ts:270-277). */
  private updateProductActive(id: string, isActive: boolean): Result {
    const products = this.getStorageProductsMap();
    const product = products.get(id);
    if (!product) return Result.Failure([ProductErrors.NotExists]);

    product.isActive = isActive;
    this.setProductsLocalStorage(products);
    return Result.Success();
  }

  /**
   * Repository-only (NOT service-exposed, spec.md "Repository-Only Activate/Deactivate").
   * 1:1 port of Angular `activateProduct` (product.repository.ts:279-281).
   */
  activateProduct(id: string): Result {
    return this.updateProductActive(id, true);
  }

  /** Repository-only. 1:1 port of Angular `deactivateProduct` (product.repository.ts:283-285). */
  deactivateProduct(id: string): Result {
    return this.updateProductActive(id, false);
  }

  /** 1:1 port of Angular `updateProducts` (product.repository.ts:26-29). */
  updateProducts(productsMap: Map<string, Product>): void {
    this.setProductsLocalStorage(productsMap);
    this.products = this.getProductsFromLocalStorage();
  }

  /** 1:1 port of Angular `setInitProducts` (product.repository.ts:31-34). */
  setInitProducts(productsMap: Map<string, Product>): void {
    const current = this.getStorageProductsMap();
    if (current.size === 0) this.setProductsLocalStorage(productsMap);
  }

  /**
   * 1:1 port of Angular `getProductsJson` (product.repository.ts:301-303). At-rest
   * encryption seam: decrypted immediately at the `getItem` boundary (design's uniform
   * seam rule) — this raw getter is used by the sync export path, so plaintext must come
   * back out even when the entity is stored as ciphertext.
   */
  getProductsJson(): string | null {
    return decryptEntity(localStorage.getItem(this.getStorageKey()));
  }

  /**
   * Private port of Angular `setProductsLocalStorage` (product.repository.ts:287-290) —
   * Map-entries write. At-rest encryption seam: encrypted immediately after
   * `JSON.stringify`, before `setItem`.
   */
  private setProductsLocalStorage(products: Map<string, Product>): void {
    const productMapJson = JSON.stringify(Array.from(products.entries()));
    localStorage.setItem(this.getStorageKey(), encryptEntity(productMapJson));
  }

  /** Private port of Angular `getStorageKey` (product.repository.ts:292-295) — records the last-used key. */
  private getStorageKey(): string {
    this.lastProductsKey = this.getCurrentStorageKey();
    return this.lastProductsKey;
  }

  /** Private port of Angular `getCurrentStorageKey` (product.repository.ts:297-299). */
  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('products', this.storeId);
  }

  /**
   * Private port of Angular `getProductsFromLocalStorage` (product.repository.ts:305-320) —
   * on empty/missing/unparsable storage, auto-initializes by writing an empty Map before
   * returning it. NO date revival (Angular revives no dates here).
   */
  private getProductsFromLocalStorage(): Map<string, Product> {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json && json !== '{}' ? new Map<string, Product>(JSON.parse(json)) : null,
    );
    if (stored) return stored;

    const products = new Map<string, Product>();
    this.setProductsLocalStorage(products);
    return products;
  }
}
