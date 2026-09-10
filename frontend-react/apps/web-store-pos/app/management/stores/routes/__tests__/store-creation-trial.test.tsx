import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store, Owner, UserModel, Plan, PlanModule } from '@store-mgmt/domain';

// ═══════════════════════════════════════════════════════════════════════════════
// Trial-on-create contract (client side)
//
// Business rule: EVERY store, created through ANY path, starts its billing clock
// at the creation date — `PaymentStartDate = today` — which yields 1 free trial
// month, first charge after the second month, 5 grace days
// (`StoreBillingUtils.GetNextDueDate` = start + trialMonths + 1).
//
// The clock is owned by the SERVER (`CreateStoreService`). The client's whole
// contribution to the invariant is to NOT interfere: it must never send a
// client-computed `paymentStartDate` on create, and must never expose a create-
// mode field that would let a human seed one. These tests lock that boundary so
// a future "helpful" change cannot start the clock from the browser clock —
// which would be wrong for any user whose device clock or timezone is off.
// ═══════════════════════════════════════════════════════════════════════════════

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
    paymentStartDate: '2026-08-04',
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
    selectedStoreId: '',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function makePlanModule(overrides: Partial<PlanModule> = {}): PlanModule {
  return {
    moduleId: 2,
    name: 'Management',
    order: 1,
    priceIncluded: true,
    price: 0,
    currentPrice: 0,
    discountPrice: 0,
    percentDiscountPrice: 0,
    discountText: '',
    featureDescriptions: [],
    ...overrides,
  };
}

/** The three active plans; Superior (id 3) carries the full catalog member set. */
function makePlanCatalog(): Plan[] {
  return [
    {
      id: 1,
      name: 'Gratis',
      order: 1,
      planType: 'Gratis',
      price: 0,
      modules: [makePlanModule()],
    },
    { id: 2, name: 'Pago', order: 2, planType: 'Pago', price: 8, modules: [] },
    {
      id: 3,
      name: 'Superior',
      order: 3,
      planType: 'Superior',
      price: 12,
      modules: [
        makePlanModule({ moduleId: 2 }),
        makePlanModule({ moduleId: 3, name: 'Warehouses' }),
        makePlanModule({ moduleId: 4, name: 'MultiStores' }),
      ],
    },
  ];
}

let mockUser: UserModel | null = makeUser();
const mockUpdateUser = vi.fn();
const mockGetUserByToken = vi.fn();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      user: mockUser,
      isAuthenticated: true,
      updateUser: mockUpdateUser,
      getUserByToken: mockGetUserByToken,
    };
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

const mockListStores = vi.fn();
let mockGetStore = vi.fn();
let mockCreateStore = vi.fn();
const mockUpdateStore = vi.fn();
let mockListOwners = vi.fn();
let mockGetPlans = vi.fn();

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    get listStores() {
      return mockListStores;
    },
    get getStore() {
      return mockGetStore;
    },
    get createStore() {
      return mockCreateStore;
    },
    get updateStore() {
      return mockUpdateStore;
    },
    get listOwners() {
      return mockListOwners;
    },
    get getPlans() {
      return mockGetPlans;
    },
  },
}));

const mockNavigate = vi.fn();
let mockParams: Record<string, string> = {};

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

/** Fills the minimum valid create-mode form and submits. */
async function submitCreateForm(name: string) {
  await waitFor(() => screen.getByLabelText('Nombre'));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Propietario'), { target: { value: 'o1' } });
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
}

// ─── The clock is never seeded from the client ────────────────────────────────

