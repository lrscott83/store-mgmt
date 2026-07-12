import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';

export const StorageService = {
  setTokenToLocalStorage(token: string): void {
    localStorage.setItem(StorageKeys.TOKEN, token);
  },

  getTokenFromLocalStorage(): string | null {
    return localStorage.getItem(StorageKeys.TOKEN);
  },

  removeTokenFromLocalStorage(): void {
    localStorage.removeItem(StorageKeys.TOKEN);
  },

  setCurrentUser(user: UserModel): void {
    const safeUser: UserModel = { ...user, password: '' };
    localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(safeUser));
  },

  removeCurrentUser(): void {
    localStorage.removeItem(StorageKeys.CURRENT_USER);
  },

  getCurrentUser(): UserModel | null {
    try {
      const raw = localStorage.getItem(StorageKeys.CURRENT_USER);
      if (!raw) return null;
      return JSON.parse(raw) as UserModel;
    } catch {
      return null;
    }
  },
};
