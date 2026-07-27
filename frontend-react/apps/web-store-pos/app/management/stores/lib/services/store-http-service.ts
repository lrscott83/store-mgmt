import type {
  BaseResponseModel,
  Store,
  Module,
  Owner,
  StoreToCollect,
  ReSellerCommission,
} from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

interface CreateStorePayload {
  ownerId: string;
  name: string;
  address: string;
  description: string;
  approved: boolean;
  moduleIds: number[];
}

interface UpdateStorePayload {
  id: string;
  name: string;
  address: string;
  description: string;
  approved: boolean;
  paymentStartDate: string;
  moduleIds: number[];
  isActive: boolean;
}

export const storeHttpService = {
  async listStores(): Promise<BaseResponseModel<Store[]>> {
    const response = await apiClient.get<BaseResponseModel<Store[]>>(
      '/v1/stores/by-current-user'
    );
    return response.data;
  },

  async getStore(id: string): Promise<BaseResponseModel<Store>> {
    const response = await apiClient.get<BaseResponseModel<Store>>(
      `/v1/stores/${id}`
    );
    return response.data;
  },

  async createStore(payload: CreateStorePayload): Promise<BaseResponseModel<Store>> {
    const response = await apiClient.post<BaseResponseModel<Store>>(
      '/v1/stores',
      payload
    );
    return response.data;
  },

  async updateStore(id: string, payload: UpdateStorePayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      `/v1/stores/${id}`,
      payload
    );
    return response.data;
  },

  async activateStore(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      '/v1/stores/activate',
      { id }
    );
    return response.data;
  },

  async approveStore(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      '/v1/stores/approve',
      { id }
    );
    return response.data;
  },

  async disapproveStore(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      '/v1/stores/disapprove',
      { id }
    );
    return response.data;
  },

  async getModulesToStore(): Promise<BaseResponseModel<Module[]>> {
    const response = await apiClient.get<BaseResponseModel<Module[]>>(
      '/v1/modules/ToStore'
    );
    return response.data;
  },

  async listOwners(): Promise<BaseResponseModel<Owner[]>> {
    const response = await apiClient.get<BaseResponseModel<Owner[]>>(
      '/v1/owners/all/true'
    );
    return response.data;
  },

  async getStoresToCollect(): Promise<BaseResponseModel<StoreToCollect[]>> {
    const response = await apiClient.get<BaseResponseModel<StoreToCollect[]>>(
      '/v1/stores/to-collect'
    );
    return response.data;
  },

  async registerStorePayment(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      `/v1/stores/${id}/payments`
    );
    return response.data;
  },

  async getReSellerCommissions(): Promise<BaseResponseModel<ReSellerCommission[]>> {
    const response = await apiClient.get<BaseResponseModel<ReSellerCommission[]>>(
      '/v1/stores/reseller-commissions'
    );
    return response.data;
  },
};
