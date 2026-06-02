import type { BaseResponseModel, ReSeller } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

interface CreateResellerPayload {
  fullName: string;
  login: string;
  password: string;
  cellPhone: string;
  email: string;
  description: string;
}

interface UpdateResellerPayload {
  fullName: string;
  cellPhone: string;
  email: string;
  percentDiscountPrice: number;
  discountPrice: number;
  isActive: boolean;
  description: string;
}

export const resellerHttpService = {
  async listResellers(): Promise<BaseResponseModel<ReSeller[]>> {
    const response = await apiClient.get<BaseResponseModel<ReSeller[]>>(
      '/v1/reSellers/all/true'
    );
    return response.data;
  },

  async getReseller(id: string): Promise<BaseResponseModel<ReSeller>> {
    const response = await apiClient.get<BaseResponseModel<ReSeller>>(
      `/v1/reSellers/${id}`
    );
    return response.data;
  },

  async createReseller(payload: CreateResellerPayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      '/v1/reSellers/',
      payload
    );
    return response.data;
  },

  async updateReseller(id: string, payload: UpdateResellerPayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      `/v1/reSellers/${id}`,
      payload
    );
    return response.data;
  },
};
