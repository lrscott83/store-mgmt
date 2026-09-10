import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserModel } from '@store-mgmt/domain';

// ─── mocks ────────────────────────────────────────────────────────────────────
// The helper orchestrates four seams; each test exercises one branch of the
// flow documented in docs/plans/2026-09-10-seamless-store-switch-plan.md.

// vi.hoisted: the factories below are hoisted above this module's body, so the
// fns they return must exist before it (the repo's UI tests get away with plain
// consts only because they dereference them inside lazy callbacks).
const mockSetMyStore = vi.hoisted(() => vi.fn());
const mockGetMe = vi.hoisted(() => vi.fn());
const mockRetarget = vi.hoisted(() => vi.fn());
const mockLogout = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());

// Paths are ALIAS-based on purpose: vi.mock matches RESOLVED module ids, and
// relative paths here resolve from __tests__/ (one level deeper than the SUT),
// so `../http/...` would mock a module the SUT never imported.
vi.mock('../auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      logout: mockLogout,
      updateUser: mockUpdateUser,
    }),
  },
}));

vi.mock('~/shared/lib/http/auth-http-service', () => ({
  authHttpService: {
    getMe: mockGetMe,
  },
}));

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    setMyStore: mockSetMyStore,
  },
}));

vi.mock('~/shared/lib/storage/device-dek-table', () => ({
  retargetDeviceWrapStore: mockRetarget,
}));

import { switchToStore } from '../switch-store';

function freshUser(): UserModel {
  return {
    id: 'u1',
    login: 'jperez',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    cellPhone: '+54911',
    isActive: true,
    password: '',
    authToken: 'tok2',
    refreshToken: 'ref',
    expiresIn: Date.now() + 60_000,
    roles: [{ storeId: 's2', storeName: 'Tienda B', moduleId: 14, featureIds: [38] }],
    featureIds: [70],
    storeModuleIds: [14],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's2',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
  } as UserModel;
}

describe('switchToStore — seamless-store-switch flow', () => {
  let mockReload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReload = vi.fn();
    // switch-store only ever calls window.location.reload(); replacing the
    // whole location object keeps jsdom's "not implemented: navigation" out.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: mockReload },
    });
    mockSetMyStore.mockResolvedValue({ succeeded: true, data: true });
    mockGetMe.mockResolvedValue(freshUser());
    mockRetarget.mockReturnValue(true);
  });

  it('persists, refreshes /me, retargets, updates the user and reloads — WITHOUT logging out', async () => {
    await switchToStore('s2');

    expect(mockSetMyStore).toHaveBeenCalledWith('s2');
    expect(mockGetMe).toHaveBeenCalledTimes(1);
    expect(mockRetarget).toHaveBeenCalledWith('s2');
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser.mock.calls[0][0].selectedStoreId).toBe('s2');
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('throws WITHOUT calling getMe when setMyStore answers succeeded:false', async () => {
    mockSetMyStore.mockResolvedValue({ succeeded: false, data: false, message: 'nope' });

    await expect(switchToStore('s2')).rejects.toThrow('STORE_SWITCH_REJECTED');

    expect(mockGetMe).not.toHaveBeenCalled();
    expect(mockRetarget).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('propagates setMyStore network failures untouched', async () => {
    mockSetMyStore.mockRejectedValue(new Error('network down'));

    await expect(switchToStore('s2')).rejects.toThrow('network down');

    expect(mockGetMe).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('logs out (legacy fallback) when getMe fails AFTER the selection persisted', async () => {
    // The selection is already persisted server-side; a stale session whose
    // roles describe the old store must not survive it.
    mockGetMe.mockRejectedValue(new Error('me unavailable'));

    await expect(switchToStore('s2')).resolves.toBeUndefined();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockRetarget).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('logs out (fallback) when this device holds no wrap for the target store', async () => {
    // retargetDeviceWrapStore returns false WITHOUT writing — a reload here
    // would boot the new session with the OLD store's DEK (cross-store split).
    mockRetarget.mockReturnValue(false);

    await expect(switchToStore('s2')).resolves.toBeUndefined();

    expect(mockGetMe).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });
});
