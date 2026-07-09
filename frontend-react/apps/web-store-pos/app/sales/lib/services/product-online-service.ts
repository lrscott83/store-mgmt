import type {
  BaseResponseModel,
  CsvProduct,
  Product,
  ProductSelectView,
  ProductService,
} from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

/**
 * The 12-method async surface of `ProductService`, minus the sync members the interface still
 * carries during the Flag-#1 coexistence (`getAll`/`getById`/`delete` from `BaseService` +
 * `getByBarcode`/`update`). Angular's `ProductOnlineService` has NO correlate for those five, so
 * literally `implements ProductService` would force inventing throw-stubs with zero Angular
 * correlate (Exact-Surface Rule violation). This local alias is the online/factory contract until
 * Phase 2 step 8 drops the sync members from `ProductService` itself and retires this alias.
 * (Flag C, ratified — domain package untouched.)
 */
export type AsyncProductService = Omit<
  ProductService,
  'getAll' | 'getById' | 'delete' | 'getByBarcode' | 'update'
>;

/**
 * ProductOnlineService — React mirror of Angular's
 * `application/products/product-online.service.ts`. REFERENCE-ONLY (parity rule 1): it is never
 * validated against a live backend. Each method calls the shared `apiClient` with the EXACT URL
 * Angular's `HttpClient` would produce and returns the response envelope verbatim (no client-side
 * mapping — the backend already shapes `BaseResponseModel`).
 *
 * Mirrors Angular's `API_URL = ${apiUrl}/${apiVersion}/Products/` (trailing slash) with the React
 * apiClient base + `/v1/Products/` prefix. ANGULAR-BUG-SUSPECT #5: 8 of 12 methods build their URL
 * as `API_URL + '/' + suffix`, an extra leading slash on top of the trailing one, yielding literal
 * double slashes (e.g. `/v1/Products//toEntry`). Mirrored verbatim, NOT normalized —
 * `getProductByBarcode`/`createCsvProducts`/`createProducts`/`createProduct` are the only clean
 * ones, matching Angular's own inconsistency.
 *
 * `createProduct` accepts `barcode?` for type conformance with `AsyncProductService` but OMITS it
 * from the POST body (ANGULAR-BUG-SUSPECT #4); `updateProduct` DOES send it. No `setDiscountFrom-
 * Invantory`/`getProductsByCategoryId` (offline-only extras, not on Angular's abstract surface).
 */
export class ProductOnlineService implements AsyncProductService {
  private readonly API_URL = '/v1/Products/';

  async hasAnyAvailableToSaleProduct(): Promise<BaseResponseModel<boolean>> {
    const url = this.API_URL + '/hasAnyAvailableToSaleProduct';
    const response = await apiClient.get<BaseResponseModel<boolean>>(url);
    return response.data;
  }

  async getProductById(id: string): Promise<BaseResponseModel<Product>> {
    const url = this.API_URL + '/' + id;
    const response = await apiClient.get<BaseResponseModel<Product>>(url);
    return response.data;
  }

  async getProductByBarcode(barcode: string): Promise<BaseResponseModel<Product>> {
    const url = this.API_URL + 'byBarcode/' + barcode;
    const response = await apiClient.get<BaseResponseModel<Product>>(url);
    return response.data;
  }

  async getProductsToSelect(): Promise<BaseResponseModel<ProductSelectView[]>> {
    const url = this.API_URL + '/toEntry';
    const response = await apiClient.get<BaseResponseModel<ProductSelectView[]>>(url);
    return response.data;
  }

  async getAvailableProductsByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    const url = this.API_URL + '/availableByCategoryId/' + categoryId;
    const response = await apiClient.get<BaseResponseModel<Product[]>>(url);
    return response.data;
  }

  async getProductsToSaleByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    const url = this.API_URL + '/toSaleByCategoryId/' + categoryId;
    const response = await apiClient.get<BaseResponseModel<Product[]>>(url);
    return response.data;
  }

  async deleteProduct(id: string): Promise<BaseResponseModel<boolean>> {
    const url = this.API_URL + '/' + id;
    const response = await apiClient.delete<BaseResponseModel<boolean>>(url);
    return response.data;
  }

  async createCsvProducts(csvProducts: CsvProduct[]): Promise<BaseResponseModel<boolean>> {
    const url = this.API_URL + 'import';
    const response = await apiClient.post<BaseResponseModel<boolean>>(url, { csvProducts });
    return response.data;
  }

  async getMaxOrder(categoryId: string): Promise<BaseResponseModel<number>> {
    const url = this.API_URL + '/maxOrderByCategoryId/' + categoryId;
    const response = await apiClient.get<BaseResponseModel<number>>(url);
    return response.data;
  }

  async createProduct(
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _barcode?: string,
  ): Promise<BaseResponseModel<boolean>> {
    // ANGULAR-BUG-SUSPECT #4: mirrors product-online.service.ts:71-93 — the online createProduct
    // declares no barcode and never puts it in the payload (offline/updateProduct DO send it).
    const createRequest = {
      categoryId,
      name,
      price,
      availableToSale,
      discountFromInvantory,
      order,
      isActive,
      businessId,
    };
    const url = this.API_URL;
    const response = await apiClient.post<BaseResponseModel<boolean>>(url, createRequest);
    return response.data;
  }

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
    const editRequest = {
      id,
      categoryId,
      name,
      price,
      barcode,
      availableToSale,
      discountFromInvantory,
      order,
      isActive,
      businessId,
    };
    const url = this.API_URL + '/' + id;
    const response = await apiClient.put<BaseResponseModel<boolean>>(url, editRequest);
    return response.data;
  }

  async createProducts(
    categoryId: string,
    items: { name: string; price: number }[],
  ): Promise<BaseResponseModel<boolean>> {
    const createRequest = { categoryId, products: items };
    const url = this.API_URL + 'createProducts';
    const response = await apiClient.post<BaseResponseModel<boolean>>(url, createRequest);
    return response.data;
  }
}
