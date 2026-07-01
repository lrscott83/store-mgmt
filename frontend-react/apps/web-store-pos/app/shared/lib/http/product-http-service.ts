import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from './api-client';

export const productHttpService = {
  async hasAnyAvailableToSaleProduct(): Promise<boolean> {
    const response = await apiClient.get<BaseResponseModel<boolean>>(
      '/v1/Products/hasAnyAvailableToSaleProduct'
    );
    return response.data.data;
  },
};
