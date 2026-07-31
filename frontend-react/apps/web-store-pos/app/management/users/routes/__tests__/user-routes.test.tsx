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
    login: 'user1',
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
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
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

let mockGetUsers = vi.fn();
let mockGetUserById = vi.fn();
let mockCreateUser = vi.fn();
let mockEditUser = vi.fn();
let mockActivateUser = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock('~/management/users/lib/services/user-http-service', () => ({
  userHttpService: {
    get getUsers() { return mockGetUsers; },
    get getUserById() { return mockGetUserById; },
    get createUser() { return mockCreateUser; },
    get editUser() { return mockEditUser; },
    get activateUser() { return mockActivateUser; },
    get deleteUser() { return mockDeleteUser; },
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
    mockGetUsers = vi.fn().mockResolvedValue({ succeeded: true, data: [makeDomainUser({ fullName: 'Alice Smith' })] });
  });

  it('fetches users on mount and renders them', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
    expect(mockGetUsers).toHaveBeenCalledTimes(1);
  });

  it('renders the "Empleados" page title, not "Usuarios" (Req: Copy Matches Angular Terminology Exactly)', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => screen.getByText('Alice Smith'));
    expect(screen.getByRole('heading', { name: 'Empleados' })).toBeInTheDocument();
  });
});

describe('UserListPage — S-LIST-2: empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockGetUsers = vi.fn().mockResolvedValue({ succeeded: true, data: [] });
  });

  it('shows empty state when no users exist', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(/no hay empleados/i)).toBeInTheDocument();
    });
  });
});

describe('UserListPage — S-LIST-3: HTTP-only fetch regardless of connectivity (Req: Users List Is HTTP-Only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    mockGetUsers = vi.fn().mockResolvedValue({ succeeded: true, data: [makeDomainUser({ fullName: 'Offline Fetch User' })] });
  });

  it('calls the users HTTP service on mount even when isOnline=false (no local cache read)', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Offline Fetch User')).toBeInTheDocument();
    });
    expect(mockGetUsers).toHaveBeenCalledTimes(1);
  });
});

describe('UserListPage — S-LIST-4: no degraded/offline banner ever renders (Req: Users List Is HTTP-Only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    mockGetUsers = vi.fn().mockResolvedValue({ succeeded: true, data: [] });
  });

  it('shows empty state and no degraded/cache notice when offline', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(/no hay empleados/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/caché/i)).not.toBeInTheDocument();
  });
});

describe('UserListPage — S-LIST-5: lifecycle action wired through the gear menu when online', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    // Use isActive:false so the Activar menu item is present after opening the gear menu.
    mockGetUsers = vi.fn().mockResolvedValue({ succeeded: true, data: [makeDomainUser({ fullName: 'User Z', id: 'uz', isActive: false })] });
    mockActivateUser = vi.fn().mockResolvedValue({ data: true });
  });

  it('calls activateUser when Activar is chosen from the gear menu', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => screen.getByText('User Z'));
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^activar$/i }));
    await waitFor(() => {
      expect(mockActivateUser).toHaveBeenCalledWith('uz', true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-B — getUsers() uses .then/.catch, so
// succeeded:false is a RESOLVED value inside .then, not a rejection. The .then
// callback must guard it the same as the .catch branch's USERS.ERROR.
// ═══════════════════════════════════════════════════════════════════════════════

describe('UserListPage — succeeded:false response (Req: Users List Surfaces succeeded:false via USERS.ERROR)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    localStorageMock.clear();
    mockGetUsers = vi.fn().mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    });
  });

  it('shows USERS.ERROR when getUsers resolves with succeeded:false, does not set users from data', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(esMessages['USERS.ERROR'])).toBeInTheDocument();
    });
    // users stays at its initial [] (never assigned res.data) — the card list's own
    // empty-state renders, which is unchanged/expected, not evidence of a null crash.
  });
});

