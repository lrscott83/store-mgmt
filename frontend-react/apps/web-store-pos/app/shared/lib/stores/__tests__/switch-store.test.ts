import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserModel } from '@store-mgmt/domain';

// ─── mocks ────────────────────────────────────────────────────────────────────
// The helper orchestrates the v2 switch flow; each test exercises one branch.

// vi.hoisted: the factories below are hoisted above this module's body, so the
// fns they return must exist before it (the repo's UI tests get away with plain
// consts only because they dereference them inside lazy callbacks).
const mockSwitchMyStore = vi.hoisted(() => vi.fn());
const mockGetMe = vi.hoisted(() => vi.fn());
const mockRetarget = vi.hoisted(() => vi.fn());
const mockLogout = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());
const mockUnwrapDekWithDek = vi.hoisted(() => vi.fn());
const mockGetDek = vi.hoisted(() => vi.fn());
const mockGetOrCreateDeviceKey = vi.hoisted(() => vi.fn());
const mockWrapDekForDevice = vi.hoisted(() => vi.fn());
const mockWriteTable = vi.hoisted(() => vi.fn());

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
    switchMyStore: mockSwitchMyStore,
  },
}));

vi.mock('~/shared/lib/storage/device-dek-table', () => ({
  retargetDeviceWrapStore: mockRetarget,
  readDeviceDekTable: mockRetarget, // any table read succeeds in these tests
  writeDeviceDekTable: mockWriteTable,
}));

vi.mock('~/shared/lib/offline/dek-unwrap', () => ({
  unwrapDekWithDek: mockUnwrapDekWithDek,
}));

vi.mock('~/shared/lib/storage/data-key-store', () => ({
  getDek: mockGetDek,
}));

vi.mock('~/shared/lib/storage/device-key-store', () => ({
  getOrCreateDeviceKey: mockGetOrCreateDeviceKey,
}));

vi.mock('~/shared/lib/storage/dek-bootstrap', () => ({
  wrapDekForDevice: mockWrapDekForDevice,
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

const SERVER_WRAP = {
  wrappedDek: 'serverWrappedDek',
  wrapSalt: 'serverWrapSalt',
  wrapIv: 'serverWrapIv',
};

describe('switchToStore — seamless-store-switch v2 flow', () => {
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
    mockSwitchMyStore.mockResolvedValue({
      succeeded: true,
      data: { changed: true, ...SERVER_WRAP },
    });
    mockGetMe.mockResolvedValue(freshUser());
    mockGetDek.mockReturnValue(new Uint8Array(32).fill(7));
    mockUnwrapDekWithDek.mockResolvedValue(new Uint8Array(32).fill(9));
    mockGetOrCreateDeviceKey.mockResolvedValue({} as CryptoKey);
    mockWrapDekForDevice.mockResolvedValue({ wrappedDek: 'x', wrapIv: 'y' });
    // readDeviceDekTable is aliased to mockRetarget's mock; give it a table.
    mockRetarget.mockImplementation(() => ({
      formatVersion: 2,
      dekSource: 'login-response',
      storeId: 's1',
      device: null,
      users: {},
    }));
  });

  it('persists via switchMyStore, refreshes /me, adopts the server wrap and reloads — WITHOUT logging out', async () => {
    await switchToStore('s2');

    expect(mockSwitchMyStore).toHaveBeenCalledWith('s2');
    expect(mockGetMe).toHaveBeenCalledTimes(1);
    expect(mockUnwrapDekWithDek).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      SERVER_WRAP,
    );
    expect(mockWriteTable).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser.mock.calls[0][0].selectedStoreId).toBe('s2');
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('falls back to the per-store device table when the server wrap cannot be adopted (no DEK in memory)', async () => {
    mockGetDek.mockReturnValue(null);
    mockRetarget.mockReset();
    mockRetarget
      .mockReturnValueOnce(null) // readDeviceDekTable → no table either
      .mockReturnValueOnce(false); // retargetDeviceWrapStore → no wrap for s2

    await expect(switchToStore('s2')).resolves.toBeUndefined();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('falls back to retargetDeviceWrapStore when the server wrap unwrap fails', async () => {
    mockUnwrapDekWithDek.mockRejectedValue(new Error('bad wrap'));
    mockRetarget.mockReset();
    mockRetarget
      .mockReturnValueOnce({}) // readDeviceDekTable (unused by the fallback)
      .mockReturnValueOnce(true); // retargetDeviceWrapStore → success

    await switchToStore('s2');

    expect(mockWriteTable).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('throws WITHOUT calling getMe when switchMyStore answers succeeded:false', async () => {
    mockSwitchMyStore.mockResolvedValue({ succeeded: false, data: false, message: 'nope' });

    await expect(switchToStore('s2')).rejects.toThrow('STORE_SWITCH_REJECTED');

    expect(mockGetMe).not.toHaveBeenCalled();
    expect(mockRetarget).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('propagates switchMyStore network failures untouched', async () => {
    mockSwitchMyStore.mockRejectedValue(new Error('network down'));

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
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });
});
