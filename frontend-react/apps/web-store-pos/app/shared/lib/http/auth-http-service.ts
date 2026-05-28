import type { AuthModel, BaseResponseModel, RegisterRequest } from '@store-mgmt/domain';
import { apiClient } from './api-client';

interface LoginPayload {
  login: string;
  password: string;
}

export const authHttpService = {
  async login(payload: LoginPayload): Promise<BaseResponseModel<AuthModel>> {
    const response = await apiClient.post<BaseResponseModel<AuthModel>>(
      '/v1/auth/login',
      payload
    );
    return response.data;
  },

  async register(payload: RegisterRequest): Promise<BaseResponseModel<void>> {
    const response = await apiClient.post<BaseResponseModel<void>>(
      '/v1/auth/register',
      payload
    );
    return response.data;
  },
};
