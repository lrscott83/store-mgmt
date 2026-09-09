import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { StorePlan, Plan, PlanModule, Module, Feature, UserModel } from '@store-mgmt/domain';

// ─── Domain factories ─────────────────────────────────────────────────────────

function makeStorePlan(overrides: Partial<StorePlan> = {}): StorePlan {
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
    planType: 'Gratis',
    ...overrides,
  };
}

function makePlanModule(overrides: Partial<PlanModule> = {}): PlanModule {
  return {
    moduleId: 1,
    name: 'Module A',
    order: 1,
    priceIncluded: false,
    price: 10,
    currentPrice: 8,
    discountPrice: 0,
    percentDiscountPrice: 0,
    discountText: '- 20%',
    featureDescriptions: [],
    ...overrides,
  };
}

/** Module shape for the store snapshot (StorePlan.modules). */
function makeStoreModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    name: 'Module A',
    price: 10,
    currentPrice: 8,
    priceIncluded: false,
    discountText: '- 20%',
    selected: true,
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 1,
    name: 'Pago',
    order: 1,
    planType: 'Pago',
    price: 8,
    modules: [makePlanModule()],
    ...overrides,
  };
}

/** Real catalog shape GET /v1/plans returns: free module (id 2) + paid (id 1) + superior (1+3). */
function makeCatalog(): Plan[] {
  return [
    makePlan({
      id: 1,
      name: 'Gratis',
      planType: 'Gratis',
      price: 0,
      modules: [
        makePlanModule({
          moduleId: 2,
          name: 'Free Module',
          priceIncluded: true,
          price: 0,
          currentPrice: 0,
          discountText: '',
        }),
      ],
    }),
    makePlan({
      id: 2,
      name: 'Pago',
      planType: 'Pago',
      price: 8,
      modules: [makePlanModule({ moduleId: 1, name: 'Module A' })],
    }),
    makePlan({
      id: 3,
      name: 'Superior',
      planType: 'Superior',
      price: 12,
      modules: [
        makePlanModule({ moduleId: 1, name: 'Module A' }),
        makePlanModule({
          moduleId: 3,
          name: 'Module C',
          price: 4,
          currentPrice: 4,
          discountText: '',
        }),
      ],
    }),
  ];
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 10,
    name: 'feature-a',
    moduleId: 1,
    displayName: 'Feature A',
    description: 'Feature A description',
    order: 1,
    availableToStore: true,
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
let mockGetPlans = vi.fn();
let mockGetFeaturesToStore = vi.fn();
let mockUpdateStore = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get getStorePlan() {
      return mockGetStorePlan;
    },
    get getPlans() {
      return mockGetPlans;
    },
    get getFeaturesToStore() {
      return mockGetFeaturesToStore;
    },
    get updateStore() {
      return mockUpdateStore;
    },
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
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
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

/** Default happy path: free store, real catalog, features grouped by module. */
function seedDefaults() {
  mockGetStorePlan = vi.fn().mockResolvedValue({
    succeeded: true,
    data: makeStorePlan({ planType: 'Gratis', modules: [] }),
  });
  mockGetPlans = vi.fn().mockResolvedValue({ succeeded: true, data: makeCatalog() });
  mockGetFeaturesToStore = vi.fn().mockResolvedValue({
    succeeded: true,
    data: [makeFeature()],
  });
  mockUpdateStore = vi.fn().mockResolvedValue({ data: true });
  mockGetUserByToken = vi.fn().mockResolvedValue(makeUser());
}

async function renderPage(user: UserModel = makeUser()) {
  mockUser = user;
  const { StorePlanPage } = await import('../store-plan');
  return render(
    <Wrapper>
      <StorePlanPage />
    </Wrapper>,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePlanPage — renders the catalog panels with the store plan active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
    seedDefaults();
  });

  it('fetches the plan, the catalog and the features, then renders the three panels', async () => {
    await renderPage();

    await waitFor(() => {
      expect(mockGetStorePlan).toHaveBeenCalledWith('s1');
      expect(mockGetPlans).toHaveBeenCalledTimes(1);
      expect(mockGetFeaturesToStore).toHaveBeenCalledTimes(1);
    });
    // Panels take the place of the old tabs — no plan picker tabs anymore
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    // SECTION_TITLE is the page heading (the picker section label is gone)
    expect(screen.getAllByText(esMessages['STORES.PLAN.SECTION_TITLE'])).toHaveLength(1);
    // The free store expands Gratis with the active badge (backend planType)
    expect(screen.getByText('Gratis')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });
});

