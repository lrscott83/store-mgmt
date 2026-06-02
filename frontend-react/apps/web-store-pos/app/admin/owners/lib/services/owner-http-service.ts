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

export const ownerHttpService = {
  async listOwners(): Promise<BaseResponseModel<Owner[]>> {
    const response = await apiClient.get<BaseResponseModel<Owner[]>>(
      '/v1/owners/all/true'
    );
    return response.data;
  },

  async getOwner(id: string): Promise<BaseResponseModel<Owner>> {
    const response = await apiClient.get<BaseResponseModel<Owner>>(
      `/v1/owners/${id}`
    );
    return response.data;
  },

  async createOwner(payload: CreateOwnerPayload): Promise<BaseResponseModel<string>> {
    const response = await apiClient.post<BaseResponseModel<string>>(
      '/v1/owners/',
      payload
    );
    return response.data;
  },

  async updateOwner(id: string, payload: UpdateOwnerPayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      `/v1/owners/${id}`,
      payload
    );
    return response.data;
  },

  async deleteOwner(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.delete<BaseResponseModel<boolean>>(
      `/v1/owners/${id}`
    );
    return response.data;
  },
};
