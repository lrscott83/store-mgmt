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
    paymentStartDate: '2024-01-01',
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
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

// ─── Auth store mock ──────────────────────────────────────────────────────────

let mockUser: UserModel | null = makeUser();
let mockUpdateUser = vi.fn();
let mockGetUserByToken = vi.fn();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true, updateUser: mockUpdateUser, getUserByToken: mockGetUserByToken };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
    updateUser: mockUpdateUser,
    getUserByToken: mockGetUserByToken,
  });
  return { useAuthStore };
});

// ─── storeHttpService mock ────────────────────────────────────────────────────

let mockListStores = vi.fn();
let mockGetStore = vi.fn();
let mockCreateStore = vi.fn();
let mockUpdateStore = vi.fn();
let mockGetModulesToStore = vi.fn();
let mockListOwners = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get listStores() { return mockListStores; },
    get getStore() { return mockGetStore; },
    get createStore() { return mockCreateStore; },
    get updateStore() { return mockUpdateStore; },
    get getModulesToStore() { return mockGetModulesToStore; },
    get listOwners() { return mockListOwners; },
  },
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

// ─── authHttpService mock (post-edit /me refresh) ─────────────────────────────

let mockGetMe = vi.fn();
vi.mock('~/shared/lib/http/auth-http-service', () => ({
  authHttpService: {
    get getMe() { return mockGetMe; },
  },
}));

// ─── localStorage mock (BaseRepository — kept transitionally in Phase 1) ──────

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
// Mode resolution — one module, 3 URLs (Req: Unified Edit-Store Route Model)
// ═══════════════════════════════════════════════════════════════════════════════

describe('EditStorePage — mode resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('no route param + selectedStoreId present -> edit mode, id = selectedStoreId', async () => {
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: 's-from-user' });
    mockParams = {};
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'User Store' }) });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(mockGetStore).toHaveBeenCalledWith('s-from-user');
    });
    expect(screen.getByText(esMessages['STORES.EDIT_TITLE'])).toBeInTheDocument();
  });

  it('/create with no selectedStoreId -> create mode, no store fetch', async () => {
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    mockParams = {};
    mockGetStore = vi.fn();
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(esMessages['STORES.CREATE_TITLE'])).toBeInTheDocument();
    });
    expect(mockGetStore).not.toHaveBeenCalled();
  });

  it('/edit/:id -> edit mode, id from route param overrides selectedStoreId', async () => {
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: 's-from-user' });
    mockParams = { id: 's2' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ id: 's2', name: 'Param Store' }) });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(mockGetStore).toHaveBeenCalledWith('s2');
    });
    expect(screen.getByText(esMessages['STORES.EDIT_TITLE'])).toBeInTheDocument();
  });

  it('never renders a stores list or lifecycle action buttons (no Angular equivalent)', async () => {
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    mockParams = {};
    mockGetStore = vi.fn();
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre/i));
    expect(screen.queryByText(esMessages['STORES.LIST_TITLE'])).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: esMessages['STORES.ACTIVATE'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: esMessages['STORES.APPROVE'] })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: esMessages['STORES.DISAPPROVE'] })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Create-mode behaviors (ported from S-CREATE-*)
// ═══════════════════════════════════════════════════════════════════════════════

describe('EditStorePage — create mode: success navigates to user create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
    mockCreateStore = vi.fn().mockResolvedValue({ data: makeStore() });
  });

  it('navigates to /management/users/create/ after successful create (Angular parity)', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre/i));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'New Store' } });
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

describe('EditStorePage — create mode: HTTP error shown inline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
    mockCreateStore = vi.fn().mockRejectedValue(new Error('Server error'));
  });

  it('shows inline error when createStore throws', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText(/nombre/i));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Store X' } });
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

describe('EditStorePage — create mode: module catalog fetched on mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule({ name: 'Catalog Module' })] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('renders module catalog in the form', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    // Wait for the fetched catalog to land (paid total reflects the loaded module's price)
    // before switching tabs — otherwise the async modules update races the click and
    // resets the tab back to the active plan.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Pago/ })).toHaveTextContent('$8.00');
    });
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    expect(screen.getByText('Catalog Module')).toBeInTheDocument();
    expect(mockGetModulesToStore).toHaveBeenCalledTimes(1);
  });
});