describe('StorePlanPage — immediate activation, no Guardar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
    seedDefaults();
  });

  it('activates a plan directly: updateStore with union moduleIds + session refresh', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });
    // Expand the target panel to reach its action
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar ese plan' }));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledTimes(1);
    });
    const [id, payload] = mockUpdateStore.mock.calls[0];
    expect(id).toBe('s1');
    // Choosing Pago sends the full union: free (priceIncluded across catalog) + chosen plan
    expect(payload.moduleIds).toEqual([2, 1]);
    expect(payload.name).toBe('Store One');
    expect(payload.paymentStartDate).toBe('2024-01-01');
    expect(mockGetUserByToken).toHaveBeenCalled();
  });

  it('offers no Guardar button anywhere', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Gratis')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it('omits paymentStartDate from the activation payload when the store has none', async () => {
    mockGetStorePlan = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makeStorePlan({ paymentStartDate: null, planType: 'Gratis', modules: [] }),
    });
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar ese plan' }));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledTimes(1);
    });
    const payload = mockUpdateStore.mock.calls[0][1];
    expect(payload.paymentStartDate).toBeUndefined();
  });

  it('surfaces the activation error inline and keeps the panels mounted', async () => {
    mockUpdateStore = vi.fn().mockRejectedValue(new Error('boom'));
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar ese plan' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('Gratis')).toBeInTheDocument();
  });
});

describe('StorePlanPage — DG-7 lock derived from planType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
  });

  it('locks a paid store for a non-super-admin: no activation action, prices still visible', async () => {
    seedDefaults();
    mockGetStorePlan = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makeStorePlan({ planType: 'Pago', modules: [makeStoreModule()] }),
    });
    const { StorePlanPage } = await import('../store-plan');
    await renderPage(makeUser({ isSuperAdmin: false }));

    await waitFor(() => {
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Activar ese plan' })).not.toBeInTheDocument();
    // Prices remain visible on the locked paid plan
    expect(screen.getByText('Module A')).toBeInTheDocument();
  });

  it('keeps activation available for a super-admin on a paid store', async () => {
    seedDefaults();
    mockGetStorePlan = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makeStorePlan({ planType: 'Pago', modules: [makeStoreModule()] }),
    });
    const { StorePlanPage } = await import('../store-plan');
    await renderPage(makeUser({ isSuperAdmin: true }));

    await waitFor(() => {
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Superior/ }));
    expect(screen.getByRole('button', { name: 'Activar ese plan' })).toBeInTheDocument();
  });
});

describe('StorePlanPage — next billing date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser();
    mockParams = {};
    seedDefaults();
  });

  it('shows the next billing date when the store is on a paid plan', async () => {
    mockGetStorePlan = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makeStorePlan({ planType: 'Pago', nextDueDate: '2026-08-01' }),
    });
    await renderPage();

    const banner = await screen.findByTestId('plan-next-billing-date');
    expect(banner).toHaveTextContent(esMessages['STORES.PLAN.NEXT_BILLING_DATE']);
    expect(banner).toHaveTextContent('01/08/2026');
  });

  it('does not show the next billing date on a free plan', async () => {
    mockGetStorePlan = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makeStorePlan({ planType: 'Gratis', nextDueDate: '2026-08-01', modules: [] }),
    });
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Gratis')).toBeInTheDocument();
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
    seedDefaults();
  });

  it('shows STORES.ERROR and mounts no panels when the catalog fails', async () => {
    mockGetPlans = vi.fn().mockRejectedValue(new Error('Catalog error'));
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['STORES.ERROR']);
    });
    expect(screen.queryByText('Gratis')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });
});

describe('StorePlanPage — no selected store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockUser = makeUser({ selectedStoreId: '' });
    mockParams = {};
    seedDefaults();
  });

  it('shows NO_STORE_SELECTED and fetches nothing', async () => {
    const { StorePlanPage } = await import('../store-plan');
    await renderPage(makeUser({ selectedStoreId: '' }));

    await waitFor(() => {
      expect(screen.getByText(esMessages['STORES.NO_STORE_SELECTED'])).toBeInTheDocument();
    });
    expect(mockGetStorePlan).not.toHaveBeenCalled();
    expect(mockGetPlans).not.toHaveBeenCalled();
    expect(mockGetFeaturesToStore).not.toHaveBeenCalled();
  });
});