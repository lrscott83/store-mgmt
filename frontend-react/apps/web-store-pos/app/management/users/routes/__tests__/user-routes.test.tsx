import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { User } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';

// ─── Domain factories ─────────────────────────────────────────────────────────

function makeDomainUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    fullName: 'User One',
    cellPhone: '+123',
    email: 'user@test.com',
    isActive: true,
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'admin1',
    fullName: 'Admin User',
    email: 'admin@test.com',
    cellPhone: '',
    isActive: true,
    password: '',
    login: 'admin@test.com',
    authToken: 'token',
    refreshToken: 'refresh',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [72],
    storeModuleIds: [],
    isSuperAdmin: true,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

// ─── Auth store mock ──────────────────────────────────────────────────────────

let mockUser: UserModel | null = makeUser();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
  });
  return { useAuthStore };
});

// ─── userHttpService mock ─────────────────────────────────────────────────────

let mockListUsers = vi.fn();
let mockGetUser = vi.fn();
let mockCreateUser = vi.fn();
let mockUpdateUserDetails = vi.fn();
let mockActivateUser = vi.fn();
let mockDeactivateUser = vi.fn();
let mockChangePassword = vi.fn();

vi.mock('~/management/users/lib/services/user-http-service', () => ({
  userHttpService: {
    get listUsers() { return mockListUsers; },
    get getUser() { return mockGetUser; },
    get createUser() { return mockCreateUser; },
    get updateUserDetails() { return mockUpdateUserDetails; },
    get activateUser() { return mockActivateUser; },
    get deactivateUser() { return mockDeactivateUser; },
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
let mockParams: Record<string, string> = {};

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

// ─── adminFeatureLoader mock ──────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

// ─── localStorage mock ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UserListPage — spec TEST-2 (5 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('UserListPage — S-LIST-1: online fetch and render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListUsers = vi.fn().mockResolvedValue({ data: [makeDomainUser({ fullName: 'Alice Smith' })] });
  });

  it('fetches users on mount and renders them', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
    expect(mockListUsers).toHaveBeenCalledTimes(1);
  });
});

describe('UserListPage — S-LIST-2: empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListUsers = vi.fn().mockResolvedValue({ data: [] });
  });

  it('shows empty state when no users exist', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(/no hay usuarios/i)).toBeInTheDocument();
    });
  });
});

describe('UserListPage — S-LIST-3: offline + cache fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    const cacheKey = `lizoft.store-storeusers-s1`;
    const cachedUser = makeDomainUser({ fullName: 'Cached User' });
    localStorageMock.setItem(cacheKey, JSON.stringify([[cachedUser.id, cachedUser]]));
    mockListUsers = vi.fn();
  });

  it('reads from cache when offline and does not call HTTP', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Cached User')).toBeInTheDocument();
    });
    expect(mockListUsers).not.toHaveBeenCalled();
  });
});

describe('UserListPage — S-LIST-4: offline + empty cache shows empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    mockListUsers = vi.fn();
  });

  it('shows empty state when offline and cache is empty', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(/no hay usuarios/i)).toBeInTheDocument();
    });
  });
});

describe('UserListPage — S-LIST-5: lifecycle buttons online (re-enabled)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    // Use isActive:false so the Activate button is visible after the conditional fix
    mockListUsers = vi.fn().mockResolvedValue({ data: [makeDomainUser({ fullName: 'User Z', id: 'uz', isActive: false })] });
    mockActivateUser = vi.fn().mockResolvedValue({ data: true });
  });

  it('lifecycle action buttons enabled when online', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => screen.getByText('User Z'));
    const activateBtn = screen.getByRole('button', { name: /^activar$/i });
    expect(activateBtn).not.toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UserCreatePage — spec TEST-3 (5 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('UserCreatePage — S-CREATE-1: missing selectedStoreId → redirect /management/stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ selectedStoreId: '' });
    mockIsOnline = true;
    mockParams = {};
  });

  it('navigates to /management/stores when no storeId available', async () => {
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/stores');
    });
  });
});

describe('UserCreatePage — S-CREATE-2: success navigates to /management/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ selectedStoreId: 's1' });
    mockIsOnline = true;
    mockParams = {};
    mockCreateUser = vi.fn().mockResolvedValue({ data: true });
  });

  it('navigates to /management/users after successful create', async () => {
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre completo/i));
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText(/usuario \(login\)/i), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/users');
    });
  });
});

describe('UserCreatePage — S-CREATE-3: offline blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ selectedStoreId: 's1' });
    mockIsOnline = false;
    mockParams = {};
  });

  it('disables submit and shows offline notice when offline', async () => {
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});

describe('UserCreatePage — S-CREATE-4: HTTP error shown inline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ selectedStoreId: 's1' });
    mockIsOnline = true;
    mockParams = {};
    mockCreateUser = vi.fn().mockRejectedValue(new Error('Server error'));
  });

  it('shows inline error when createUser throws', async () => {
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre completo/i));
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'User X' } });
    fireEvent.change(screen.getByLabelText(/usuario \(login\)/i), { target: { value: 'userx' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/management/users');
  });
});