describe('EditStorePage — create mode: module catalog error blocks submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockRejectedValue(new Error('Catalog error'));
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('shows catalog error and disables submit when catalog fails', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    });
  });
});

describe('EditStorePage — create mode: isOwnerAdmin computed from feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
  });

  it('shows owner picker for non-superAdmin user who has EFeatures.Owners in featureIds', async () => {
    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: true, featureIds: [73, 11], selectedStoreId: '' });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByLabelText(/propietario/i)).toBeInTheDocument();
    });
  });

  it('shows owner picker for superAdmin even without Owners featureId', async () => {
    mockUser = makeUser({ isSuperAdmin: true, isOwnerAdmin: false, featureIds: [73], selectedStoreId: '' });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByLabelText(/propietario/i)).toBeInTheDocument();
    });
  });

  it('does NOT show owner picker for plain ownerAdmin without EFeatures.Owners in featureIds', async () => {
    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: true, featureIds: [73], selectedStoreId: '' });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /guardar/i }));
    expect(screen.queryByLabelText(/propietario/i)).not.toBeInTheDocument();
  });
});

describe('EditStorePage — create mode: HTTP-only, no offline notice (Req: HTTP-Only Data Access)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ selectedStoreId: '' });
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('does NOT show an offline notice or gate submit on connectivity state (Angular store.service.ts is pure HTTP)', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByRole('button', { name: /guardar/i })).not.toBeDisabled();
    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edit-mode behaviors (ported from S-EDIT-*)
// ═══════════════════════════════════════════════════════════════════════════════

describe('EditStorePage — edit mode: success navigates to store list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Existing Store' }) });
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
    mockGetMe = vi.fn().mockResolvedValue({ data: makeUser() });
  });

  it('navigates to /management/stores after successful update', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing Store'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/stores');
    });
  });
});

describe('EditStorePage — edit mode: pre-fills form from fetched store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Pre-filled Name' }) });
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [makeOwner()] });
  });

  it('pre-fills the name input from the fetched store', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Pre-filled Name')).toBeInTheDocument();
    });
  });
});

describe('EditStorePage — edit mode: HTTP-only, no offline notice (Req: HTTP-Only Data Access)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore() });
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('does NOT show an offline notice or gate submit on connectivity state (Angular store.service.ts is pure HTTP)', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByRole('button', { name: /guardar/i }));
    expect(screen.getByRole('button', { name: /guardar/i })).not.toBeDisabled();
    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument();
  });
});

describe('EditStorePage — no BaseRepository cache read/write on load or save (Req: HTTP-Only Data Access)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Existing Store' }) });
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
    mockGetMe = vi.fn().mockResolvedValue({ data: makeUser() });
  });

  it('never touches localStorage cache on load or successful save', async () => {
    const setItemSpy = vi.spyOn(localStorageMock, 'setItem');
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing Store'));
    expect(setItemSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/stores');
    });
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});

describe('EditStorePage — edit mode: HTTP error shown inline without redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Edit Me' }) });
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
    mockUpdateStore = vi.fn().mockRejectedValue(new Error('Update failed'));
  });

  it('shows inline error when updateStore throws and does not navigate', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Edit Me'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/management/stores');
  });
});

describe('EditStorePage — edit mode: store not found shows error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockParams = { id: 'nonexistent' };
    mockGetStore = vi.fn().mockRejectedValue(new Error('Not found'));
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
  });

  it('shows error state when getStore fails', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

describe('EditStorePage — edit mode: refreshes user after successful edit (no reload)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true });
    mockParams = { id: 's1' };
    mockGetStore = vi.fn().mockResolvedValue({ data: makeStore({ name: 'Existing Store' }) });
    mockGetModulesToStore = vi.fn().mockResolvedValue({ data: [] });
    mockListOwners = vi.fn().mockResolvedValue({ data: [] });
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
    mockGetUserByToken = vi.fn().mockResolvedValue(makeUser());
  });

  it('calls getUserByToken after successful edit instead of reload', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing Store'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockGetUserByToken).toHaveBeenCalled();
    });
  });

  it('still navigates away after successful edit', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('Existing Store'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/management/stores');
    });
  });
});
