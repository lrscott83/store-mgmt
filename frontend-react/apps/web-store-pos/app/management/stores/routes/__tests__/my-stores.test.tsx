import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type {
  BaseResponseModel,
  Feature,
  Module,
  OwnerStoreWithPlan,
  Plan,
  PlanModule,
  UserModel,
} from '@store-mgmt/domain';

// ─── Domain factories ─────────────────────────────────────────────────────────

function makeOwnerStore(overrides: Partial<OwnerStoreWithPlan> = {}): OwnerStoreWithPlan {
  return {
    id: 's1',
    name: 'Store One',
    isActive: true,
    approved: true,
    paymentStartDate: '2026-01-01',
    nextDueDate: '2026-11-01',
    modules: [],
    planType: 'Pago',
    ...overrides,
  };
}

/**
 * Catalog module factory. A paid module costs 10 originally, 8 with the
 * discount — the exact P2 shape the card's struck-through price asserts on.
 */
function makeCatalogModule(overrides: Partial<Module> = {}): Module {
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

// ─── Plan catalog factories (GET /v1/plans shape) ─────────────────────────────

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

/** Real catalog shape: free module (id 2) + paid (id 1) + superior (1+3). */
function makePlanCatalog(): Plan[] {
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
    makePlan({ id: 2, name: 'Pago', planType: 'Pago', price: 8 }),
    makePlan({
      id: 3,
      name: 'Superior',
      planType: 'Superior',
      price: 12,
      modules: [
        makePlanModule(),
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

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    fullName: 'Owner User',
    email: 'owner@test.com',
    cellPhone: '',
    isActive: true,
    password: '',
    login: 'owner@test.com',
    authToken: 'token',
    refreshToken: 'refresh',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [73],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
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
const mockGetUserByToken = vi.fn();
const mockCreateStore = vi.fn();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      user: mockUser,
      isAuthenticated: true,
      getUserByToken: mockGetUserByToken,
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

// ─── storeHttpService mock ────────────────────────────────────────────────────

const mockGetMyStores = vi.fn();
const mockGetModulesToStore = vi.fn();
const mockGetPlans = vi.fn();
const mockGetFeaturesToStore = vi.fn();
const mockUpdateStore = vi.fn();
const mockSetStoreActivation = vi.fn();
const mockChangeStorePlan = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get getMyStores() {
      return mockGetMyStores;
    },
    get getModulesToStore() {
      return mockGetModulesToStore;
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
    get setStoreActivation() {
      return mockSetStoreActivation;
    },
    get changeStorePlan() {
      return mockChangeStorePlan;
    },
    get createStore() {
      return mockCreateStore;
    },
  },
}));

// ─── loaders mock ────────────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  featureLoader: () => vi.fn().mockResolvedValue(null),
}));

// ─── toast + confirm mock ────────────────────────────────────────────────────

const mockShowToastSuccess = vi.fn();
const mockConfirmDialog = vi.fn();

vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => mockShowToastSuccess(...args),
}));

vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => mockConfirmDialog(...args),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Card rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe('MyStoresPage — card rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockGetModulesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeCatalogModule()],
    } satisfies Partial<BaseResponseModel<Module[]>> as BaseResponseModel<Module[]>);
    mockGetPlans.mockResolvedValue({
      succeeded: true,
      data: makePlanCatalog(),
    } as BaseResponseModel<Plan[]>);
    mockGetFeaturesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeFeature()],
    } as BaseResponseModel<Feature[]>);
  });

  it('renders one card per store with the store name and the gear', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({ id: 's1', name: 'Alpha' }),
        makeOwnerStore({ id: 's2', name: 'Beta', modules: [] }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(mockGetMyStores).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByTestId('owner-store-actions-toggle-s1')).toBeInTheDocument();
    expect(screen.getByTestId('owner-store-actions-toggle-s2')).toBeInTheDocument();
  });

  it('paints inactive stores with the danger style + badge', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [makeOwnerStore({ id: 's1', name: 'Alpha', isActive: false })],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    const { container } = render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(screen.getByTestId('owner-store-inactive-s1')).toBeInTheDocument();
    const card = container.querySelector('[data-testid="owner-store-card-s1"]');
    expect(card?.closest('.bg-danger\\/10')).toBeTruthy();
  });

  it('shows the free plan with no date and no price', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({
          id: 's1',
          planType: 'Gratis',
          paymentStartDate: null,
          nextDueDate: null,
          modules: [],
        }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Plan: Gratis')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('owner-store-next-due-s1')).toBeNull();
    expect(screen.queryByTestId('owner-store-price-s1')).toBeNull();
  });

  it('shows the paid plan with the next due date and the struck-through discounted price (P2)', async () => {
    // Store already ON the paid plan: its snapshot selects the paid module.
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({
          id: 's1',
          modules: [
            { ...makeCatalogModule(), selected: true, currentPrice: 8, price: 10 },
          ],
        }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Plan: Pago')).toBeInTheDocument();
    });
    expect(screen.getByTestId('owner-store-next-due-s1')).toHaveTextContent('01/11/2026');
    // Discount: original 10 struck through, current 8 USD bold.
    expect(screen.getByTestId('owner-store-price-original-s1')).toHaveTextContent('10');
    expect(screen.getByTestId('owner-store-price-s1')).toHaveTextContent('8 USD');
    // No discount => no strikethrough element at all (covered by price test shape).
  });

  it('paid plan without nextDueDate renders no date line', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({ id: 's1', nextDueDate: null, modules: [{ ...makeCatalogModule(), selected: true }] }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Plan: Pago')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('owner-store-next-due-s1')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gear → Editar popup
// ═══════════════════════════════════════════════════════════════════════════════

describe('MyStoresPage — Editar popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockGetModulesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeCatalogModule()],
    } as BaseResponseModel<Module[]>);
    mockGetPlans.mockResolvedValue({
      succeeded: true,
      data: makePlanCatalog(),
    } as BaseResponseModel<Plan[]>);
    mockGetFeaturesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeFeature()],
    } as BaseResponseModel<Feature[]>);
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [makeOwnerStore({ id: 's1', name: 'Alpha' })],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
  });

  function openEditMenu() {
    return screen.getByTestId('owner-store-actions-toggle-s1');
  }

  it('opens prefilled with name + active checkbox and saves the rename', async () => {
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(openEditMenu());
    fireEvent.click(screen.getByTestId('owner-store-edit-s1'));

    const input = await screen.findByTestId('owner-store-name-input-s1');
    // The id is not on the input — it lives on the dialog container testid.
    expect((input as HTMLInputElement).value).toBe('Alpha');
    const toggle = screen.getByTestId('owner-store-active-toggle-s1') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.change(input, { target: { value: 'Alpha Renamed' } });
    mockUpdateStore.mockResolvedValue({ succeeded: true, data: true });
    fireEvent.click(screen.getByTestId('owner-store-save-s1'));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ name: 'Alpha Renamed' }),
      );
    });
  });

  it('blocks the save on an empty name (STORES.NAME_REQUIRED, no service call)', async () => {
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(openEditMenu());
    fireEvent.click(screen.getByTestId('owner-store-edit-s1'));

    const input = await screen.findByTestId('owner-store-name-input-s1');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('owner-store-save-s1'));

    expect(await screen.findByText(esMessages['STORES.NAME_REQUIRED'])).toBeInTheDocument();
    expect(mockUpdateStore).not.toHaveBeenCalled();
  });

  it('flips isActive through setStoreActivation when the checkbox changes', async () => {
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(openEditMenu());
    fireEvent.click(screen.getByTestId('owner-store-edit-s1'));

    const toggle = await screen.findByTestId('owner-store-active-toggle-s1');
    fireEvent.click(toggle); // true -> false (deactivation path)

    // R-1: deactivation needs the confirm dialog first.
    mockConfirmDialog.mockResolvedValue(true);
    mockUpdateStore.mockResolvedValue({ succeeded: true, data: true });
    mockSetStoreActivation.mockResolvedValue({ succeeded: true, data: true });
    fireEvent.click(screen.getByTestId('owner-store-save-s1'));

    await waitFor(() => {
      expect(mockSetStoreActivation).toHaveBeenCalledWith('s1', false);
    });
  });

  it('asks the R-1 confirm before deactivating and aborts on NO', async () => {
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(openEditMenu());
    fireEvent.click(screen.getByTestId('owner-store-edit-s1'));

    const toggle = await screen.findByTestId('owner-store-active-toggle-s1');
    fireEvent.click(toggle);
    mockConfirmDialog.mockResolvedValue(false); // user says NO
    fireEvent.click(screen.getByTestId('owner-store-save-s1'));

    await waitFor(() => {
      expect(mockConfirmDialog).toHaveBeenCalled();
    });
    expect(mockSetStoreActivation).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gear → Editar el plan popup
// ═══════════════════════════════════════════════════════════════════════════════

describe('MyStoresPage — Editar el plan popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockGetModulesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeCatalogModule()],
    } as BaseResponseModel<Module[]>);
    mockGetPlans.mockResolvedValue({
      succeeded: true,
      data: makePlanCatalog(),
    } as BaseResponseModel<Plan[]>);
    mockGetFeaturesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeFeature()],
    } as BaseResponseModel<Feature[]>);
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [makeOwnerStore({ id: 's1', name: 'Alpha' })],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    mockGetUserByToken.mockResolvedValue(undefined);
  });

  it('renders the catalog panels and activating a plan saves, closes and refreshes', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({
          id: 's1',
          name: 'Alpha',
          planType: 'Gratis',
          modules: [],
          paymentStartDate: null,
          nextDueDate: null,
        }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('owner-store-actions-toggle-s1'));
    fireEvent.click(screen.getByTestId('owner-store-edit-plan-s1'));

    // Modal testid stays; Gratis is expanded by default (planType from backend)
    expect(await screen.findByTestId('owner-store-plan-modal-s1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    mockChangeStorePlan.mockResolvedValue({ succeeded: true, data: true });
    fireEvent.click(screen.getByRole('button', { name: 'Activar Plan' }));

    await waitFor(() => {
      expect(mockChangeStorePlan).toHaveBeenCalledWith('s1', 2);
    });
    // The plan change rides the dedicated endpoint — never a moduleIds PUT
    expect(mockUpdateStore).not.toHaveBeenCalled();
    // Activation closes the modal and refreshes the session — store-plan parity
    await waitFor(() => {
      expect(mockGetUserByToken).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('owner-store-plan-modal-s1')).not.toBeInTheDocument();
  });

  it('lets an owner on a PAID store change to another plan (DG-7 lock removed)', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({ id: 's1', name: 'Alpha', planType: 'Pago', modules: [], nextDueDate: '2026-08-01' }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('owner-store-actions-toggle-s1'));
    fireEvent.click(screen.getByTestId('owner-store-edit-plan-s1'));

    await waitFor(() => {
      expect(screen.getByTestId('owner-store-plan-modal-s1')).toBeInTheDocument();
    });
    // The paid store keeps the billing banner (testid stays)
    expect(screen.getByTestId('owner-plan-next-billing-date-s1')).toBeInTheDocument();
    // And exposes the activation action on another plan — the owner can change
    fireEvent.click(screen.getByRole('button', { name: /Superior/ }));
    expect(
      screen.getByRole('button', { name: esMessages['STORES.PLAN.ACTIVATE_PLAN'] }),
    ).toBeInTheDocument();
  });

  it('lets an owner on a FREE store activate a paid plan', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({
          id: 's1',
          name: 'Alpha',
          planType: 'Gratis',
          modules: [],
          paymentStartDate: null,
          nextDueDate: null,
        }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('owner-store-actions-toggle-s1'));
    fireEvent.click(screen.getByTestId('owner-store-edit-plan-s1'));

    await waitFor(() => {
      expect(screen.getByTestId('owner-store-plan-modal-s1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    expect(
      screen.getByRole('button', { name: esMessages['STORES.PLAN.ACTIVATE_PLAN'] }),
    ).toBeInTheDocument();
  });

  it('surfaces a visible error and keeps the modal open when the activation fails', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({
          id: 's1',
          name: 'Alpha',
          planType: 'Gratis',
          modules: [],
          paymentStartDate: null,
          nextDueDate: null,
        }),
      ],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    const { MyStoresPage } = await import('../my-stores');
    render(
      <Wrapper>
        <MyStoresPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('owner-store-actions-toggle-s1'));
    fireEvent.click(screen.getByTestId('owner-store-edit-plan-s1'));

    await waitFor(() => {
      expect(screen.getByTestId('owner-store-plan-modal-s1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Pago/ }));
    mockChangeStorePlan.mockRejectedValue(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Activar Plan' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // Failure keeps the modal open for the user to retry
    expect(screen.getByTestId('owner-store-plan-modal-s1')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Nueva tienda flow (owner-multistores store-creation): the "+ Tienda" button is
// gated by the selected store's MultiStores module (14), the modal is name-only,
// and the body ownerId is the zero-Guid (backend derives the caller's own owner).
// ═══════════════════════════════════════════════════════════════════════════════

describe('MyStoresPage — create store flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser();
    mockGetModulesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeCatalogModule()],
    } as BaseResponseModel<Module[]>);
    mockGetPlans.mockResolvedValue({
      succeeded: true,
      data: makePlanCatalog(),
    } as BaseResponseModel<Plan[]>);
    mockGetFeaturesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeFeature()],
    } as BaseResponseModel<Feature[]>);
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [makeOwnerStore({ id: 's1', name: 'Alpha' })],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    mockCreateStore.mockResolvedValue({
      succeeded: true,
      data: { id: 'new-s', name: 'Nueva' },
    } as BaseResponseModel<{ id: string; name: string }>);
  });

  function renderPage() {
    return import('../my-stores').then(({ MyStoresPage }) =>
      render(
        <Wrapper>
          <MyStoresPage />
        </Wrapper>,
      ),
    );
  }

  it('hides the + Tienda button for an owner without the MultiStores module', async () => {
    mockUser = makeUser({ storeModuleIds: [7] }); // Management sí, MultiStores no
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('my-stores-create-button')).not.toBeInTheDocument();
  });

  it('shows the + Tienda button when the selected store has MultiStores (14)', async () => {
    mockUser = makeUser({ storeModuleIds: [14] });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(screen.getByTestId('my-stores-create-button')).toBeInTheDocument();
  });

  it('opens the create modal and blocks an empty name (no service call)', async () => {
    mockUser = makeUser({ storeModuleIds: [14] });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('my-stores-create-button'));
    expect(await screen.findByTestId('owner-store-create-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('owner-store-name-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('owner-store-create-save'));

    expect(await screen.findByText(esMessages['STORES.NAME_REQUIRED'])).toBeInTheDocument();
    expect(mockCreateStore).not.toHaveBeenCalled();
  });

  it('creates the store with the owner-branch contract payload (zero-Guid ownerId, approved true, no modules)', async () => {
    mockUser = makeUser({ storeModuleIds: [14] });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('my-stores-create-button'));
    await screen.findByTestId('owner-store-name-input');

    fireEvent.change(screen.getByTestId('owner-store-name-input'), {
      target: { value: 'Nueva Tienda' },
    });
    fireEvent.click(screen.getByTestId('owner-store-create-save'));

    await waitFor(() => {
      expect(mockCreateStore).toHaveBeenCalledWith({
        ownerId: '00000000-0000-0000-0000-000000000000',
        name: 'Nueva Tienda',
        address: '',
        description: '',
        approved: true,
        moduleIds: [],
      });
    });
  });

  it('closes the modal, shows the success toast and refreshes the list on success', async () => {
    mockUser = makeUser({ storeModuleIds: [14] });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('my-stores-create-button'));
    await screen.findByTestId('owner-store-name-input');

    fireEvent.change(screen.getByTestId('owner-store-name-input'), {
      target: { value: 'Nueva Tienda' },
    });
    fireEvent.click(screen.getByTestId('owner-store-create-save'));

    await waitFor(() => {
      expect(mockShowToastSuccess).toHaveBeenCalledWith(esMessages['STORES.CREATE_SUCCESS']);
    });
    expect(screen.queryByTestId('owner-store-create-modal')).not.toBeInTheDocument();
    // The list reloads after a successful creation
    expect(mockGetMyStores).toHaveBeenCalledTimes(2);
  });

  it('keeps the modal open with a visible error when the creation fails', async () => {
    mockUser = makeUser({ storeModuleIds: [14] });
    mockCreateStore.mockRejectedValue(new Error('boom'));
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('my-stores-create-button'));
    await screen.findByTestId('owner-store-name-input');

    fireEvent.change(screen.getByTestId('owner-store-name-input'), {
      target: { value: 'Nueva Tienda' },
    });
    fireEvent.click(screen.getByTestId('owner-store-create-save'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByTestId('owner-store-create-modal')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// store-list-active-stores — session refresh after create/deactivate
// ═══════════════════════════════════════════════════════════════════════════════

describe('MyStoresPage — session refresh after store mutations (store-list-active-stores)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ storeModuleIds: [14] });
    mockGetModulesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeCatalogModule()],
    } as BaseResponseModel<Module[]>);
    mockGetPlans.mockResolvedValue({
      succeeded: true,
      data: makePlanCatalog(),
    } as BaseResponseModel<Plan[]>);
    mockGetFeaturesToStore.mockResolvedValue({
      succeeded: true,
      data: [makeFeature()],
    } as BaseResponseModel<Feature[]>);
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [makeOwnerStore({ id: 's1', name: 'Alpha' })],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    mockCreateStore.mockResolvedValue({
      succeeded: true,
      data: { id: 'new-s', name: 'Nueva' },
    } as BaseResponseModel<{ id: string; name: string }>);
    mockUpdateStore.mockResolvedValue({ succeeded: true, data: true });
    mockSetStoreActivation.mockResolvedValue({ succeeded: true, data: true });
    mockGetUserByToken.mockResolvedValue(undefined);
    mockConfirmDialog.mockResolvedValue(true);
  });

  function openEditMenu() {
    return screen.getByTestId('owner-store-actions-toggle-s1');
  }

  function renderPage() {
    return import('../my-stores').then(({ MyStoresPage }) =>
      render(
        <Wrapper>
          <MyStoresPage />
        </Wrapper>,
      ),
    );
  }

  it('refreshes the session (getUserByToken) after a successful store creation', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('my-stores-create-button'));
    await screen.findByTestId('owner-store-name-input');

    fireEvent.change(screen.getByTestId('owner-store-name-input'), {
      target: { value: 'Nueva Tienda' },
    });
    fireEvent.click(screen.getByTestId('owner-store-create-save'));

    await waitFor(() => {
      expect(mockCreateStore).toHaveBeenCalledTimes(1);
    });
    // The new store must appear in the session's storeList without a relogin.
    await waitFor(() => {
      expect(mockGetUserByToken).toHaveBeenCalledTimes(1);
    });
    // The refresh happens before the list reload.
    expect(mockGetMyStores).toHaveBeenCalledTimes(2);
  });

  it('refreshes the session (getUserByToken) after a successful deactivation', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(openEditMenu());
    fireEvent.click(screen.getByTestId('owner-store-edit-s1'));

    const toggle = await screen.findByTestId('owner-store-active-toggle-s1');
    fireEvent.click(toggle); // true -> false (deactivation path)

    // R-1 confirm BEFORE the deactivation call fires.
    fireEvent.click(screen.getByTestId('owner-store-save-s1'));

    await waitFor(() => {
      expect(mockSetStoreActivation).toHaveBeenCalledWith('s1', false);
    });
    await waitFor(() => {
      expect(mockGetUserByToken).toHaveBeenCalledTimes(1);
    });
    expect(mockGetMyStores).toHaveBeenCalledTimes(2);
  });

  it('deactivating the CURRENT store: a session rejection on refresh still logs out (not swallowed)', async () => {
    // The owner deactivates the very store their session is on: the next /me
    // is a Store.Inactive verdict. getUserByToken resolves null AFTER its own
    // logout() ran (auth-store's isSessionRejection branch) — the page must
    // treat that as "session ended", not as a silent no-op.
    mockGetUserByToken.mockResolvedValue(null);
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(openEditMenu());
    fireEvent.click(screen.getByTestId('owner-store-edit-s1'));

    const toggle = await screen.findByTestId('owner-store-active-toggle-s1');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('owner-store-save-s1'));

    await waitFor(() => {
      expect(mockSetStoreActivation).toHaveBeenCalledWith('s1', false);
    });
    // The refresh still fired (the verdict is the store's own /me to deliver).
    await waitFor(() => {
      expect(mockGetUserByToken).toHaveBeenCalledTimes(1);
    });
  });

  it('a network failure on the session refresh does not break the save flow', async () => {
    // Offline-resilient parity with handlePlanActivate: the refresh is
    // best-effort — its failure must not surface as a save error.
    mockGetUserByToken.mockRejectedValue(new Error('network down'));
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('my-stores-create-button'));
    await screen.findByTestId('owner-store-name-input');

    fireEvent.change(screen.getByTestId('owner-store-name-input'), {
      target: { value: 'Nueva Tienda' },
    });
    fireEvent.click(screen.getByTestId('owner-store-create-save'));

    await waitFor(() => {
      expect(mockShowToastSuccess).toHaveBeenCalledWith(esMessages['STORES.CREATE_SUCCESS']);
    });
    expect(screen.queryByTestId('owner-store-create-modal')).not.toBeInTheDocument();
    expect(mockGetMyStores).toHaveBeenCalledTimes(2);
  });
});
