import axios from 'axios';
import { StorageKeys } from '../storage/storage-keys';

const API_TIMEOUT = 30000;

export const apiClient = axios.create({
  baseURL: (import.meta.env['API_URL'] as string | undefined) ?? '',
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(StorageKeys.TOKEN);
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem(StorageKeys.TOKEN);
      localStorage.removeItem(StorageKeys.AUTH_MODEL);
      localStorage.removeItem(StorageKeys.CURRENT_USER);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
