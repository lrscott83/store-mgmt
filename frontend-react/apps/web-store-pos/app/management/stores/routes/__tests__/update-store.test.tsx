import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store, Owner, UserModel } from '@store-mgmt/domain';

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
let mockGetUserByToken = vi.fn();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      user: mockUser,
      isAuthenticated: true,
      updateUser: vi.fn(),
      getUserByToken: mockGetUserByToken,
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
    updateUser: vi.fn(),
    getUserByToken: mockGetUserByToken,
  });
  return { useAuthStore };
});

// ─── storeHttpService mock ────────────────────────────────────────────────────

let mockGetStore = vi.fn();
let mockListOwners = vi.fn();
let mockUpdateStore = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get getStore() { return mockGetStore; },
    get listOwners() { return mockListOwners; },
    get updateStore() { return mockUpdateStore; },
  },
}));

// ─── react-router / loaders mocks ─────────────────────────────────────────────

let mockParams: Record<string, string> = {};
const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

// ─── localStorage mock (BaseRepository — kept transitionally) ─────────────────

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

describe('UpdateStorePage — data form WITHOUT the plan section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = { id: 's1' };
    mockGetStore = vi
      .fn()
      .mockResolvedValue({ succeeded: true, data: makeStore({ name: 'Existing Store' }) });
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [makeOwner()] });
  });

  it('pre-fills the store data and renders no PlanPicker and no plan tabs', async () => {
    const { UpdateStorePage } = await import('../update-store');
    render(<Wrapper><UpdateStorePage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Existing Store')).toBeInTheDocument();
    });
    expect(screen.queryByText(esMessages['STORES.PLAN.SECTION_TITLE'])).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activar este plan/ })).not.toBeInTheDocument();
  });

  it('saves WITHOUT moduleIds so the backend leaves the plan untouched', async () => {
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
    const { UpdateStorePage } = await import('../update-store');
    render(<Wrapper><UpdateStorePage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Existing Store')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledTimes(1);
    });
    const [id, payload] = mockUpdateStore.mock.calls[0];
    expect(id).toBe('s1');
    expect('moduleIds' in payload).toBe(false);
    expect(payload.name).toBe('Existing Store');
    expect(payload.paymentStartDate).toBe('2024-01-01');
    expect(mockGetUserByToken).toHaveBeenCalled();
  });
});

describe('UpdateStorePage — non-super admin save omits empty paymentStartDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser({ isSuperAdmin: false, selectedStoreId: 's1' });
    mockParams = {};
    mockGetStore = vi
      .fn()
      .mockResolvedValue({
        succeeded: true,
        data: makeStore({ paymentStartDate: null, approved: false }),
      });
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [] });
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
  });

  it('omits paymentStartDate (empty) and moduleIds on save', async () => {
    const { UpdateStorePage } = await import('../update-store');
    render(<Wrapper><UpdateStorePage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Store One')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledTimes(1);
    });
    const payload = mockUpdateStore.mock.calls[0][1];
    expect('moduleIds' in payload).toBe(false);
    // paymentStartDate is undefined — JSON.stringify omits it from the wire
    // body, so the backend binds null and never applies a bogus date.
    expect(payload.paymentStartDate).toBeUndefined();
  });
});

describe('UpdateStorePage — load/save errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = { id: 's1' };
  });

  it('shows STORES.ERROR when getStore fails', async () => {
    mockGetStore = vi.fn().mockRejectedValue(new Error('Not found'));
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [] });

    const { UpdateStorePage } = await import('../update-store');
    render(<Wrapper><UpdateStorePage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['STORES.ERROR']);
    });
  });

  it('shows an inline alert when updateStore throws', async () => {
    mockGetStore = vi
      .fn()
      .mockResolvedValue({ succeeded: true, data: makeStore({ name: 'Edit Me' }) });
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [] });
    mockUpdateStore = vi.fn().mockRejectedValue(new Error('Update failed'));

    const { UpdateStorePage } = await import('../update-store');
    render(<Wrapper><UpdateStorePage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Edit Me')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockUpdateStore).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateStorePage — no selected store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser({ selectedStoreId: '' });
    mockParams = {};
  });

  it('shows NO_STORE_SELECTED and fetches nothing', async () => {
    const { UpdateStorePage } = await import('../update-store');
    render(<Wrapper><UpdateStorePage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText(esMessages['STORES.NO_STORE_SELECTED'])).toBeInTheDocument();
    });
    expect(mockGetStore).not.toHaveBeenCalled();
  });
});
