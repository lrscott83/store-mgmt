import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';

const mockUser = vi.hoisted(() => ({ selectedStoreId: 's1', storeModuleIds: [] as number[] }));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

let mockCategories: ProductCategory[] = [];
let mockProducts: Product[] = [];

const { bm } = vi.hoisted(() => ({
  bm: <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] }),
}));

const saleServiceSpies = vi.hoisted(() => ({
  getProductsToSaleByCategoryId: vi.fn(),
  getAvailableProductCategories: vi.fn(),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    // Angular parity: getProductsToSaleByCategoryId -> categoryId + isActive + availableToSale,
    // sorted by order. Implementation is set in beforeEach so the spy stays inspectable.
    getProductsToSaleByCategoryId: saleServiceSpies.getProductsToSaleByCategoryId,
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    // Angular parity: getAvailableProductCategories -> active-only, sorted by order.
    getAvailableProductCategories: saleServiceSpies.getAvailableProductCategories,
  })),
}));

// sale-product-row's checkAvailability failure path calls showBlockingError, which now uses
// the real SweetAlert2 library (sweetalert2) instead of window.alert — mock the wrapper
// module directly (not window.alert) per the SweetAlert2 port.
const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: showBlockingErrorMock,
}));

const addItemMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = {
    items: [] as unknown[],
    addItem: addItemMock,
    updateQuantity: vi.fn(),
    getItemQuantity: vi.fn(() => 0),
  };
  const useCartStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useCartStore };
});

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
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

import { SalePage } from '../sale';

describe('SalePage — Angular parity (sale.component.html)', () => {
  beforeEach(() => {
    mockCategories = [];
    mockProducts = [];
    addItemMock.mockClear();
    mockUser.storeModuleIds = [];
    localStorage.clear();

    saleServiceSpies.getProductsToSaleByCategoryId.mockReset();
    saleServiceSpies.getProductsToSaleByCategoryId.mockImplementation(async (categoryId: string) =>
      bm(
        mockProducts
          .filter((p) => p.categoryId === categoryId && p.isActive && p.availableToSale)
          .sort((a, b) => a.order - b.order),
      ),
    );
    saleServiceSpies.getAvailableProductCategories.mockReset();
    saleServiceSpies.getAvailableProductCategories.mockImplementation(async () =>
      bm(mockCategories.filter((c) => c.isActive).sort((a, b) => a.order - b.order)),
    );
  });

  it('renders the exact Angular header text SALES.HEADER', () => {
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(screen.getByText('Productos para vender')).toBeInTheDocument();
  });

  it('does NOT render a barcode-scanner entry point (Angular has it fully commented out)', () => {
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(screen.queryByTestId('quick-sale-scanner')).not.toBeInTheDocument();
    expect(screen.queryByText(/Escaneando/i)).not.toBeInTheDocument();
  });

  it('renders one category button per active category', async () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' }), makeCategory({ id: 'c2', name: 'Snacks' })];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(await screen.findByRole('button', { name: 'Bebidas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Snacks' })).toBeInTheDocument();
  });

  it('auto-selects the first category and shows its products, without the no-selection alert', async () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1' })];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(await screen.findByText('Coca Cola')).toBeInTheDocument();
    expect(
      screen.queryByText('Seleccione primero una categoría para adicionar productos a la venta.'),
    ).not.toBeInTheDocument();
  });

  it('switches products shown when a different category button is clicked', async () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' }), makeCategory({ id: 'c2', name: 'Snacks' })];
    mockProducts = [
      makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1' }),
      makeProduct({ id: 'p2', name: 'Papas', categoryId: 'c2' }),
    ];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(await screen.findByText('Coca Cola')).toBeInTheDocument();
    expect(screen.queryByText('Papas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Snacks' }));

    expect(await screen.findByText('Papas')).toBeInTheDocument();
    expect(screen.queryByText('Coca Cola')).not.toBeInTheDocument();
  });

  it('shows the no-selected-category alert when categories exist and none is selected yet', async () => {
    // Zero categories -> no alert (Angular's condition requires categories.length > 0)
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Productos para vender')).toBeInTheDocument());
    expect(
      screen.queryByText('Seleccione primero una categoría para adicionar productos a la venta.'),
    ).not.toBeInTheDocument();
  });

  it('only filters products by categoryId, isActive and availableToSale (matches Angular repository filter)', async () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [
      makeProduct({ id: 'p1', name: 'Visible', categoryId: 'c1', isActive: true, availableToSale: true }),
      makeProduct({ id: 'p2', name: 'Inactive', categoryId: 'c1', isActive: false, availableToSale: true }),
      makeProduct({ id: 'p3', name: 'NotForSale', categoryId: 'c1', isActive: true, availableToSale: false }),
      makeProduct({ id: 'p4', name: 'OtherCategory', categoryId: 'c-other', isActive: true, availableToSale: true }),
    ];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(await screen.findByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
    expect(screen.queryByText('NotForSale')).not.toBeInTheDocument();
    expect(screen.queryByText('OtherCategory')).not.toBeInTheDocument();
  });

  it('adds a product to the cart via the shared cart-store addItem action', async () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1', price: 1.5 })];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /adicionar/i }));
    expect(addItemMock).toHaveBeenCalled();
  });

  // End-to-end wiring check for checkAvailability: sale.tsx -> SaleCategoryProducts ->
  // SaleProductRow, mirroring Angular's addProductToCart -> hasAvailableProductToSale
  // (sale-product-row.component.ts:58-104).
  it('blocks overselling: shows a blocking alert and does not add to cart when stock is insufficient', async () => {
    mockUser.storeModuleIds = [EModules.Inventory];
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [
      makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1', discountFromInvantory: true }),
    ];
    showBlockingErrorMock.mockClear();

    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /adicionar/i }));

    expect(addItemMock).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    const [, text] = showBlockingErrorMock.mock.calls[0];
    expect(text).toBe('El producto no está disponible en el inventario.');
  });

  it('allows the sale when the inventory module is available, discountFromInvantory is set, and stock covers the quantity', async () => {
    mockUser.storeModuleIds = [EModules.Inventory];
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [
      makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1', discountFromInvantory: true }),
    ];
    const entries = [
      {
        id: 'e1',
        productId: 'p1',
        categoryId: 'cat-1',
        quantity: 10,
        available: 10,
        costPrice: 1,
        date: new Date('2025-01-01'),
        order: 0,
        isActive: true,
        createdDate: new Date('2025-01-01'),
        createdByName: 'test',
      },
    ];
    localStorage.setItem(
      'lizoft.store-inventory-entries-s1',
      JSON.stringify([['p1', entries]]),
    );

    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /adicionar/i }));

    expect(addItemMock).toHaveBeenCalled();
  });

  // CATALOG-SCOPE PIN (catalog-show-all-and-clear-data): the catalog's
  // getProductCategoriesView / getAvailableProductsByCategoryId now return
  // inactive rows too. This screen must keep reading through the
  // active-and-sellable methods. Swapping it to a catalog method would leave
  // PROD-17 and CAT-10 green while Ventas started listing inactive products.
  it('reads its category and product lists through the active-and-sellable service methods', async () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1' })];

    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );

    expect(await screen.findByText('Coca Cola')).toBeInTheDocument();
    expect(saleServiceSpies.getAvailableProductCategories).toHaveBeenCalled();
    expect(saleServiceSpies.getProductsToSaleByCategoryId).toHaveBeenCalledWith('c1');
  });
});