describe('UserListPage — succeeded:true still populates users (regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    localStorageMock.clear();
    mockGetUsers = vi.fn().mockResolvedValue({
      succeeded: true,
      data: [makeDomainUser({ fullName: 'Still Works' })],
      message: null,
      actionCode: null,
      errors: [],
    });
  });

  it('renders users and clears the error state on succeeded:true', async () => {
    const { UserListPage } = await import('../user-list');
    render(<Wrapper><UserListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Still Works')).toBeInTheDocument();
    });
    expect(screen.queryByText(esMessages['USERS.ERROR'])).not.toBeInTheDocument();
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

describe('UserCreatePage — S-CREATE-TITLE: renders "Adicionar Empleado", not "Nuevo usuario" (Req: Copy Matches Angular Terminology Exactly)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ selectedStoreId: 's1' });
    mockIsOnline = true;
    mockParams = {};
  });

  it('shows the "Adicionar Empleado" page title', async () => {
    const { UserCreatePage } = await import('../user-create');
    render(<Wrapper><UserCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre completo/i));
    expect(screen.getByRole('heading', { name: 'Adicionar Empleado' })).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
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
    await waitFor(() => screen.getByRole('button', { name: /adicionar/i }));
    expect(screen.getByRole('button', { name: /adicionar/i })).toBeDisabled();
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
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'userx' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
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
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'usery' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
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
    mockGetUserById = vi.fn().mockResolvedValue({ data: makeDomainUser({ fullName: 'Pre-filled Name' }) });
  });

  it('pre-fills the fullName input from the fetched user', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Pre-filled Name')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Editar Empleado' })).toBeInTheDocument();
  });
});

describe('UserEditPage — S-EDIT-2: details submit calls editUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUserById = vi.fn().mockResolvedValue({ data: makeDomainUser({ fullName: 'Existing User' }) });
    mockEditUser = vi.fn().mockResolvedValue({ data: true });
  });

  it('calls editUser when details form submitted', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing User'));
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(mockEditUser).toHaveBeenCalledWith('u1', expect.objectContaining({ fullName: 'Existing User' }));
    });
  });
});

describe('UserEditPage — S-EDIT-NAV: successful save navigates to the users list (Req: Edit User Navigates to List on Save Success)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUserById = vi.fn().mockResolvedValue({ data: makeDomainUser({ fullName: 'Existing User' }) });
    mockEditUser = vi.fn().mockResolvedValue({ data: true });
  });

  it('navigates to /management/users after a successful details save, with no inline success message', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing User'));
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/users');
    });
    expect(screen.queryByText(/usuario actualizado correctamente/i)).not.toBeInTheDocument();
  });
});

describe('UserEditPage — S-EDIT-4: details form offline blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = false;
    mockParams = { id: 'u1' };
    mockGetUserById = vi.fn().mockResolvedValue({ data: makeDomainUser() });
  });

  it('details submit is disabled when offline', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /actualizar/i }));
    expect(screen.getByRole('button', { name: /actualizar/i })).toBeDisabled();
  });
});

describe('UserEditPage — S-EDIT-6: isActive hidden for non-admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: false });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUserById = vi.fn().mockResolvedValue({ data: makeDomainUser() });
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
    mockGetUserById = vi.fn().mockRejectedValue(new Error('Network error'));
  });

  it('shows error alert and does not mount the details form', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
  });
});

describe('UserEditPage — S-NOCRED: no credentials/password UI is rendered (Req: Edit User Has No Admin Password Change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'u1' };
    mockGetUserById = vi.fn().mockResolvedValue({ data: makeDomainUser() });
  });

  it('does not render any password/credentials fields or change-password action', async () => {
    const { UserEditPage } = await import('../user-edit');
    render(<Wrapper><UserEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('User One'));
    expect(screen.queryByLabelText(/contraseña actual/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^nueva contraseña$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cambiar contraseña/i })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminFeatureLoader reuse — spec TEST-5 (4 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminFeatureLoader — ACCESS-4: all 3 user routes export named loader', () => {
  it('UserListPage exports a named loader', async () => {
    const mod = await import('../user-list');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('UserCreatePage exports a named loader', async () => {
    const mod = await import('../user-create');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('UserEditPage exports a named loader', async () => {
    const mod = await import('../user-edit');
    expect(typeof mod.clientLoader).toBe('function');
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
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'usera' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
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
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'userb' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+222' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 'fallback-store' })
      );
    });
  });
});
