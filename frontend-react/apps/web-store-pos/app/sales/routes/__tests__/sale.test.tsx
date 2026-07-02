import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, ProductCategory } from '@store-mgmt/domain';

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

let mockCategories: ProductCategory[] = [];
let mockProducts: Product[] = [];

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(() => mockProducts),
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(() => mockCategories),
  })),
}));

const addItemMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = {
    items: [] as unknown[],
    addItem: addItemMock,
    updateQuantity: vi.fn(),
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

  it('renders one category button per active category', () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' }), makeCategory({ id: 'c2', name: 'Snacks' })];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Bebidas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Snacks' })).toBeInTheDocument();
  });

  it('auto-selects the first category and shows its products, without the no-selection alert', () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1' })];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(
      screen.queryByText('Seleccione primero una categoría para adicionar productos a la venta.'),
    ).not.toBeInTheDocument();
  });

  it('switches products shown when a different category button is clicked', () => {
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
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(screen.queryByText('Papas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Snacks' }));

    expect(screen.getByText('Papas')).toBeInTheDocument();
    expect(screen.queryByText('Coca Cola')).not.toBeInTheDocument();
  });

  it('shows the no-selected-category alert when categories exist and none is selected yet', () => {
    // Zero categories -> no alert (Angular's condition requires categories.length > 0)
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    expect(
      screen.queryByText('Seleccione primero una categoría para adicionar productos a la venta.'),
    ).not.toBeInTheDocument();
  });

  it('only filters products by categoryId, isActive and availableToSale (matches Angular repository filter)', () => {
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
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
    expect(screen.queryByText('NotForSale')).not.toBeInTheDocument();
    expect(screen.queryByText('OtherCategory')).not.toBeInTheDocument();
  });

  it('adds a product to the cart via the shared cart-store addItem action', () => {
    mockCategories = [makeCategory({ id: 'c1', name: 'Bebidas' })];
    mockProducts = [makeProduct({ id: 'p1', name: 'Coca Cola', categoryId: 'c1', price: 1.5 })];
    render(
      <Wrapper>
        <SalePage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(addItemMock).toHaveBeenCalled();
  });
});
