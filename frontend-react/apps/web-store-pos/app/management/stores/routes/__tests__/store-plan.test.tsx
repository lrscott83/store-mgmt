import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { StorePlan, Module, UserModel } from '@store-mgmt/domain';

// ─── Domain factories ─────────────────────────────────────────────────────────

function makePlan(overrides: Partial<StorePlan> = {}): StorePlan {
  return {
    storeId: 's1',
    storeName: 'Store One',
    address: '123 Main St',
    description: 'A store',
    approved: true,
    isActive: true,
    paymentStartDate: '2024-01-01',
    nextDueDate: null,
    modules: [],
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

let mockGetStorePlan = vi.fn();
let mockGetModulesToStore = vi.fn();
let mockUpdateStore = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get getStorePlan() { return mockGetStorePlan; },
    get getModulesToStore() { return mockGetModulesToStore; },
    get updateStore() { return mockUpdateStore; },
  },
}));

// ─── react-router / loaders mocks ─────────────────────────────────────────────

let mockParams: Record<string, string> = {};

vi.mock('react-router', () => ({
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

describe('StorePlanPage — renders the plan picker with the store plan merged into the catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
    mockGetStorePlan = vi
      .fn()
      .mockResolvedValue({
        succeeded: true,
        data: makePlan({
          modules: [makeModule({ id: 1, selected: true })],
        }),
      });
    mockGetModulesToStore = vi.fn().mockResolvedValue({
      succeeded: true,
      data: [
        makeModule({ id: 1 }),
        makeModule({ id: 2, name: 'Free Module', priceIncluded: true, currentPrice: 0 }),
      ],
    });
  });

  it('fetches the plan and the catalog, merges them, and renders the picker', async () => {
    const { StorePlanPage } = await import('../store-plan');
    render(<Wrapper><StorePlanPage /></Wrapper>);

    await waitFor(() => {
      expect(mockGetStorePlan).toHaveBeenCalledWith('s1');
      expect(mockGetModulesToStore).toHaveBeenCalledTimes(1);
    });
    // SECTION_TITLE renders twice: the page heading and the picker's section label
    await waitFor(() => {
      expect(screen.getAllByText(esMessages['STORES.PLAN.SECTION_TITLE']).length).toBeGreaterThan(0);
    });
    // The store's paid module is selected → paid tab carries the ACTIVE badge.
    // Price format is "8 USD" (plan-picker's formatPlanPrice — no $ symbol;
    // trailing zeros dropped because the total is an integer).
    expect(screen.getByRole('tab', { name: /Pago/ }).textContent).toContain('8 USD');
    expect(screen.getByRole('tab', { name: /Pago/ }).textContent).toContain('Activo');
  });
});

describe('StorePlanPage — save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
    mockGetStorePlan = vi
      .fn()
      .mockResolvedValue({
        succeeded: true,
        data: makePlan({
          // Free store: no paid module selected
          modules: [makeModule({ id: 2, priceIncluded: true })],
        }),
      });
    mockGetModulesToStore = vi.fn().mockResolvedValue({
      succeeded: true,
      data: [
        makeModule({ id: 1 }),
        makeModule({ id: 2, name: 'Free Module', priceIncluded: true, currentPrice: 0 }),
      ],
    });
    mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
    mockGetUserByToken = vi.fn().mockResolvedValue(makeUser());
  });

  it('sends the full update payload with the chosen moduleIds and refreshes the session', async () => {
    const { StorePlanPage } = await import('../store-plan');
    render(<Wrapper><StorePlanPage /></Wrapper>);

    // Default tab is the ACTIVE plan (free); the activate button renders only on
    // the non-selected paid tab — same flow as the plan E2E.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Pago/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Activar este plan/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Activar este plan/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledTimes(1);
    });
    const [id, payload] = mockUpdateStore.mock.calls[0];
    expect(id).toBe('s1');
    // Choosing the paid plan selects the FULL union (free + paid)
    expect(payload.moduleIds).toEqual([1, 2]);
    expect(payload.name).toBe('Store One');
    expect(payload.paymentStartDate).toBe('2024-01-01');
    expect(mockGetUserByToken).toHaveBeenCalled();
  });

  it('omits paymentStartDate when the store has none', async () => {
    mockGetStorePlan = vi
      .fn()
      .mockResolvedValue({
        succeeded: true,
        data: makePlan({ paymentStartDate: null, modules: [] }),
      });

    const { StorePlanPage } = await import('../store-plan');
    render(<Wrapper><StorePlanPage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Guardar/ })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledTimes(1);
    });
    const payload = mockUpdateStore.mock.calls[0][1];
    // The key is present but undefined — JSON.stringify omits it from the wire
    // body, so the backend binds null and skips the payment date.
    expect(payload.paymentStartDate).toBeUndefined();
  });
});

describe('StorePlanPage — next billing date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockResolvedValue({
      succeeded: true,
      data: [
        makeModule({ id: 1 }),
        makeModule({ id: 2, name: 'Free Module', priceIncluded: true, currentPrice: 0 }),
      ],
    });
  });

  it('shows the next billing date when the store is on a paid plan', async () => {
    mockGetStorePlan = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makePlan({
        modules: [makeModule({ id: 1, selected: true })],
        nextDueDate: '2026-08-01',
      }),
    });

    const { StorePlanPage } = await import('../store-plan');
    render(<Wrapper><StorePlanPage /></Wrapper>);

    const banner = await screen.findByTestId('plan-next-billing-date');
    expect(banner).toHaveTextContent(esMessages['STORES.PLAN.NEXT_BILLING_DATE']);
    expect(banner).toHaveTextContent('01/08/2026');
  });

  it('does not show the next billing date on a free plan', async () => {
    mockGetStorePlan = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makePlan({
        modules: [makeModule({ id: 2, priceIncluded: true, currentPrice: 0 })],
        nextDueDate: '2026-08-01',
      }),
    });

    const { StorePlanPage } = await import('../store-plan');
    render(<Wrapper><StorePlanPage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Gratis/ })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('plan-next-billing-date')).not.toBeInTheDocument();
  });
});

describe('StorePlanPage — load failure (ST-ERROR parity with the plan E2E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
    mockGetStorePlan = vi
      .fn()
      .mockResolvedValue({ succeeded: true, data: makePlan({ modules: [] }) });
    mockGetModulesToStore = vi.fn().mockRejectedValue(new Error('Catalog error'));
  });

  it('shows STORES.ERROR and does not mount the picker when the catalog fails', async () => {
    const { StorePlanPage } = await import('../store-plan');
    render(<Wrapper><StorePlanPage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['STORES.ERROR']);
    });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });
});

describe('StorePlanPage — no selected store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser({ selectedStoreId: '' });
    mockParams = {};
  });

  it('shows NO_STORE_SELECTED and fetches nothing', async () => {
    const { StorePlanPage } = await import('../store-plan');
    render(<Wrapper><StorePlanPage /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText(esMessages['STORES.NO_STORE_SELECTED'])).toBeInTheDocument();
    });
    expect(mockGetStorePlan).not.toHaveBeenCalled();
    expect(mockGetModulesToStore).not.toHaveBeenCalled();
  });
});
