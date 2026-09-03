import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { UserModel } from '@store-mgmt/domain';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    fullName: 'Luis Scott',
    email: 'lrscott@test.com',
    cellPhone: '+54911',
    isActive: true,
    password: '',
    login: 'lrscott',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 35 * 24 * 60 * 60 * 1000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

let mockUser: UserModel | null = null;
let mockHasOrders = false;
let mockGetStateUser: UserModel | null = null;

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = Object.assign(
    vi.fn((selector?: (s: { user: UserModel | null }) => unknown) => {
      const state = { user: mockUser };
      if (typeof selector === 'function') return selector(state);
      return state;
    }),
    {
      getState: () => ({ user: mockGetStateUser }),
    },
  );
  return { useAuthStore };
});

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: class {
    constructor(private readonly storeId: string) {
      void storeId;
    }
    getStorageOrders() {
      // Return an array with a fake entry when the store is "seeded", so the
      // component's `length > 0` check drives visibility.
      return mockHasOrders ? [{}] : [];
    }
  },
}));

vi.mock('~/shared/lib/dev/demo-data-generator', () => ({
  seedDemoDataForStore: vi.fn(() => ({
    ok: true,
    message: 'ok',
    ordersCreated: 0,
    expensesCreated: 0,
  })),
}));

async function renderButton() {
  const { DemoSeedButton } = await import('../demo-seed-button');
  return render(<DemoSeedButton />);
}

describe('DemoSeedButton — visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockHasOrders = false;
    mockGetStateUser = null;
  });

  it('renders nothing for a non-dev login even with a store selected', async () => {
    mockUser = makeUser({ login: 'jperez' });
    const { container } = await renderButton();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no store is selected', async () => {
    mockUser = makeUser({ selectedStoreId: '' });
    const { container } = await renderButton();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the button for the dev login on an empty store', async () => {
    mockUser = makeUser();
    const { container } = await renderButton();
    // The storage read resolves in an effect, so flush it to settle hasOrders.
    await act(async () => {});
    expect(screen.getByRole('button', { name: /generar datos demo/i })).toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });

  it('hides the button once the store already has orders (demo generated or real)', async () => {
    mockUser = makeUser();
    mockHasOrders = true;
    const { container } = await renderButton();
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('reappears after a Limpiar wipes the orders (hasOrders flips back to false)', async () => {
    mockUser = makeUser();

    // Seeded now.
    mockHasOrders = true;
    const first = await renderButton();
    await act(async () => {});
    expect(first.container).toBeEmptyDOMElement();

    // Limpiar wipes the orders entity -> an empty read.
    mockHasOrders = false;
    first.unmount();

    const again = await renderButton();
    await act(async () => {});
    expect(screen.getByRole('button', { name: /generar datos demo/i })).toBeInTheDocument();
    expect(again.container).not.toBeEmptyDOMElement();
  });
});
