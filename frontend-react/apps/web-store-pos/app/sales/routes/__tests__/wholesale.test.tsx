import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { OrderType } from '@store-mgmt/domain';

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

const addItemMock = vi.hoisted(() => vi.fn());
const getItemQuantityMock = vi.hoisted(() => vi.fn(() => 0));
vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = { addItem: addItemMock, getItemQuantity: getItemQuantityMock };
  const useCartStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useCartStore };
});

const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  showBlockingInfoHtml: (...args: unknown[]) => showBlockingInfoHtmlMock(...args),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

const hasInventoryModuleMock = vi.hoisted(() => vi.fn(() => false));
vi.mock('~/shared/lib/auth/authorization-service', () => ({
  hasInventoryModuleAvailable: () => hasInventoryModuleMock(),
}));

const inventoryServiceMock = vi.hoisted(() => vi.fn());
vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableQuantity: () => inventoryServiceMock(),
  })),
}));

const showBlockingInfoHtmlMock = vi.hoisted(() => vi.fn());

let mockCategories: ProductCategory[] = [];
let mockProducts: Product[] = [];

const bm = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

vi.mock('~/sales/lib/services/product-service.factory', () => ({
  createProductService: () => ({
    getProductsToSaleByCategoryId: vi.fn(async (categoryId: string) =>
      bm(mockProducts.filter((p) => p.categoryId === categoryId)),
    ),
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

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 700,
    order: 0,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: '',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

import { WholesalePage } from '../wholesale';

describe('WholesalePage — Ventas Mayoristas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasInventoryModuleMock.mockReturnValue(false);
    inventoryServiceMock.mockReturnValue({ hasEntries: false, available: 0 });
    mockCategories = [makeCategory()];
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [
          { minPacks: 1, pricePerUnit: 680 },
          { minPacks: 11, pricePerUnit: 660 },
          { minPacks: 21, pricePerUnit: 640 },
        ],
      }),
    ];
  });

  it('lista solo productos con config mayorista activa', async () => {
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
      makeProduct('pan-1', { name: 'Pan' }), // sin config mayorista
    ];
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());
    expect(screen.queryByText('Pan')).not.toBeInTheDocument();
  });

  it('muestra mensaje vacío cuando no hay productos mayoristas', async () => {
    mockProducts = [makeProduct('pan-1', { name: 'Pan' })];
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() =>
      expect(
        screen.getByText(
          'No hay productos configurados para la venta mayorista. Active la opción "Venta Mayorista" al crear o editar un producto.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('al añadir 12 paquetes agrega 288 unidades al carrito con OrderType.Mayorista y el precio del tier', async () => {
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'beer-1' }),
      288,
      OrderType.Mayorista,
      660,
    );
  });

  it('muestra la cotización packs × packSize × unitPrice', async () => {
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), { target: { value: '12' } });
    const quote = screen.getByTestId('wholesale-quote-beer-1');
    expect(quote.textContent).toContain('12 × 24 ×');
    // El total se muestra con formatCurrency (compacto "190 080" — sin coma).
    expect(quote.textContent).toContain('660');
    expect(quote.textContent).toMatch(/190\s?080/);
  });

  it('no agrega nada con paquetes vacíos o 0', async () => {
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));
    expect(addItemMock).not.toHaveBeenCalled();
  });

  it('bloquea la cantidad menor al primer rango y muestra el error de mínimo', async () => {
    // Primer rango en 5 paquetes: 3 paquetes no alcanzan el mínimo.
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }],
      }),
    ];
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(addItemMock).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('5'),
    );
  });

  it('muestra la cantidad disponible debajo del nombre cuando descuenta inventario y hay módulo activo', async () => {
    hasInventoryModuleMock.mockReturnValue(true);
    inventoryServiceMock.mockReturnValue({ hasEntries: true, available: 96 });
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        discountFromInvantory: true,
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
    ];
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());
    expect(screen.getByText(/96/)).toBeInTheDocument();
  });

  it('no muestra la cantidad disponible sin módulo de inventario', async () => {
    hasInventoryModuleMock.mockReturnValue(false);
    inventoryServiceMock.mockReturnValue({ hasEntries: true, available: 96 });
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        discountFromInvantory: true,
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
    ];
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());
    expect(screen.queryByText(/96/)).not.toBeInTheDocument();
  });

  it('abre el popup readonly con los rangos y precios al tocar el icono de info', async () => {
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [
          { minPacks: 1, pricePerUnit: 680 },
          { minPacks: 11, pricePerUnit: 660 },
        ],
      }),
    ];
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wholesale-tiers-info-beer-1'));

    expect(showBlockingInfoHtmlMock).toHaveBeenCalledTimes(1);
    const [title, html] = showBlockingInfoHtmlMock.mock.calls[0];
    expect(String(title)).toContain('Rangos');
    expect(String(html)).toContain('680');
    expect(String(html)).toContain('660');
    expect(String(html)).toContain('24');
  });

  it('permite agregar exactamente el mínimo del primer rango', async () => {
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }],
      }),
    ];
    render(<Wrapper><WholesalePage /></Wrapper>);
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'beer-1' }),
      120, // 5 × 24
      OrderType.Mayorista,
      680,
    );
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });
});