import type {
  BaseResponseModel,
  Store,
  StorePlan,
  Module,
  Owner,
  OwnerStoreWithPlan,
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
  /**
   * Undefined when there is no date to send (backend only applies a non-null
   * value; an empty string would fail DateOnly binding).
   */
  paymentStartDate?: string;
  /**
   * Optional since the store-data view and the plan view were split: the
   * data-only update omits it (backend leaves the plan untouched), while the
   * plan view sends the full set.
   */
  moduleIds?: number[];
  isActive: boolean;
}

export const storeHttpService = {
  async listStores(): Promise<BaseResponseModel<Store[]>> {
    const response = await apiClient.get<BaseResponseModel<Store[]>>('/v1/stores/by-current-user');
    return response.data;
  },

  /**
   * Owner's "my stores" listing (GET /v1/stores/my-stores): every store the
   * current user owns — active AND inactive — with each store's module price
   * snapshot and the calculated next billing date. Backs the owner's store
   * cards view.
   */
  async getMyStores(): Promise<BaseResponseModel<OwnerStoreWithPlan[]>> {
    const response = await apiClient.get<BaseResponseModel<OwnerStoreWithPlan[]>>(
      '/v1/stores/my-stores',
    );
    return response.data;
  },

  /**
   * Sets a store's IsActive flag (both directions — activate AND deactivate).
   * The owner's lever over their stores; SuperAdmin keeps full reach.
   */
  async setStoreActivation(id: string, isActive: boolean): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(`/v1/stores/${id}/activation`, {
      isActive,
    });
    return response.data;
  },

  async getStore(id: string): Promise<BaseResponseModel<Store>> {
    const response = await apiClient.get<BaseResponseModel<Store>>(`/v1/stores/${id}`);
    return response.data;
  },

  async getStorePlan(id: string): Promise<BaseResponseModel<StorePlan>> {
    const response = await apiClient.get<BaseResponseModel<StorePlan>>(`/v1/stores/${id}/plan`);
    return response.data;
  },

  async createStore(payload: CreateStorePayload): Promise<BaseResponseModel<Store>> {
    const response = await apiClient.post<BaseResponseModel<Store>>('/v1/stores', payload);
    return response.data;
  },

  async updateStore(id: string, payload: UpdateStorePayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(`/v1/stores/${id}`, payload);
    return response.data;
  },

  /**
   * Toggles the store plan between Free and Paid (POST /v1/stores/{id}/toggle-plan,
   * no request body — direction is derived server-side from PaymentStartDate).
   */
  async toggleStorePlan(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      `/v1/stores/${id}/toggle-plan`,
    );
    return response.data;
  },

  async approveStore(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/stores/approve', { id });
    return response.data;
  },

  async disapproveStore(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/stores/disapprove', {
      id,
    });
    return response.data;
  },

  async getModulesToStore(): Promise<BaseResponseModel<Module[]>> {
    const response = await apiClient.get<BaseResponseModel<Module[]>>('/v1/modules/ToStore');
    return response.data;
  },

  async listOwners(): Promise<BaseResponseModel<Owner[]>> {
    const response = await apiClient.get<BaseResponseModel<Owner[]>>('/v1/owners/all/true');
    return response.data;
  },

  async getStoresToCollect(): Promise<BaseResponseModel<StoreToCollect[]>> {
    const response =
      await apiClient.get<BaseResponseModel<StoreToCollect[]>>('/v1/stores/to-collect');
    return response.data;
  },

  async registerStorePayment(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(`/v1/stores/${id}/payments`);
    return response.data;
  },

  async getReSellerCommissions(): Promise<BaseResponseModel<ReSellerCommission[]>> {
    const response = await apiClient.get<BaseResponseModel<ReSellerCommission[]>>(
      '/v1/stores/reseller-commissions',
    );
    return response.data;
  },
};
