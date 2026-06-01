import type { BaseResponseModel, SystemConfiguration } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

export const configurationHttpService = {
  async listConfigurations(): Promise<BaseResponseModel<SystemConfiguration[]>> {
    const response = await apiClient.get<BaseResponseModel<SystemConfiguration[]>>(
      '/v1/configurations'
    );
    return response.data;
  },

  async updateConfigurations(
    configurations: SystemConfiguration[]
  ): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(
      '/v1/configurations',
      configurations
    );
    return response.data;
  },
};