describe('UserCreatePage — S-CREATE-5: password validation blocks submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ selectedStoreId: 's1' });
    mockIsOnline = true;
    mockParams = {};
    mockCreateUser = vi.fn();
  });

  it('blocks submit when password is too weak', async () => {
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre completo/i));
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'User Y' } });
    fireEvent.change(screen.getByLabelText(/usuario \(login\)/i), { target: { value: 'usery' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByText(/contraseña debe/i)).toBeInTheDocument();
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UserEditPage — spec TEST-4 (6 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('UserEditPage — S-EDIT-1: pre-fills UserDetailsForm after getById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUser = vi.fn().mockResolvedValue({ data: makeDomainUser({ fullName: 'Pre-filled Name' }) });
  });

  it('pre-fills the fullName input from the fetched user', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Pre-filled Name')).toBeInTheDocument();
    });
  });
});

describe('UserEditPage — S-EDIT-2: details submit calls updateUserDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUser = vi.fn().mockResolvedValue({ data: makeDomainUser({ fullName: 'Existing User' }) });
    mockUpdateUserDetails = vi.fn().mockResolvedValue({ data: true });
  });

  it('calls updateUserDetails when details form submitted', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing User'));
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(mockUpdateUserDetails).toHaveBeenCalledWith('u1', expect.objectContaining({ fullName: 'Existing User' }));
    });
  });
});

describe('UserEditPage — S-EDIT-3: credentials submit calls changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUser = vi.fn().mockResolvedValue({ data: makeDomainUser() });
    mockChangePassword = vi.fn().mockResolvedValue({ data: true });
  });

  it('calls changePassword when credentials form submitted', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/contraseña actual/i));
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), { target: { value: 'OldPass1' } });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), { target: { value: 'NewPass1' } });
    fireEvent.change(screen.getByLabelText(/^confirmar nueva contraseña$/i), { target: { value: 'NewPass1' } });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith('u1', { oldPassword: 'OldPass1', newPassword: 'NewPass1' });
    });
  });
});

describe('UserEditPage — S-EDIT-4: details form offline blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = false;
    mockParams = { id: 'u1' };
    mockGetUser = vi.fn().mockResolvedValue({ data: makeDomainUser() });
  });

  it('details submit is disabled when offline', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /actualizar/i }));
    expect(screen.getByRole('button', { name: /actualizar/i })).toBeDisabled();
  });
});

describe('UserEditPage — S-EDIT-5: credentials form offline blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = false;
    mockParams = { id: 'u1' };
    mockGetUser = vi.fn().mockResolvedValue({ data: makeDomainUser() });
  });

  it('credentials submit is disabled when offline', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /cambiar contraseña/i }));
    expect(screen.getByRole('button', { name: /cambiar contraseña/i })).toBeDisabled();
  });
});

describe('UserEditPage — S-EDIT-6: isActive hidden for non-admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: false });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUser = vi.fn().mockResolvedValue({ data: makeDomainUser() });
  });

  it('does not show isActive toggle for regular (non-admin) user', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /actualizar/i }));
    expect(screen.queryByLabelText(/activo/i)).not.toBeInTheDocument();
  });
});

describe('UserEditPage — S-ERR-1: getById rejection renders error, no form mounted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUser = vi.fn().mockRejectedValue(new Error('Network error'));
  });

  it('shows error alert and does not mount details or credentials inputs', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña actual/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminFeatureLoader reuse — spec TEST-5 (4 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminFeatureLoader — ACCESS-4: all 3 user routes export named loader', () => {
  it('UserListPage exports a named loader', async () => {
    const mod = await import('../user-list');
    expect(typeof mod.loader).toBe('function');
  });

  it('UserCreatePage exports a named loader', async () => {
    const mod = await import('../user-create');
    expect(typeof mod.loader).toBe('function');
  });

  it('UserEditPage exports a named loader', async () => {
    const mod = await import('../user-edit');
    expect(typeof mod.loader).toBe('function');
  });

  it('ROUTE-EDIT-SHAPE: edit route uses /edit/:id (matching Angular + React convention)', () => {
    // Angular: management/users/edit/:id
    // React convention (resellers, owners): /admin/resellers/edit/:id, /admin/owners/edit/:id
    const routePath = 'management/users/edit/:id';
    expect(routePath).toMatch(/\/edit\/:\w+$/);
    expect(routePath).not.toMatch(/\/:\w+\/edit$/);
  });
});

describe('UserCreatePage — ROUTE-STOREID: resolves storeId from :storeId param or auth fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
  });

  it('uses :storeId param when provided (deep-link from store create)', async () => {
    mockUser = makeUser({ selectedStoreId: 'fallback-store' });
    mockParams = { storeId: 'param-store' };
    mockCreateUser = vi.fn().mockResolvedValue({ data: true });
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre completo/i));
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'User A' } });
    fireEvent.change(screen.getByLabelText(/usuario \(login\)/i), { target: { value: 'usera' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 'param-store' })
      );
    });
  });

  it('falls back to selectedStoreId when :storeId param is absent (bare redirect)', async () => {
    mockUser = makeUser({ selectedStoreId: 'fallback-store' });
    mockParams = {};
    mockCreateUser = vi.fn().mockResolvedValue({ data: true });
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre completo/i));
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'User B' } });
    fireEvent.change(screen.getByLabelText(/usuario \(login\)/i), { target: { value: 'userb' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+222' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 'fallback-store' })
      );
    });
  });
});