describe('Store creation — client never sends paymentStartDate (server owns the trial clock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    mockParams = {};
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [makeOwner()] });
    mockCreateStore = vi.fn().mockResolvedValue({ succeeded: true, data: makeStore() });
    mockGetPlans = vi.fn().mockResolvedValue({ succeeded: true, data: makePlanCatalog() });
  });

  it('omits paymentStartDate from the create payload entirely', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(
      <Wrapper>
        <EditStorePage />
      </Wrapper>,
    );
    await submitCreateForm('New Store');

    await waitFor(() => expect(mockCreateStore).toHaveBeenCalledTimes(1));
    const payload = mockCreateStore.mock.calls[0][0];
    // Absent, not merely null/empty: the server must see no opinion at all.
    expect(Object.keys(payload)).not.toContain('paymentStartDate');
  });

  it('sends exactly the five data fields plus Superior birth moduleIds — no billing field smuggled in', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(
      <Wrapper>
        <EditStorePage />
      </Wrapper>,
    );
    await submitCreateForm('New Store');

    await waitFor(() => expect(mockCreateStore).toHaveBeenCalledTimes(1));
    // Plan split: create carries store DATA plus birth provisioning. The store
    // is created on the Superior plan — the container resolves its member
    // module ids once from GET /v1/plans and sends them (the backend requires
    // a non-empty moduleIds and grants exactly those modules).
    expect(Object.keys(mockCreateStore.mock.calls[0][0]).sort()).toEqual([
      'address',
      'approved',
      'description',
      'moduleIds',
      'name',
      'ownerId',
    ]);
    expect(mockCreateStore.mock.calls[0][0].moduleIds).toEqual([2, 3, 4]);
  });

  it('shows no plan UI and sends the Superior plan birth moduleIds on create', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(
      <Wrapper>
        <EditStorePage />
      </Wrapper>,
    );
    await submitCreateForm('Paid Store');

    await waitFor(() => expect(mockCreateStore).toHaveBeenCalledTimes(1));
    const payload = mockCreateStore.mock.calls[0][0];
    expect(payload.moduleIds).toEqual([2, 3, 4]);
    expect(Object.keys(payload)).not.toContain('paymentStartDate');
    // Plan split: the plan UI lives on the plan page/modal, never in the form.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar este plan' })).not.toBeInTheDocument();
  });
});

// ─── No create-mode field can seed the clock ──────────────────────────────────

describe('Store creation — no payment-start-date field is reachable in create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [makeOwner()] });
    mockCreateStore = vi.fn().mockResolvedValue({ succeeded: true, data: makeStore() });
    mockGetPlans = vi.fn().mockResolvedValue({ succeeded: true, data: makePlanCatalog() });
  });

  it('hides the field from a super admin in create mode (the strongest role)', async () => {
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    const { EditStorePage } = await import('../edit-store');
    render(
      <Wrapper>
        <EditStorePage />
      </Wrapper>,
    );
    await waitFor(() => screen.getByLabelText('Nombre'));

    expect(screen.queryByLabelText('Fecha de inicio de pago')).not.toBeInTheDocument();
  });

  it('hides the field from an owner admin in create mode (triangulation)', async () => {
    mockUser = makeUser({
      isSuperAdmin: false,
      isOwnerAdmin: true,
      featureIds: [73],
      selectedStoreId: '',
    });
    const { EditStorePage } = await import('../edit-store');
    render(
      <Wrapper>
        <EditStorePage />
      </Wrapper>,
    );
    await waitFor(() => screen.getByLabelText('Nombre'));

    expect(screen.queryByLabelText('Fecha de inicio de pago')).not.toBeInTheDocument();
  });
});

// ─── The server's answer is trusted verbatim ──────────────────────────────────

describe('Store creation — server-assigned trial state is read back unmodified', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: 's1' });
    mockParams = { id: 's1' };
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [makeOwner()] });
  });

  it('pre-fills the edit form with the paymentStartDate the server assigned at creation', async () => {
    mockGetStore = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makeStore({ paymentStartDate: '2026-08-04' }),
    });
    const { EditStorePage } = await import('../edit-store');
    render(
      <Wrapper>
        <EditStorePage />
      </Wrapper>,
    );

    await waitFor(() => screen.getByLabelText('Fecha de inicio de pago'));
    expect(screen.getByLabelText('Fecha de inicio de pago')).toHaveValue('2026-08-04');
  });
});
