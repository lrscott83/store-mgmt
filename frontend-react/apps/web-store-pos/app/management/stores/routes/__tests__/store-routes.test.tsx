import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store, Module, Owner } from '@store-mgmt/domain';

// ─── Domain factories ─────────────────────────────────────────────────────────

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 's1',
    name: 'Store One',
    displayName: 'Store One',
    ownerId: 'o1',
    ownerName: 'Owner One',
    address: '123 Main St',
    description: 'A store',
    approved: true,
    paymentStartDate: new Date(),
    modules: [],
    isActive: true,
    ...overrides,
  };
}

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    name: 'Module A',
    price: 10,
    currentPrice: 8,
    priceIncluded: false,
    discountText: '',
    selected: false,
    ...overrides,
  };
}

function makeOwner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: 'o1',
    userId: 'u1',
    fullName: 'Owner One',
    cellPhone: '+123',
    email: 'owner@test.com',
    description: '',
    guest: false,
    storeModules: [],
    reSellerId: '',
    reSellerName: '',
    approved: true,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'system',
    ...overrides,
  };
}

// ─── User factory ─────────────────────────────────────────────────────────────

import type { UserModel } from '@store-mgmt/domain';
function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
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
    featureIds: [73],
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
let mockUpdateUser = vi.fn();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true, updateUser: mockUpdateUser };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
    updateUser: mockUpdateUser,
  });
  return { useAuthStore };
});

// ─── storeHttpService mock ────────────────────────────────────────────────────

let mockListStores = vi.fn();
let mockGetStore = vi.fn();
let mockCreateStore = vi.fn();
let mockUpdateStore = vi.fn();
let mockActivateStore = vi.fn();
let mockApproveStore = vi.fn();
let mockDisapproveStore = vi.fn();
let mockDeactivateStore = vi.fn();
let mockListModulesToStore = vi.fn();
let mockListOwners = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get listStores() { return mockListStores; },
    get getStore() { return mockGetStore; },
    get createStore() { return mockCreateStore; },
    get updateStore() { return mockUpdateStore; },
    get activateStore() { return mockActivateStore; },
    get approveStore() { return mockApproveStore; },
    get disapproveStore() { return mockDisapproveStore; },
    get deactivateStore() { return mockDeactivateStore; },
    get listModulesToStore() { return mockListModulesToStore; },
    get listOwners() { return mockListOwners; },
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

// ─── localStorage mock ───────────────────────────────────────────────────────

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
// StoreListPage — spec TEST-2 (5 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('StoreListPage — S-LIST-1: online fetch and render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListStores = vi.fn().mockResolvedValue({ data: [makeStore({ name: 'Store Alpha' })] });
  });

  it('fetches stores on mount and renders them', async () => {
    const { StoreListPage } = await import('../store-list');
    render(<Wrapper><StoreListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    });
    expect(mockListStores).toHaveBeenCalledTimes(1);
  });
});

describe('StoreListPage — S-LIST-2: empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListStores = vi.fn().mockResolvedValue({ data: [] });
  });

  it('shows empty state when no stores exist', async () => {
    const { StoreListPage } = await import('../store-list');
    render(<Wrapper><StoreListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(/no hay tiendas/i)).toBeInTheDocument();
    });
  });
});

describe('StoreListPage — S-LIST-3: offline + cache fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    // Prepopulate cache
    const cacheKey = `lizoft.store-stores-s1`;
    const cachedStore = makeStore({ name: 'Cached Store' });
    localStorageMock.setItem(cacheKey, JSON.stringify([[cachedStore.id, cachedStore]]));
    mockListStores = vi.fn();
  });

  it('reads from cache when offline and does not call HTTP', async () => {
    const { StoreListPage } = await import('../store-list');
    render(<Wrapper><StoreListPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Cached Store')).toBeInTheDocument();
    });
    expect(mockListStores).not.toHaveBeenCalled();
  });
});

describe('StoreListPage — navigates to create on create button click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListStores = vi.fn().mockResolvedValue({ data: [] });
  });

  it('navigates to /management/stores/create when create button clicked', async () => {
    const { StoreListPage } = await import('../store-list');
    render(<Wrapper><StoreListPage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /crear tienda/i }));
    fireEvent.click(screen.getByRole('button', { name: /crear tienda/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/management/stores/create');
  });
});

describe('StoreListPage — S-LIST-5: lifecycle blocked offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    mockListStores = vi.fn();
  });

  it('lifecycle action buttons are disabled when offline', async () => {
    const cacheKey = `lizoft.store-stores-s1`;
    const cachedStore = makeStore({ name: 'Store Z' });
    localStorageMock.setItem(cacheKey, JSON.stringify([[cachedStore.id, cachedStore]]));
    const { StoreListPage } = await import('../store-list');
    render(<Wrapper><StoreListPage /></Wrapper>);
    await waitFor(() => screen.getByText('Store Z'));
    const editBtn = screen.getByRole('button', { name: /^editar$/i });
    expect(editBtn).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// StoreCreatePage — spec TEST-3 (5 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('StoreCreatePage — S-CREATE-1: success navigates to user create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
    mockCreateStore = vi.fn().mockResolvedValue({ data: makeStore() });
  });

  it('navigates to /management/users/create/ after successful create (Angular parity)', async () => {
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre/i));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'New Store' } });
    // isSuperAdmin=true so owner picker is shown — select an owner to pass ownerId validation
    const ownerSelect = screen.queryByLabelText(/propietario/i);
    if (ownerSelect) {
      fireEvent.change(ownerSelect, { target: { value: 'o1' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/users/create/');
    });
  });
});

