import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store, Module, Owner, UserModel } from '@store-mgmt/domain';

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
    mockGetModulesToStore = vi.fn().mockResolvedValue({
      succeeded: true,
      data: [makeModule({ id: 1, priceIncluded: true }), makeModule({ id: 2, priceIncluded: false })],
    });
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [makeOwner()] });
    mockCreateStore = vi.fn().mockResolvedValue({ succeeded: true, data: makeStore() });
  });

  it('omits paymentStartDate from the create payload entirely', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await submitCreateForm('New Store');

    await waitFor(() => expect(mockCreateStore).toHaveBeenCalledTimes(1));
    const payload = mockCreateStore.mock.calls[0][0];
    // Absent, not merely null/empty: the server must see no opinion at all.
    expect(Object.keys(payload)).not.toContain('paymentStartDate');
  });

  it('sends exactly the six create fields — no billing field smuggled in', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await submitCreateForm('New Store');

    await waitFor(() => expect(mockCreateStore).toHaveBeenCalledTimes(1));
    expect(Object.keys(mockCreateStore.mock.calls[0][0]).sort()).toEqual([
      'address',
      'approved',
      'description',
      'moduleIds',
      'name',
      'ownerId',
    ]);
  });

  it('still omits paymentStartDate when the paid plan is chosen at creation', async () => {
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    // The create-mode form mounts before the catalog resolves, and PlanPicker's
    // effect resets the active tab when `modules` arrives (plan-picker.tsx:38).
    // Wait for the catalog+owners batch to land before touching the picker,
    // otherwise that reset silently undoes the tab switch.
    await waitFor(() => expect(screen.getByRole('option', { name: 'Owner One' })).toBeInTheDocument());

    // Switch to the paid tab and activate it, so moduleIds carries a paid module.
    fireEvent.click(screen.getByRole('tab', { name: /^Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));

    await submitCreateForm('Paid Store');

    await waitFor(() => expect(mockCreateStore).toHaveBeenCalledTimes(1));
    const payload = mockCreateStore.mock.calls[0][0];
    expect(payload.moduleIds).toContain(2);
    expect(Object.keys(payload)).not.toContain('paymentStartDate');
  });
});

// ─── No create-mode field can seed the clock ──────────────────────────────────

describe('Store creation — no payment-start-date field is reachable in create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
    mockGetModulesToStore = vi.fn().mockResolvedValue({ succeeded: true, data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [makeOwner()] });
    mockCreateStore = vi.fn().mockResolvedValue({ succeeded: true, data: makeStore() });
  });

  it('hides the field from a super admin in create mode (the strongest role)', async () => {
    mockUser = makeUser({ isSuperAdmin: true, selectedStoreId: '' });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
    await waitFor(() => screen.getByLabelText('Nombre'));

    expect(screen.queryByLabelText('Fecha de inicio de pago')).not.toBeInTheDocument();
  });

  it('hides the field from an owner admin in create mode (triangulation)', async () => {
    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: true, featureIds: [73], selectedStoreId: '' });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);
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
    mockGetModulesToStore = vi.fn().mockResolvedValue({ succeeded: true, data: [makeModule()] });
    mockListOwners = vi.fn().mockResolvedValue({ succeeded: true, data: [makeOwner()] });
  });

  it('pre-fills the edit form with the paymentStartDate the server assigned at creation', async () => {
    mockGetStore = vi.fn().mockResolvedValue({
      succeeded: true,
      data: makeStore({ paymentStartDate: '2026-08-04' }),
    });
    const { EditStorePage } = await import('../edit-store');
    render(<Wrapper><EditStorePage /></Wrapper>);

    await waitFor(() => screen.getByLabelText('Fecha de inicio de pago'));
    expect(screen.getByLabelText('Fecha de inicio de pago')).toHaveValue('2026-08-04');
  });
});
