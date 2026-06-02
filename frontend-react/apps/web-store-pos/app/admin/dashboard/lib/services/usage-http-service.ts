import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

export interface StoreUsages {
  storeUsagesCountDays: number[];
  activeStoreCount: number;
}

export const usageHttpService = {
  async getStoresLastWeek(): Promise<BaseResponseModel<StoreUsages>> {
    const response = await apiClient.get<BaseResponseModel<StoreUsages>>(
      '/v1/usages/stores-last-week'
    );
    return response.data;
  },

  async getStoresLastMonth(): Promise<BaseResponseModel<StoreUsages>> {
    const response = await apiClient.get<BaseResponseModel<StoreUsages>>(
      '/v1/usages/stores-last-month'
    );
    return response.data;
  },
};
