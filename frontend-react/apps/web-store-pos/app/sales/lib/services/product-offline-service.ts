import type { BaseResponseModel, CsvProduct, Product, ProductService, ProductSelectView } from '@store-mgmt/domain';
import { failure, ProductErrors, success } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { ProductRepository } from '../repositories/product-repository';
import { ProductCategoryRepository } from '../repositories/product-category-repository';

const repo = new BaseRepository<Product>('products', ['createdDate', 'updatedDate']);

function generateId(): string {
  return crypto.randomUUID();
}

type CreateProductInput = Omit<
  Product,
  'id' | 'createdDate' | 'createdByName' | 'updatedDate' | 'updatedByName'
> & { id?: string };

/**
 * ProductOfflineService — React mirror of Angular's
 * `application/products/product-offline.service.ts`. Being reconciled (Phase
 * 2, slice 6) to Angular's exact 12-method async surface plus the two
 * offline-only public extras (`setDiscountFromInvantory`,
 * `getProductsByCategoryId`), delegating persistence to `ProductRepository`
 * (and, for `getProductsToSelect`'s category grouping,
 * `ProductCategoryRepository`) — all category C
 * (`Promise<BaseResponseModel<T>>`, resolve-never-reject).
 *
 * The legacy sync surface (`create`/`update`/`updateMany`/`delete`/`search`/
 * `getByName`/`getMaxOrder`(sync)/`getAvailableProductsByCategoryId`(sync)/
 * `activate`/`deactivate`, still backed by the module-level `repo`)
 * intentionally STAYS alive through WU2 — `extends BaseService<Product>` plus
 * `getByBarcode`/`update` are kept per Flag #1 (dropped in Phase 2 step 8);
 * `getMaxOrder`/`getAvailableProductsByCategoryId` are flipped to async and
 * `search`/`updateMany`/`getByName`/`activate`/`deactivate` are removed in
 * WU3, matching the domain interface's WU1 change (Slice 5 precedent: interface
 * flips land ahead of the concrete class's own flip commit).
 */
export class ProductOfflineService implements ProductService {
  private readonly productRepository: ProductRepository;
  private readonly categoryRepository: ProductCategoryRepository;

  constructor(
    private readonly storeId: string,
    productRepository?: ProductRepository,
    categoryRepository?: ProductCategoryRepository,
  ) {
    this.productRepository = productRepository ?? new ProductRepository(storeId);
    this.categoryRepository = categoryRepository ?? new ProductCategoryRepository(storeId);
  }

  getAll(): Product[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getById(id: string): Product | undefined {
    return repo.getById(this.storeId, id);
  }

  getByBarcode(barcode: string): Product | undefined {
    if (!barcode) return undefined;
    return this.getAll().find((p) => p.barcode === barcode);
  }

  create(data: CreateProductInput): Product {
    const product: Product = {
      ...data,
      id: data.id ?? generateId(),
      createdDate: new Date(),
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };
    repo.upsert(this.storeId, product);
    return product;
  }

  update(product: Product): Product {
    const updated: Product = {
      ...product,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  delete(id: string): void {
    // Angular parity (ADR-3): deleteProduct soft-deletes — sets isActive=false,
    // updatedDate/updatedByName, keeps the record (audit trail, sync contract).
    // No-op for a missing id, matching the prior hard-delete's no-op behavior.
    const existing = repo.getById(this.storeId, id);
    if (!existing) return;
    repo.upsert(this.storeId, {
      ...existing,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    });
  }

  /** 1:1 port of Angular `getMaxOrder` (product-offline.service.ts:159-162) — async, delegates repo. */
  async getMaxOrder(categoryId: string): Promise<BaseResponseModel<number>> {
    const products = this.productRepository.getProductsByCategoryId(categoryId);
    return success(Math.max(...products.map((p) => p.order), 0));
  }

  /** 1:1 port of Angular `getAvailableProductsByCategoryId` (product-offline.service.ts:123-126) — async, isActive-only. */
  async getAvailableProductsByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    const products = this.productRepository.getProductsByCategoryId(categoryId);
    return success(products.filter((p) => p.isActive));
  }

  /** 1:1 port of Angular `hasAnyAvailableToSaleProduct` (product-offline.service.ts:25-27) — never fails. */
  async hasAnyAvailableToSaleProduct(): Promise<BaseResponseModel<boolean>> {
    return success(this.productRepository.hasAnyAvailableToSaleProduct());
  }

  /** 1:1 port of Angular `getProductById` (product-offline.service.ts:29-32) — async. */
  async getProductById(id: string): Promise<BaseResponseModel<Product>> {
    const product = this.productRepository.getProductById(id);
    return product ? success(product) : failure([ProductErrors.NotExists]);
  }

  /** 1:1 port of Angular `getProductByBarcode` (product-offline.service.ts:34-37) — async. */
  async getProductByBarcode(barcode: string): Promise<BaseResponseModel<Product>> {
    const product = this.productRepository.getProductByBarcode(barcode);
    return product ? success(product) : failure([ProductErrors.NotExists]);
  }

  /** 1:1 port of Angular `deleteProduct` (product-offline.service.ts:169-171) — never fails. */
  async deleteProduct(id: string): Promise<BaseResponseModel<boolean>> {
    return success(this.productRepository.deleteProduct(id));
  }

  /**
   * 1:1 port of Angular `getProductsToSaleByCategoryId` (product-offline.service.ts:128-131) —
   * mirrors the REDUNDANT second `.filter(p => p.availableToSale)` on top of the repository's
   * already-filtered result (ANGULAR-BUG-SUSPECT #3, do not simplify).
   */
  async getProductsToSaleByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    const products = this.productRepository.getAvailableToSaleProductsByCategoryId(categoryId);
    return success(products.filter((p) => p.availableToSale));
  }

  /**
   * Offline-only public method (NOT on the abstract interface), 1:1 port of Angular
   * `getProductsByCategoryId` (product-offline.service.ts:118-121) — unfiltered by state, never fails.
   */
  async getProductsByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    const products = this.productRepository.getProductsByCategoryId(categoryId);
    return products ? success(products) : success([]);
  }

