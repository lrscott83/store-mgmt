import type { BaseResponseModel, ProductCategory, ProductCategoryService, ProductCategoryView } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

/**
 * ProductCategoryOnlineService — React mirror of Angular's
 * `application/categories/product-category-online.service.ts`. REFERENCE-ONLY (parity rule 1):
 * it is never validated against a live backend. Each method calls the shared `apiClient` and
 * returns the response envelope verbatim (no client-side mapping/flattening).
 *
 * DELIBERATE CROSS-SIBLING DEVIATION (ratified decision gate DG-1, engram
 * `product-category-online-parity: 2 decision gates ratified`): Angular's
 * `updateProductCategory`/`getMaxOrder` build their URL as `API_URL + '/' + suffix` on a
 * trailing-slash base, producing a literal double slash (e.g. `/v1/ProductCategories//c1`,
 * `/v1/ProductCategories//maxOrder`) — the SAME bug shape as `ProductOnlineService`'s
 * ANGULAR-BUG-SUSPECT #5. `ProductOnlineService` mirrors that bug verbatim; THIS service
 * NORMALIZES it (single slash) instead, per the angular-bugs-policy default (fix with TDD)
 * which the user explicitly chose for this service. Do NOT "fix" `ProductOnlineService` to
 * match, and do NOT "fix" this service back to double-slash — both are intentional, ratified,
 * and independently documented.
 *
 * Does NOT expose `getProductCategories()` — that method is offline-concrete-only (all
 * categories, no Angular abstract-surface correlate) and stays off both the abstract
 * `ProductCategoryService` interface and this online concrete. Its one consumer,
 * `inventory/routes/available.tsx`, is intentionally EXCLUDED from the
 * `createProductCategoryService` factory rewire for this reason — see that file's inline note.
 */
export class ProductCategoryOnlineService implements ProductCategoryService {
  private readonly API_URL = '/v1/ProductCategories/';

  async getAvailableProductCategories(): Promise<BaseResponseModel<ProductCategory[]>> {
    const url = this.API_URL + 'all/false';
    const response = await apiClient.get<BaseResponseModel<ProductCategory[]>>(url);
    return response.data;
  }

  async getProductCategoriesView(): Promise<BaseResponseModel<ProductCategoryView[]>> {
    const url = this.API_URL + 'catalog';
    const response = await apiClient.get<BaseResponseModel<ProductCategoryView[]>>(url);
    return response.data;
  }

  async createProductCategory(
    name: string,
    order: number,
    isActive: boolean,
  ): Promise<BaseResponseModel<boolean>> {
    const createRequest = { name, order, isActive };
    const url = this.API_URL;
    const response = await apiClient.post<BaseResponseModel<boolean>>(url, createRequest);
    return response.data;
  }

  async updateProductCategory(
    id: string,
    name: string,
    order: number,
    isActive: boolean,
  ): Promise<BaseResponseModel<boolean>> {
    const editRequest = { id, name, order, isActive };
    // NORMALIZED (DG-1): single slash, NOT Angular's literal `//`.
    const url = this.API_URL + id;
    const response = await apiClient.put<BaseResponseModel<boolean>>(url, editRequest);
    return response.data;
  }

  async getMaxOrder(): Promise<BaseResponseModel<number>> {
    // NORMALIZED (DG-1): single slash, NOT Angular's literal `//`.
    const url = this.API_URL + 'maxOrder';
    const response = await apiClient.get<BaseResponseModel<number>>(url);
    return response.data;
  }
}
