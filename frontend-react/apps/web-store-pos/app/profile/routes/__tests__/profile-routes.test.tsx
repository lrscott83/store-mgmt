import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { UserModel } from '@store-mgmt/domain';

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    cellPhone: '+54911',
    isActive: true,
    password: '',
    login: 'juan@test.com',
    authToken: 'token123',
    refreshToken: 'refresh123',
    expiresIn: Date.now() + THIRTY_FIVE_DAYS_MS,
    roles: [],
    featureIds: [70],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

// ─── Auth store mock ──────────────────────────────────────────────────────────

let mockUser: UserModel | null = makeUser();
let mockLogout = vi.fn();
let mockUpdateUser = vi.fn();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true, logout: mockLogout, updateUser: mockUpdateUser };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
    logout: mockLogout,
    updateUser: mockUpdateUser,
  });
  return { useAuthStore };
});

// ─── profileHttpService mock ─────────────────────────────────────────────────

let mockUpdateProfile = vi.fn();
let mockChangePassword = vi.fn();

vi.mock('~/profile/lib/services/profile-http-service', () => ({
  profileHttpService: {
    get updateProfile() { return mockUpdateProfile; },
    get changePassword() { return mockChangePassword; },
  },
}));

// ─── useOnlineStatus mock ─────────────────────────────────────────────────────

let mockIsOnline = true;

vi.mock('~/shared/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => mockIsOnline,
}));

// ─── react-router mock ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── offline/dek-provisioning mock (WU10: change-password re-wrap seam) ───────
// `change-password.tsx` reaches this via a DYNAMIC import (same D6 rationale
// as `auth-store.ts`'s own dynamic imports of this module) — `vi.mock` still
// intercepts it: Vitest's module mocking works at module-resolution level,
// not at the static/dynamic-import syntax level.

let mockRewrapDeviceDekForPassword = vi.fn();

vi.mock('~/shared/lib/offline/dek-provisioning', () => ({
  rewrapDeviceDekForPassword: (...args: unknown[]) => mockRewrapDeviceDekForPassword(...args),
}));

// ─── featureLoader mock ───────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  featureLoader: () => vi.fn().mockResolvedValue(null),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edit-profile integration tests (spec TEST-2, S-EDIT-1 through S-EDIT-5)
// ═══════════════════════════════════════════════════════════════════════════════

describe('EditProfilePage — S-EDIT-1: form pre-fills from auth-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockUpdateProfile = vi.fn().mockResolvedValue({ data: makeUser({ fullName: 'Juan Pérez' }) });
    mockUpdateUser = vi.fn();
  });

  it('pre-fills fullName input from store user', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    expect(screen.getByDisplayValue('Juan Pérez')).toBeInTheDocument();
  });

  it('pre-fills email input from store user', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    expect(screen.getByDisplayValue('juan@test.com')).toBeInTheDocument();
  });
});

describe('EditProfilePage — S-EDIT-3: offline disables submit and shows notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = false;
    mockUpdateProfile = vi.fn();
    mockUpdateUser = vi.fn();
  });

  it('disables submit button when offline', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled();
  });

  it('shows offline notice when offline', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});

describe('EditProfilePage — S-EDIT-1: successful submit calls updateProfile and updateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockUpdateUser = vi.fn();
    mockUpdateProfile = vi.fn().mockResolvedValue({
      data: makeUser({ fullName: 'María García' }),
    });
  });

  it('calls profileHttpService.updateProfile with correct payload', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );

    const nameInput = screen.getByDisplayValue('Juan Pérez');
    fireEvent.change(nameInput, { target: { value: 'María García' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('u1', expect.objectContaining({
        fullName: 'María García',
      }));
    });
  });

  it('calls auth-store.updateUser after successful update', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalled();
    });
  });
});