describe('StoreCreatePage — S-CREATE-2: offline gate reactive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('disables submit and shows offline notice when offline', async () => {
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});

describe('StoreCreatePage — S-CREATE-3: HTTP error shown inline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
    mockCreateStore = vi.fn().mockRejectedValue(new Error('Server error'));
  });

  it('shows inline error when createStore throws', async () => {
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre/i));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Store X' } });
    // Select owner to pass ownerId validation (isSuperAdmin=true shows owner picker)
    const ownerSelect = screen.queryByLabelText(/propietario/i);
    if (ownerSelect) {
      fireEvent.change(ownerSelect, { target: { value: 'o1' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/management/users/create/');
  });
});

describe('StoreCreatePage — S-CREATE-4: module catalog fetched on mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule({ name: 'Catalog Module' })] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('renders module catalog in the form', async () => {
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByLabelText('Catalog Module')).toBeInTheDocument();
    });
    expect(mockListModulesToStore).toHaveBeenCalledTimes(1);
  });
});

describe('StoreCreatePage — S-CREATE-5: module catalog error blocks submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    mockListModulesToStore = vi.fn().mockRejectedValue(new Error('Catalog error'));
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('shows catalog error and disables submit when catalog fails', async () => {
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// StoreEditPage — spec TEST-4 (6 cases)
// ═══════════════════════════════════════════════════════════════════════════════

describe('StoreEditPage — S-EDIT-1: success navigates to store list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Existing Store' }) });
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
  });

  it('navigates to /management/stores after successful update', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing Store'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/stores');
    });
  });
});

describe('StoreEditPage — S-EDIT-2: pre-fills form from fetched store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Pre-filled Name' }) });
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
  });

  it('pre-fills the name input from the fetched store', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Pre-filled Name')).toBeInTheDocument();
    });
  });
});

describe('StoreEditPage — S-EDIT-3: offline gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = false;
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore() });
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('submit is disabled and shows offline notice when offline', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});

describe('StoreEditPage — S-EDIT-4: HTTP error shown inline without redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Edit Me' }) });
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
    mockUpdateStore = vi.fn().mockRejectedValue(new Error('Update failed'));
  });

  it('shows inline error when updateStore throws and does not navigate', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Edit Me'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/management/stores');
  });
});

describe('StoreEditPage — S-EDIT-5: store not found shows error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 'nonexistent' };
    mockGetStore = vi.fn().mockRejectedValue(new Error('Not found'));
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('shows error state when getStore fails', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

describe('StoreEditPage — S-EDIT-6: id from selectedStoreId when no param', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: 's-from-user' });
    mockIsOnline = true;
    mockParams = {};
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'User Store' }) });
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('uses selectedStoreId when no id param present', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => {
      expect(mockGetStore).toHaveBeenCalledWith('s-from-user');
    });
  });
});

// ─── Finding 9: post-create redirect to /management/users/create/ ─────────────

describe('StoreCreatePage — S-CREATE-REDIRECT: navigates to /management/users/create/', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner({ id: 'o1' })] });
    mockCreateStore = vi.fn().mockResolvedValue({ data: makeStore() });
  });

  it('navigates to /management/users/create/ after successful create', async () => {
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    // Wait for catalog + owner to load (owner picker appears for superAdmin)
    await waitFor(() => screen.getByLabelText(/propietario/i));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'New Store' } });
    fireEvent.change(screen.getByLabelText(/propietario/i), { target: { value: 'o1' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/users/create/');
    });
  });
});

// ─── Finding 10: post-edit re-fetches user via auth store (no reload) ─────────

// authHttpService mock for /me re-fetch
let mockGetMe = vi.fn();
vi.mock('~/shared/lib/http/auth-http-service', () => ({
  authHttpService: {
    get getMe() { return mockGetMe; },
  },
}));

describe('StoreEditPage — S-EDIT-POST-EDIT: refreshes user after successful edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockIsOnline = true;
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Existing Store' }) });
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
    mockGetMe = vi.fn().mockResolvedValue({ data: makeUser() });
  });

  it('calls authHttpService.getMe and updateUser after successful edit instead of reload', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing Store'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockGetMe).toHaveBeenCalled();
      expect(mockUpdateUser).toHaveBeenCalled();
    });
  });

  it('still navigates away after successful edit', async () => {
    const { StoreEditPage } = await import('../store-edit');
    render(<Wrapper><StoreEditPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing Store'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/stores');
    });
  });
});

// ─── Finding 11: isOwnerAdmin computed as isSuperAdmin || hasOwnersFeature ────

describe('StoreCreatePage — S-CREATE-OWNER-GATE: isOwnerAdmin computed from feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    mockListModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
  });

  it('shows owner picker for non-superAdmin user who has EFeatures.Owners in featureIds', async () => {
    // EFeatures.Owners = 11
    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: true, featureIds: [73, 11] });
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByLabelText(/propietario/i)).toBeInTheDocument();
    });
  });

  it('shows owner picker for superAdmin even without Owners featureId', async () => {
    mockUser = makeUser({ isSuperAdmin: true, isOwnerAdmin: false, featureIds: [73] });
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByLabelText(/propietario/i)).toBeInTheDocument();
    });
  });

  it('does NOT show owner picker for plain ownerAdmin without EFeatures.Owners in featureIds', async () => {
    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: true, featureIds: [73] });
    const { StoreCreatePage } = await import('../store-create');
    render(<Wrapper><StoreCreatePage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /guardar/i }));
    expect(screen.queryByLabelText(/propietario/i)).not.toBeInTheDocument();
  });
});
