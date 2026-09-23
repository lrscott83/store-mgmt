import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UserModel } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

vi.mock('~/shared/lib/auth/user-home', () => ({
  resolveUserHomePath: vi.fn(),
}));

vi.mock('~/shared/lib/storage/dek-bootstrap', () => ({
  bootstrapDeviceDek: vi.fn(),
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { resolveUserHomePath } from '~/shared/lib/auth/user-home';
import { bootstrapDeviceDek } from '~/shared/lib/storage/dek-bootstrap';
import { clientLoader } from '../wholesale';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'owner@test.com',
    fullName: 'Test Owner',
    cellPhone: '+1234567890',
    email: 'owner@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function setAuthState(user: UserModel | null, logout = vi.fn()) {
  vi.mocked(useAuthStore.getState).mockReturnValue({
    user,
    isAuthenticated: user !== null,
    isLoading: false,
    error: null,
    initialize: vi.fn(),
    getUserByToken: vi.fn(),
    setUser: vi.fn(),
    updateUser: vi.fn(),
    login: vi.fn(),
    loginOffline: vi.fn(),
    logout,
  });
  return logout;
}

describe('wholesale clientLoader (wholesale-superior-vip-only, 2026-09-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUserHomePath).mockResolvedValue('/sales/products');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('solo el módulo 12 (no la feature) permite entrar — un usuario autenticado CON módulo 12 pasa sin redirect', async () => {
    const logout = setAuthState(makeUser({ storeModuleIds: [EModules.WholesaleSales] }));

    const result = await clientLoader();

    expect(result).toBeNull();
    expect(logout).not.toHaveBeenCalled();
    expect(resolveUserHomePath).not.toHaveBeenCalled();
    expect(bootstrapDeviceDek).not.toHaveBeenCalled();
  });

  it('SuperAdmin TAMBIÉN necesita módulo 12 — no hay bypass de rol (a diferencia de featureLoader)', async () => {
    const logout = setAuthState(
      makeUser({
        isSuperAdmin: true,
        isOwnerAdmin: false,
        storeModuleIds: [],
      }),
    );

    const result = await clientLoader();

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('Location')).toBe('/sales/products');
    expect(logout).not.toHaveBeenCalled();
  });

  it('usuario VÁLIDO sin módulo 12: redirige a su home SIN logout (invariante auth-redirect)', async () => {
    const logout = setAuthState(
      makeUser({
        isOwnerAdmin: true,
        storeModuleIds: [],
      }),
    );

    const result = await clientLoader();

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/sales/products');
    expect(logout).not.toHaveBeenCalled();
  });

  it('usuario VÁLIDO sin módulo 12: hace bootstrap del DEK ANTES de resolveUserHomePath (orden diseño §3)', async () => {
    const order: string[] = [];
    vi.mocked(bootstrapDeviceDek).mockImplementation(async () => {
      order.push('dek');
    });
    vi.mocked(resolveUserHomePath).mockImplementation(async () => {
      order.push('home');
      return '/sales/new';
    });
    setAuthState(
      makeUser({
        isOwnerAdmin: true,
        storeModuleIds: [],
      }),
    );

    const result = await clientLoader();

    expect((result as Response).headers.get('Location')).toBe('/sales/new');
    expect(order).toEqual(['dek', 'home']);
  });

  it('usuario NO autenticado: logout + redirect a /login (mismo contrato que authLoader/featureLoader)', async () => {
    const logout = setAuthState(null);

    const result = await clientLoader();

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/login');
    expect(logout).toHaveBeenCalledTimes(1);
    expect(resolveUserHomePath).not.toHaveBeenCalled();
    expect(bootstrapDeviceDek).not.toHaveBeenCalled();
  });
});