describe('EditProfilePage — PHONE-3: phone required only for owner/reseller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    mockUpdateUser = vi.fn();
    mockUpdateProfile = vi.fn().mockResolvedValue({ data: makeUser({ cellPhone: '' }) });
  });

  it('saves with an empty phone when the user is neither owner nor reseller', async () => {
    mockUser = makeUser({ cellPhone: '', isOwnerAdmin: false, isReSeller: false });
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('u1', expect.objectContaining({ cellPhone: '' }));
    });
  });

  it('blocks submit with an empty phone when the user is owner admin', async () => {
    mockUser = makeUser({ cellPhone: '', isOwnerAdmin: true, isReSeller: false });
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('blocks submit with an empty phone when the user is a reseller', async () => {
    mockUser = makeUser({ cellPhone: '', isOwnerAdmin: false, isReSeller: true });
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('EditProfilePage — S-EDIT-2: error response shows inline error (ERR-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockUpdateUser = vi.fn();
    mockUpdateProfile = vi.fn().mockRejectedValue(new Error('Server error'));
  });

  it('shows inline error when updateProfile throws', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('does NOT call updateUser when update fails', async () => {
    const { EditProfilePage } = await import('../edit-profile');
    render(
      <Wrapper>
        <EditProfilePage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Change-password integration tests (spec TEST-3, S-PWD-1 through S-PWD-5)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ChangePasswordPage — regex failure blocks submit (S-PWD-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockChangePassword = vi.fn();
    mockLogout = vi.fn();
  });

  it('does NOT call changePassword when newPassword fails regex', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'password' }, // fails regex: no digit, no uppercase
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    expect(mockChangePassword).not.toHaveBeenCalled();
  });
});

describe('ChangePasswordPage — mismatch blocks submit (S-PWD-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockChangePassword = vi.fn();
  });

  it('does NOT call changePassword when confirmPassword mismatches', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass1' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'DifferentPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    expect(mockChangePassword).not.toHaveBeenCalled();
  });
});

describe('ChangePasswordPage — offline blocks submit (S-PWD-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = false;
    mockChangePassword = vi.fn();
  });

  it('submit button is disabled when offline', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /cambiar contraseña/i })).toBeDisabled();
  });
});

describe('ChangePasswordPage — S-PWD-1: success → logout + navigate /login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockLogout = vi.fn();
    mockChangePassword = vi.fn().mockResolvedValue({ data: null });
  });

  it('calls auth-store.logout() on success', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('does NOT call navigate("/login") directly — redirect is now colocated inside auth-store.logout() (Decision 2, parity)', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/login');
  });
});

describe('ChangePasswordPage — S-PWD-4: error response shows inline error without clearing form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockLogout = vi.fn();
    mockChangePassword = vi.fn().mockRejectedValue(new Error('Wrong password'));
  });

  it('shows inline error when changePassword throws', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('does NOT call logout() when changePassword fails', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

// device-wrapped-dek WU10: the re-wrap seam MUST run strictly between the
// HTTP POST and logout() — after logout() the DEK is gone
// (auth-store.ts's logout() calls clearDek()), so this is the seam's last
// chance to read it.
describe('ChangePasswordPage — WU10: device DEK re-wrap seam (device-wrapped-dek design §5/§10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    mockLogout = vi.fn();
    mockChangePassword = vi.fn().mockResolvedValue({ data: null });
    mockRewrapDeviceDekForPassword = vi.fn().mockResolvedValue(undefined);
  });

  it('calls rewrapDeviceDekForPassword(user.login, newPassword), strictly after the POST and before logout()', async () => {
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    expect(mockRewrapDeviceDekForPassword).toHaveBeenCalledWith('juan@test.com', 'ValidPass2');

    const changePasswordOrder = mockChangePassword.mock.invocationCallOrder[0];
    const rewrapOrder = mockRewrapDeviceDekForPassword.mock.invocationCallOrder[0];
    const logoutOrder = mockLogout.mock.invocationCallOrder[0];
    expect(changePasswordOrder).toBeLessThan(rewrapOrder);
    expect(rewrapOrder).toBeLessThan(logoutOrder);
  });

  it('still calls logout() when rewrapDeviceDekForPassword rejects (swallowed, matches entity-migration.ts:15-18 doctrine)', async () => {
    mockRewrapDeviceDekForPassword = vi.fn().mockRejectedValue(new Error('rewrap failed'));
    const { ChangePasswordPage } = await import('../change-password');
    render(
      <Wrapper>
        <ChangePasswordPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
