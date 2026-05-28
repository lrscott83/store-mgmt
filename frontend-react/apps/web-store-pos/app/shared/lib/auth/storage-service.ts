import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';

export const StorageService = {
  getToken(): string | null {
    return localStorage.getItem(StorageKeys.TOKEN);
  },

  setToken(token: string): void {
    localStorage.setItem(StorageKeys.TOKEN, token);
  },

  removeToken(): void {
    localStorage.removeItem(StorageKeys.TOKEN);
  },

  getUser(): UserModel | null {
    try {
      const raw = localStorage.getItem(StorageKeys.AUTH_MODEL);
      if (!raw) return null;
      return JSON.parse(raw) as UserModel;
    } catch {
      return null;
    }
  },

  setUser(user: UserModel): void {
    const safeUser: UserModel = { ...user, password: '' };
    localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify(safeUser));
    localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(safeUser));
  },

  removeUser(): void {
    localStorage.removeItem(StorageKeys.AUTH_MODEL);
    localStorage.removeItem(StorageKeys.CURRENT_USER);
  },

  setSessionCookie(): void {
    if (typeof document !== 'undefined') {
      document.cookie = 'hasSession=1; path=/; SameSite=Lax';
    }
  },

  clearSessionCookie(): void {
    if (typeof document !== 'undefined') {
      document.cookie = 'hasSession=; Max-Age=0; path=/';
    }
  },

  clear(): void {
    this.removeToken();
    this.removeUser();
    this.clearSessionCookie();
  },
};
