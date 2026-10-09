import type { BaseResponseModel, Owner } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

interface CreateOwnerPayload {
  fullName: string;
  login: string;
  password: string;
  cellPhone: string;
  email: string;
  description: string;
  reSellerId: string;
  // Required: owner-create now runs the same flow as self-registration, which creates the
  // customer's STORE. Without it the request is rejected 400 (StoreName).
  storeName: string;
}

interface UpdateOwnerPayload {
  fullName: string;
  cellPhone: string;
  email: string;
  guest: boolean;
  isActive: boolean;
  description: string;
  reSellerId: string;
}

/** Per-call knobs for the owner directory read. */
export interface OwnerListRequestOptions {
  /**
   * A background load must not drive the global loading overlay — maps to
   * api-client's `skipLoading`. The messages view loads the owner directory
   * on mount and on focus/online, and flashing the overlay on every pass is
   * exactly what that flag exists to prevent.
   */
  background?: boolean;
}

/** Axios config that turns the global loading overlay off. */
const SKIP_LOADING = { skipLoading: true };

export const ownerHttpService = {
  async listOwners(options?: OwnerListRequestOptions): Promise<BaseResponseModel<Owner[]>> {
    const url = '/v1/owners/all/true';
    // The non-background branch keeps its single-argument call: the existing
    // HTTP-2 assertion pins `get(url)` with no config object.
    const response = options?.background
      ? await apiClient.get<BaseResponseModel<Owner[]>>(url, SKIP_LOADING)
      : await apiClient.get<BaseResponseModel<Owner[]>>(url);
    return response.data;
  },

  async getOwner(id: string): Promise<BaseResponseModel<Owner>> {
    const response = await apiClient.get<BaseResponseModel<Owner>>(`/v1/owners/${id}`);
    return response.data;
  },

  async createOwner(payload: CreateOwnerPayload): Promise<BaseResponseModel<Owner>> {
    const response = await apiClient.post<BaseResponseModel<Owner>>('/v1/owners/', payload);
    return response.data;
  },

  async updateOwner(id: string, payload: UpdateOwnerPayload): Promise<BaseResponseModel<Owner>> {
    const response = await apiClient.put<BaseResponseModel<Owner>>(`/v1/owners/${id}`, payload);
    return response.data;
  },

  async deleteOwner(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.delete<BaseResponseModel<boolean>>(`/v1/owners/${id}`);
    return response.data;
  },
};
