import type {
  BaseResponseModel,
  CsvImportResult,
  CsvProduct,
  CsvProductCreated,
  Product,
  ProductService,
  ProductSelectView,
} from '@store-mgmt/domain';
import { failure, ProductErrors, success } from '@store-mgmt/domain';
import { ProductRepository } from '../repositories/product-repository';
import { ProductCategoryRepository } from '../repositories/product-category-repository';

// Module-local id generator (same pattern as inventory-offline-service.ts:89,
// order-offline-service.ts:58, expense-offline-service.ts:9,
// sale-credit-offline-service.ts:8, product-repository.ts:8,
// product-category-repository.ts:6). Needed here (ADR-3) because the id must be known BEFORE
// `addProductData` is called, so it can be threaded onto the created row and later addressed by
// an inventory entry.
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * ProductOfflineService — React mirror of Angular's
 * `application/products/product-offline.service.ts`. Reconciled (Phase 2,
 * step 8 cleanup) to Angular's exact 12-method async surface plus the two
 * offline-only public extras (`setDiscountFromInvantory`,
 * `getProductsByCategoryId`), delegating persistence to `ProductRepository`
 * (and, for `getProductsToSelect`'s category grouping,
 * `ProductCategoryRepository`) — all category C
 * (`Promise<BaseResponseModel<T>>`, resolve-never-reject).
 *
 * The legacy sync surface (`getAll`/`getById`/`getByBarcode`/`create`/
 * `update`/`delete`, previously backed by a module-level `BaseRepository`)
 * has been fully retired — every call site was re-expressed against the
 * async surface (Phase 2 step 8, WU7-WU13b) before this removal landed, so
 * no production code depended on it (grep-confirmed at WU4).
 */
export class ProductOfflineService implements ProductService {
  private readonly productRepository: ProductRepository;
  private readonly categoryRepository: ProductCategoryRepository;

  constructor(
    private readonly storeId: string,
    productRepository?: ProductRepository,
    categoryRepository?: ProductCategoryRepository,
  ) {
    this.productRepository = productRepository ?? new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    this.categoryRepository = categoryRepository ?? new ProductCategoryRepository(storeId);
  }

  /** 1:1 port of Angular `getMaxOrder` (product-offline.service.ts:159-162) — async, delegates repo. */
  async getMaxOrder(categoryId: string): Promise<BaseResponseModel<number>> {
    const products = this.productRepository.getProductsByCategoryId(categoryId);
    return success(Math.max(...products.map((p) => p.order), 0));
  }

  /**
   * Catalog product list — ALL products of the category, sorted by `order`.
   *
   * DIVERGES DELIBERATELY from the Angular 1:1 port
   * (`product-offline.service.ts:123-126`, isActive-only). See
   * `openspec/changes/catalog-show-all-and-clear-data/superpowers-design.md` §D1.
   *
   * `ProductsPage`'s `loadData` in `products.tsx` is the sole production
   * consumer, so widening this method reaches no other screen — the sale path
   * and the inventory egress path both go through
   * `getProductsToSaleByCategoryId`, which keeps its
   * `isActive && availableToSale` filter untouched.
   *
   * The name is now inaccurate ("Available" returns everything). Renaming would
   * mean editing `packages/domain`'s `ProductService` interface and
   * `ProductOnlineService` — i.e. leaving the catalog, which this change's scope
   * rule forbids (design §D3).
   */
  async getAvailableProductsByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    return success(this.productRepository.getProductsByCategoryId(categoryId));
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
   * Was a 1:1 port of Angular `createCsvProducts` (product-offline.service.ts:74-84). DIVERGES
   * DELIBERATELY (decisions #2/#3/#13/#15). Unchanged: per-row category resolve-or-create, the
   * hardcoded flags, no barcode, the non-short-circuited forEach. Changed: the id is generated
   * HERE and handed to `addProductData` (instead of `addProduct` generating and discarding it) so
   * the caller can address inventory entries to the created products; the return is a per-row
   * `CsvImportResult` instead of `Success(true)`/`Failure([])`. It ALWAYS resolves `success(...)`
   * — `failure()` hardcodes `data:null` (envelope.ts:19-27) and would destroy the payload — so
   * callers branch on `data.failed.length > 0`, never on `succeeded`. ANGULAR-BUG-SUSPECT #1 is
   * retired for THIS method only; `createProducts` still mirrors it.
   */
  async createCsvProducts(csvProducts: CsvProduct[]): Promise<BaseResponseModel<CsvImportResult>> {
    const created: CsvProductCreated[] = [];
    const failed: CsvProduct[] = [];
    csvProducts.forEach((csvProduct) => {
      const category = this.categoryRepository.getProductCategoryByName(csvProduct.category);
      const categoryId = category ? category.id : this.categoryRepository.addProductCategoryByName(csvProduct.category);
      const order = this.getNextOrder(categoryId);
      const id = generateId();
      const result = this.productRepository.addProductData(
        id,
        categoryId,
        csvProduct.name,
        csvProduct.price,
        '',
        order,
        true,
        true,
        true,
      );
      if (result.succeeded) created.push({ ...csvProduct, id });
      else failed.push(csvProduct);
    });
    return success({ created, failed });
  }

  /** Private 1:1 port of Angular `getNextOrder` (product-offline.service.ts:164-167). */
  private getNextOrder(categoryId: string): number {
    const products = this.productRepository.getProductsByCategoryId(categoryId);
    return Math.max(...products.map((p) => p.order), 0) + 1;
  }
}
