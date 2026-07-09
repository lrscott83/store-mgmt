import type { Product, ProductSelectView } from '../models/product';
import type { CsvProduct } from '../models/csv-product';
import type { BaseResponseModel } from '../models/base';

/**
 * ProductService — React mirror of Angular's abstract `ProductService`
 * (domain/interfaces/product.service.ts) — Exact-Surface Rule
 * (openspec/changes/product-service-parity/spec.md "Service Method Signature
 * Parity"). Angular's abstract surface is exactly 12 methods, all category C
 * (`Promise<BaseResponseModel<T>>`, resolve-never-reject):
 * `hasAnyAvailableToSaleProduct`, `getProductById`, `getProductByBarcode`,
 * `getProductsToSelect`, `getAvailableProductsByCategoryId`, `deleteProduct`,
 * `createCsvProducts`, `getProductsToSaleByCategoryId`, `createProduct` (9
 * args), `updateProduct` (10 args), `getMaxOrder(categoryId)`,
 * `createProducts(categoryId, items)`. The React-only members
 * `getByName`/`activate`/`deactivate` have no Angular SERVICE correlate
 * (Angular exposes the equivalents on the REPOSITORY only) and are REMOVED,
 * unconditionally, no grace period.
 *
 * `extends BaseService<Product>` (hence `getAll`/`getById`/`delete`) plus the
 * legacy sync `getByBarcode`/`update` members have been DROPPED (Phase 2 step
 * 8's cross-cutting cleanup, design.md's Decision section, ratified precedent
 * from Slice 5's Flag #1) — the interface is now standalone, exactly these 12
 * async methods, no supertype.
 */
export interface ProductService {
  hasAnyAvailableToSaleProduct(): Promise<BaseResponseModel<boolean>>;
  getProductById(id: string): Promise<BaseResponseModel<Product>>;
  getProductByBarcode(barcode: string): Promise<BaseResponseModel<Product>>;
  getProductsToSelect(): Promise<BaseResponseModel<ProductSelectView[]>>;
  getAvailableProductsByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>>;
  deleteProduct(id: string): Promise<BaseResponseModel<boolean>>;
  createCsvProducts(csvProducts: CsvProduct[]): Promise<BaseResponseModel<boolean>>;

  getProductsToSaleByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>>;

  createProduct(
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
  ): Promise<BaseResponseModel<boolean>>;

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
  ): Promise<BaseResponseModel<boolean>>;

  getMaxOrder(categoryId: string): Promise<BaseResponseModel<number>>;
  createProducts(categoryId: string, items: { name: string; price: number }[]): Promise<BaseResponseModel<boolean>>;
}
