import type {
  AuthModel,
  BaseResponseModel,
  RegisterAuthModel,
  RegisterRequest,
  UserModel,
} from '@store-mgmt/domain';
import { apiClient } from './api-client';
import { SessionRejectedError } from './session-rejected-error';

interface LoginPayload {
  login: string;
  password: string;
}

export { SessionRejectedError } from './session-rejected-error';

export const authHttpService = {
  async login(payload: LoginPayload): Promise<BaseResponseModel<AuthModel>> {
    const response = await apiClient.post<BaseResponseModel<AuthModel>>(
      '/v1/auth/login',
      payload
    );
    return response.data;
  },

  async register(payload: RegisterRequest): Promise<BaseResponseModel<RegisterAuthModel>> {
    const { fullName, login, password, cellPhone, email, storeName, code } = payload;
    const body: Record<string, string> = {
      fullName,
      login,
      password,
      cellPhone,
      email,
      storeName,
    };
    if (code && code.trim() !== '') {
      body.code = code;
    }
    const response = await apiClient.post<BaseResponseModel<RegisterAuthModel>>(
      '/v1/auth/register',
      body
    );
    return response.data;
  },

  async getMe(): Promise<UserModel> {
    const response = await apiClient.get<BaseResponseModel<UserModel>>('/v1/auth/me');
    if (!response.data.succeeded) {
      throw new SessionRejectedError(response.data.errors[0]?.description);
    }
    return response.data.data;
  },
};
