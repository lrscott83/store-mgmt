import type { BaseResponseModel, Currency, SalesCommissionType } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

/** Espejo de `Application.Dtos.SalesManagers.ProductSalesCommissionDto`. */
export interface ProductSalesCommissionDto {
  productId: string;
  type: SalesCommissionType;
  value: number;
  currency: Currency;
}

export interface UpsertProductSalesCommissionPayload {
  type: SalesCommissionType;
  value: number;
  currency: Currency;
}

/**
 * Configuración de comisión por producto (T8). Es Owner-only y el backend la gatea por el
 * módulo 21; esta capa solo transporta.
 */
export const salesCommissionHttpService = {
  async list(): Promise<BaseResponseModel<ProductSalesCommissionDto[]>> {
    const response = await apiClient.get<BaseResponseModel<ProductSalesCommissionDto[]>>(
      '/v1/ProductSalesCommissions',
    );
    return response.data;
  },

  async upsert(
    productId: string,
    payload: UpsertProductSalesCommissionPayload,
  ): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      `/v1/ProductSalesCommissions/${encodeURIComponent(productId)}`,
      payload,
    );
    return response.data;
  },

  async remove(productId: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.delete<BaseResponseModel<boolean>>(
      `/v1/ProductSalesCommissions/${encodeURIComponent(productId)}`,
    );
    return response.data;
  },
};
