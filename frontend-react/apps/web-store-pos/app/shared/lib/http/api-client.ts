import axios from 'axios';
import { StorageKeys } from '../storage/storage-keys';
import { StorageService } from '../auth/storage-service';

const API_TIMEOUT = 30000;

export const apiClient = axios.create({
  baseURL: (import.meta.env['API_URL'] as string | undefined) ?? '',
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = StorageService.getTokenFromLocalStorage();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      StorageService.removeTokenFromLocalStorage();
      localStorage.removeItem(StorageKeys.AUTH_MODEL);
      StorageService.removeCurrentUser();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
