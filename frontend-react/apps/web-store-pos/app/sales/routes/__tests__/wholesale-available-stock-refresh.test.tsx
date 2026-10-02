import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import {
  bumpDataRevision,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  login: 'jdoe',
  isOwnerAdmin: true,
  featureIds: [],
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  const useAuthStore = Object.assign(
    vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    }),
    { getState: () => ({ logout: vi.fn() }) },
  );
  return { useAuthStore };
});

const cartStateMock = vi.hoisted(() => ({
  items: [] as unknown[],
  orderType: 2 as number, // OrderType.Mayorista
}));

vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = {
    get items() {
      return cartStateMock.items;
    },
    get orderType() {
      return cartStateMock.orderType;
    },
    addItem: vi.fn(),
    getItemQuantity: vi.fn(() => 0),
  };
  const useCartStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useCartStore };
});

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
  showBlockingInfoHtml: vi.fn(),
}));

vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
}));

vi.mock('~/shared/lib/auth/authorization-service', () => ({
  hasInventoryModuleAvailable: () => true,
  hasMultiPaymentsModuleAvailable: () => false,
}));

// Mutable so a sale can be simulated the way the runtime performs it: the persisted
// available quantity drops and OrderOfflineService.createOrder bumps the revision.
const inventoryState = vi.hoisted(() => ({ available: 96 }));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableQuantity: vi.fn(() => ({
      hasEntries: true,
      available: inventoryState.available,
    })),
  })),
}));

vi.mock('../../components/scanner-modal', () => ({
  ScannerModal: vi.fn(),
}));

const bm = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

let mockCategories: ProductCategory[] = [];
let mockProducts: Product[] = [];

vi.mock('~/sales/lib/services/product-service.factory', () => ({
  createProductService: () => ({
    getProductsToSaleByCategoryId: vi.fn(async (categoryId: string) =>
      bm(mockProducts.filter((p) => p.categoryId === categoryId)),
    ),
    getProductByBarcode: vi.fn(async () => bm(null)),
  }),
}));

vi.mock('~/sales/lib/services/product-category-service.factory', () => ({
  createProductCategoryService: () => ({
    getAvailableProductCategories: async () => bm(mockCategories),
  }),
}));

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'cat-1', name: 'Bebidas', order: 1, isActive: true, ...overrides };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Cerveza',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 700,
    order: 0,
    availableToSale: true,
    // The availability badge only renders for a wholesale product that also discounts
    // inventory, and the route filters on enabled + pack size + tiers, so the fixture
    // under test must satisfy all three or there is nothing to assert.
    discountFromInvantory: true,
    wholesaleEnabled: true,
    wholesalePackSize: 24,
    wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }],
    businessId: '',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

import { WholesalePage } from '../wholesale';

describe('WholesalePage — available stock refreshes when a sale is registered', () => {
  beforeEach(() => {
    inventoryState.available = 96;
    cartStateMock.items = [];
    useDataRevisionStore.setState({ revision: 0 });
    mockCategories = [makeCategory()];
    mockProducts = [makeProduct()];
  });

  async function renderWholesale() {
    render(<WholesalePage />, {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
          {children}
        </IntlProvider>
      ),
    });
    return screen.findByTestId('available-stock');
  }

  it('recomputes the availability badge when the data revision is bumped', async () => {
    const badge = await renderWholesale();
    await waitFor(() => expect(badge.textContent).toBe('(96)'));

    // Four packs of 24 units: what a registered wholesale sale does to the stored stock.
    await act(async () => {
      inventoryState.available = 0;
      bumpDataRevision();
    });

    await waitFor(() => expect(screen.getByTestId('available-stock').textContent).toBe('(0)'));
  });

  it('keeps the pre-sale badge while the revision is unchanged', async () => {
    const badge = await renderWholesale();
    await waitFor(() => expect(badge.textContent).toBe('(96)'));

    // Same store mutation WITHOUT the bump. Asserted as its own case because it is the
    // exact regression this change guards: nothing else re-renders this view after a sale.
    inventoryState.available = 0;

    await act(async () => {});

    expect(screen.getByTestId('available-stock').textContent).toBe('(96)');
  });
});