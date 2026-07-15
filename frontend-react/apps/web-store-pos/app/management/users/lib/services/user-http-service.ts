import type { BaseResponseModel, User } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

interface CreateUserPayload {
  storeId: string;
  fullName: string;
  login: string;
  password: string;
  cellPhone: string;
  email: string;
  roleIds: number[];
}

interface UpdateUserDetailsPayload {
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
}

export const userHttpService = {
  async getUsers(): Promise<BaseResponseModel<User[]>> {
    const response = await apiClient.get<BaseResponseModel<User[]>>(
      '/v1/users/all/true'
    );
    return response.data;
  },

  async getUserById(id: string): Promise<BaseResponseModel<User>> {
    const response = await apiClient.get<BaseResponseModel<User>>(
      `/v1/users/${id}`
    );
    return response.data;
  },

  async createUser(payload: CreateUserPayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      '/v1/storeusers',
      payload
    );
    return response.data;
  },

  async editUser(id: string, payload: UpdateUserDetailsPayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      `/v1/users/${id}`,
      payload
    );
    return response.data;
  },

  async activateUser(id: string, isActive: boolean): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      '/v1/users/activate',
      { id, isActive }
    );
    return response.data;
  },

  async deleteUser(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.delete<BaseResponseModel<boolean>>(
      `/v1/users/${id}`
    );
    return response.data;
  },
};