  /**
   * Offline-only public method (NOT on the abstract interface), 1:1 port of Angular
   * `setDiscountFromInvantory` (product-offline.service.ts:113-116).
   */
  async setDiscountFromInvantory(id: string, discountFromInvantory: boolean): Promise<BaseResponseModel<boolean>> {
    const result = this.productRepository.setDiscountFromInvantory(id, discountFromInvantory);
    return result.succeeded ? success(true) : failure(result.errors);
  }

  /**
   * 1:1 port of Angular `getProductsToSelect` (product-offline.service.ts:133-157) — groups
   * `productRepository.getAvailableProducts()` by category in
   * `categoryRepository.getProductCategories()` iteration order, sorted by product `order`
   * within each category, mapped to `{ id, fullName: categoryName + ' - ' + name }`. Never fails.
   */
  async getProductsToSelect(): Promise<BaseResponseModel<ProductSelectView[]>> {
    const categories = this.categoryRepository.getProductCategories();
    const categoryProductsMap = new Map<string, Product[]>();
    const products = this.productRepository.getAvailableProducts();
    products.forEach((product) => {
      const existing = categoryProductsMap.get(product.categoryId);
      if (existing) existing.push(product);
      else categoryProductsMap.set(product.categoryId, [product]);
    });
    const productsToSelect: ProductSelectView[] = [];
    categories.forEach((category) => {
      const categoryProducts = categoryProductsMap.get(category.id);
      if (categoryProducts) {
        categoryProducts
          .sort((p1, p2) => p1.order - p2.order)
          .forEach((product) => {
            productsToSelect.push({ id: product.id, fullName: product.categoryName + ' - ' + product.name });
          });
      }
    });
    return success(productsToSelect);
  }

  /** 1:1 port of Angular `createProduct` (product-offline.service.ts:39-62) — delegates `addProduct`. */
  async createProduct(
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
  ): Promise<BaseResponseModel<boolean>> {
    const result = this.productRepository.addProduct(
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
    return result.succeeded ? success(true) : failure(result.errors);
  }

  /** 1:1 port of Angular `updateProduct` (product-offline.service.ts:86-111) — delegates `updateProduct`. */
  async updateProduct(
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
  ): Promise<BaseResponseModel<boolean>> {
    const result = this.productRepository.updateProduct(
      id,
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
    return result.succeeded ? success(true) : failure(result.errors);
  }

  /**
   * 1:1 port of Angular `createProducts` (product-offline.service.ts:64-72) — per-item
   * `getNextOrder` before each `addProduct`, hardcoded `businessId:'', isActive:true,
   * availableToSale:true, discountFromInvantory:true`; `Failure([])` on any failure
   * (ANGULAR-BUG-SUSPECT #1: empty errors array — mirror do-not-fix).
   */
  async createProducts(categoryId: string, items: { name: string; price: number }[]): Promise<BaseResponseModel<boolean>> {
    let hasError = false;
    items.forEach((item) => {
      const order = this.getNextOrder(categoryId);
      const result = this.productRepository.addProduct(categoryId, item.name, item.price, '', order, true, true, true);
      if (!result.succeeded) hasError = true;
    });
    return !hasError ? success(true) : failure([]);
  }

  /**
   * 1:1 port of Angular `createCsvProducts` (product-offline.service.ts:74-84) — per row resolves
   * the category by name (creating it via `addProductCategoryByName` if absent), then
   * `getNextOrder` + `addProduct` with the SAME hardcoded flags as `createProducts`. NO barcode
   * (Flag #2 RATIFIED: Angular's `CsvProduct` is `{category,name,price}`). `Failure([])` on any
   * failure (ANGULAR-BUG-SUSPECT #1).
   */
  async createCsvProducts(csvProducts: CsvProduct[]): Promise<BaseResponseModel<boolean>> {
    let hasError = false;
    csvProducts.forEach((csvProduct) => {
      const category = this.categoryRepository.getProductCategoryByName(csvProduct.category);
      const categoryId = category ? category.id : (this.categoryRepository.addProductCategoryByName(csvProduct.category) as string);
      const order = this.getNextOrder(categoryId);
      const result = this.productRepository.addProduct(categoryId, csvProduct.name, csvProduct.price, '', order, true, true, true);
      if (!result.succeeded) hasError = true;
    });
    return !hasError ? success(true) : failure([]);
  }

  /** Private 1:1 port of Angular `getNextOrder` (product-offline.service.ts:164-167). */
  private getNextOrder(categoryId: string): number {
    const products = this.productRepository.getProductsByCategoryId(categoryId);
    return Math.max(...products.map((p) => p.order), 0) + 1;
  }
}
