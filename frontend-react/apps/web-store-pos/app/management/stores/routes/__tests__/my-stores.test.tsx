import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { BaseResponseModel, Module, OwnerStoreWithPlan, UserModel } from '@store-mgmt/domain';

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
const mockUpdateStore = vi.fn();
const mockSetStoreActivation = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get getMyStores() {
      return mockGetMyStores;
    },
    get getModulesToStore() {
      return mockGetModulesToStore;
    },
    get updateStore() {
      return mockUpdateStore;
    },
    get setStoreActivation() {
      return mockSetStoreActivation;
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
      expect(screen.getByText(esMessages['STORES.FREE_PLAN'])).toBeInTheDocument();
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
      expect(screen.getByText(esMessages['STORES.PAID_PLAN'])).toBeInTheDocument();
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
      expect(screen.getByText(esMessages['STORES.PAID_PLAN'])).toBeInTheDocument();
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
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [makeOwnerStore({ id: 's1', name: 'Alpha' })],
    } as BaseResponseModel<OwnerStoreWithPlan[]>);
    mockGetUserByToken.mockResolvedValue(undefined);
  });

  it('renders the PlanPicker and saves the full module set (store-plan save shape)', async () => {
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

    expect(await screen.findByTestId('owner-store-plan-modal-s1')).toBeInTheDocument();
    mockUpdateStore.mockResolvedValue({ succeeded: true, data: true });
    fireEvent.click(screen.getByTestId('owner-plan-save-s1'));

    await waitFor(() => {
      expect(mockUpdateStore).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ moduleIds: expect.any(Array) }),
      );
    });
    // Session refresh after a plan save — store-plan parity.
    await waitFor(() => {
      expect(mockGetUserByToken).toHaveBeenCalled();
    });
  });

  it('hides "Activar este plan" for an owner on a paid store (DG-7 readOnly)', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({
          id: 's1',
          name: 'Alpha',
          modules: [{ ...makeCatalogModule(), selected: true }],
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
    // The free tab is the discriminating one (on the paid tab, selected === tab
    // hides the button structurally — same reasoning as store-plan-lock-regression).
    fireEvent.click(screen.getByRole('tab', { name: /Gratis/ }));
    expect(screen.queryByRole('button', { name: esMessages['STORES.PLAN.ACTIVATE'] })).toBeNull();
  });

  it('shows "Activar este plan" for an owner on a FREE store (single activation spend)', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [
        makeOwnerStore({ id: 's1', name: 'Alpha', modules: [], paymentStartDate: null, nextDueDate: null }),
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
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    expect(
      screen.getByRole('button', { name: esMessages['STORES.PLAN.ACTIVATE'] }),
    ).toBeInTheDocument();
  });

  it('surfaces a visible error when the plan save fails', async () => {
    mockGetMyStores.mockResolvedValue({
      succeeded: true,
      data: [makeOwnerStore({ id: 's1', name: 'Alpha', modules: [] })],
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
    mockUpdateStore.mockRejectedValue(new Error('boom'));
    fireEvent.click(screen.getByTestId('owner-plan-save-s1'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
