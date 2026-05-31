import type { BaseResponseModel, UserModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

interface UpdateProfilePayload {
  fullName: string;
  cellPhone?: string;
  email?: string;
  isActive: boolean;
}

interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export const profileHttpService = {
  async updateProfile(
    userId: string,
    payload: UpdateProfilePayload
  ): Promise<BaseResponseModel<UserModel>> {
    const response = await apiClient.put<BaseResponseModel<UserModel>>(
      `/v1/users/${userId}`,
      payload
    );
    return response.data;
  },

  async changePassword(
    userId: string,
    payload: ChangePasswordPayload
  ): Promise<BaseResponseModel<void>> {
    const response = await apiClient.post<BaseResponseModel<void>>(
      `/v1/users/change-password/${userId}`,
      payload
    );
    return response.data;
  },
};
