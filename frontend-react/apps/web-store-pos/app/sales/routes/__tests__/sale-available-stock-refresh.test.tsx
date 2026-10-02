import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';
import {
  bumpDataRevision,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const mockUser = vi.hoisted(() => ({
  selectedStoreId: 's1',
  storeModuleIds: [] as number[],
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = {
    items: [] as unknown[],
    addItem: vi.fn(),
    updateQuantity: vi.fn(),
    getItemQuantity: vi.fn(() => 0),
    orderType: 1,
  };
  const useCartStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useCartStore };
});

const bm = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

const saleServiceSpies = vi.hoisted(() => ({
  getProductsToSaleByCategoryId: vi.fn(),
  getAvailableProductCategories: vi.fn(),
  getProductByBarcode: vi.fn(),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getProductsToSaleByCategoryId: saleServiceSpies.getProductsToSaleByCategoryId,
    getProductByBarcode: saleServiceSpies.getProductByBarcode,
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableProductCategories: saleServiceSpies.getAvailableProductCategories,
  })),
}));

// The view under test derives its stock badges from `getAvailableQuantity`, so the test
// owns that value instead of seeding real inventory entries. `available` is mutable so a
// sale can be simulated the way the runtime actually performs it: the stored quantity
// changes, then the revision is bumped.
const inventoryState = vi.hoisted(() => ({ available: 10 }));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableQuantity: vi.fn(() => ({
      hasEntries: true,
      available: inventoryState.available,
    })),
  })),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice: vi.fn().mockRejectedValue(new Error('no camera in jsdom')),
  })),
}));

vi.mock('~/shared/lib/toast', () => ({
  showToastError: vi.fn(),
  showToastSuccess: vi.fn(),
}));

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'cat-1', name: 'Bebidas', order: 1, isActive: true, ...overrides };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Coca Cola',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1.5,
    order: 1,
    availableToSale: true,
    // The badge only renders for products that discount inventory, so the fixture under
    // test must opt in — otherwise there is nothing to assert about staleness.
    discountFromInvantory: true,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

import { SalePage } from '../sale';

describe('SalePage — available stock refreshes when a sale is registered', () => {
  beforeEach(() => {
    inventoryState.available = 10;
    mockUser.storeModuleIds = [EModules.Inventory];
    useDataRevisionStore.setState({ revision: 0 });
    saleServiceSpies.getAvailableProductCategories.mockResolvedValue(bm([makeCategory()]));
    saleServiceSpies.getProductsToSaleByCategoryId.mockResolvedValue(bm([makeProduct()]));
    saleServiceSpies.getProductByBarcode.mockResolvedValue(bm(makeProduct()));
  });

  async function renderSale() {
    render(
      <SalePage />,
      { wrapper: Wrapper },
    );
    return screen.findByTestId('available-stock');
  }

  it('recomputes the stock badge from the store when the data revision is bumped', async () => {
    const badge = await renderSale();

    await waitFor(() => expect(badge.textContent).toBe('(10)'));

    // What a registered sale does at runtime: the persisted available quantity drops and
    // OrderOfflineService.createOrder bumps the revision. The view must follow.
    await act(async () => {
      inventoryState.available = 5;
      bumpDataRevision();
    });

    await waitFor(() => expect(screen.getByTestId('available-stock').textContent).toBe('(5)'));
  });

  it('keeps the pre-sale badge while the revision is unchanged, proving the bump is what refreshes it', async () => {
    const badge = await renderSale();
    await waitFor(() => expect(badge.textContent).toBe('(10)'));

    // Same store mutation WITHOUT the bump: a derivation that does not depend on the
    // revision keeps its snapshot. This is the regression this change guards against, so
    // it is asserted as its own case rather than assumed.
    inventoryState.available = 5;

    await act(async () => {});

    expect(screen.getByTestId('available-stock').textContent).toBe('(10)');
  });
});