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
/** Estado compartido del carrito mockeado — mutable desde los tests (exclusividad Normal/Mayorista). */
const cartStateMock = vi.hoisted(() => ({
  items: [] as unknown[],
  orderType: 1 as number, // OrderType.Normal
}));
vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = {
    get items() {
      return cartStateMock.items;
    },
    get orderType() {
      return cartStateMock.orderType;
    },
    addItem: addItemMock,
    getItemQuantity: getItemQuantityMock,
  };
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

const showBlockingInfoHtmlMock = vi.hoisted(() => vi.fn());

const showToastSuccessMock = vi.hoisted(() => vi.fn());
const showToastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
  showToastError: (...args: unknown[]) => showToastErrorMock(...args),
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

// ScannerModal — the 2026-09-07 redesign dropped the manual-entry form; tests
// drive the parent's onScanned(barcode, quantity) contract through this mock.
const scannerModalMock = vi.hoisted(() => vi.fn());
vi.mock('../../components/scanner-modal', () => ({
  ScannerModal: scannerModalMock,
}));

let mockCategories: ProductCategory[] = [];
let mockProducts: Product[] = [];
/** Producto retornado por getProductByBarcode — null = "no encontrado". */
let mockBarcodeProduct: Product | null = null;

const bm = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

vi.mock('~/sales/lib/services/product-service.factory', () => ({
  createProductService: () => ({
    getProductsToSaleByCategoryId: vi.fn(async (categoryId: string) =>
      bm(mockProducts.filter((p) => p.categoryId === categoryId)),
    ),
    getProductByBarcode: vi.fn(async (barcode: string) =>
      mockBarcodeProduct?.barcode === barcode ? bm(mockBarcodeProduct) : bm(null),
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
    cartStateMock.items = [];
    cartStateMock.orderType = 1; // OrderType.Normal
    mockBarcodeProduct = null;
    scannerModalMock.mockImplementation(
      ({
        onScanned,
        onClose,
      }: {
        onScanned: (barcode: string, quantity: number) => void;
        onClose: () => void;
      }) => (
        <div data-testid="scanner-modal">
          <input
            type="text"
            data-testid="scanner-mock-barcode"
            onChange={(e) => {
              (e.target as HTMLInputElement).dataset.barcode = e.target.value;
            }}
          />
          <input
            type="number"
            data-testid="scanner-mock-quantity"
            defaultValue={1}
            onChange={(e) => {
              (e.target as HTMLInputElement).dataset.quantity = e.target.value;
            }}
          />
          <button
            type="button"
            data-testid="scanner-mock-scan"
            onClick={() => {
              const root = document.body;
              const barcode =
                (root.querySelector('[data-testid="scanner-mock-barcode"]') as HTMLInputElement)
                  ?.dataset.barcode ?? '';
              const quantity = Number(
                (root.querySelector('[data-testid="scanner-mock-quantity"]') as HTMLInputElement)
                  ?.dataset.quantity ?? '1',
              );
              onScanned(barcode, quantity);
            }}
          >
            scan
          </button>
          <button type="button" data-testid="scanner-mock-close" onClick={onClose}>
            close
          </button>
        </div>
      ),
    );
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
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());
    expect(screen.queryByText('Pan')).not.toBeInTheDocument();
  });

  it('muestra mensaje vacío cuando no hay productos mayoristas', async () => {
    mockProducts = [makeProduct('pan-1', { name: 'Pan' })];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'No hay productos configurados para la venta mayorista. Active la opción "Venta Mayorista" al crear o editar un producto.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('al añadir 12 paquetes agrega 288 unidades al carrito con OrderType.Mayorista y el precio del tier', async () => {
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'beer-1' }),
      288,
      OrderType.Mayorista,
      660,
    );
  });

  it('muestra la cotización packs × packSize × unitPrice', async () => {
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '12' },
    });
    const quote = screen.getByTestId('wholesale-quote-beer-1');
    expect(quote.textContent).toContain('12 × 24 ×');
    // El total se muestra con formatCurrency (compacto "190 080" — sin coma).
    expect(quote.textContent).toContain('660');
    expect(quote.textContent).toMatch(/190\s?080/);
  });

  it('no agrega nada con paquetes vacíos o 0', async () => {
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
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
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '3' },
    });
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
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
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
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
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
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
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
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'beer-1' }),
      120, // 5 × 24
      OrderType.Mayorista,
      680,
    );
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Filtros por categoría y por nombre (paridad con /sales/new, 2026-09-05)
  // ═══════════════════════════════════════════════════════════════════════════

  it('filtra los productos por categoría seleccionada', async () => {
    mockCategories = [makeCategory(), makeCategory({ id: 'cat-2', name: 'Carnes' })];
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza Pilsen',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
      makeProduct('croq-1', {
        name: 'Croquetas',
        categoryId: 'cat-2',
        wholesaleEnabled: true,
        wholesalePackSize: 10,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 300 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza Pilsen')).toBeInTheDocument());
    expect(screen.getByText('Croquetas')).toBeInTheDocument();

    // Seleccionar la pestaña Carnes → solo Croquetas queda visible.
    fireEvent.click(screen.getByTestId('wholesale-category-cat-2'));
    await waitFor(() => expect(screen.queryByText('Cerveza Pilsen')).not.toBeInTheDocument());
    expect(screen.getByText('Croquetas')).toBeInTheDocument();

    // Volver a "Todas" → ambos visibles de nuevo.
    fireEvent.click(screen.getByTestId('wholesale-category-all'));
    await waitFor(() => expect(screen.getByText('Cerveza Pilsen')).toBeInTheDocument());
    expect(screen.getByText('Croquetas')).toBeInTheDocument();
  });

  it('filtra los productos por nombre en el searchbox', async () => {
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza Nacional',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
      makeProduct('wine-1', {
        name: 'Vino Tinto',
        wholesaleEnabled: true,
        wholesalePackSize: 6,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 1200 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza Nacional')).toBeInTheDocument());
    expect(screen.getByText('Vino Tinto')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('wholesale-search-input'), { target: { value: 'tinto' } });
    await waitFor(() => expect(screen.queryByText('Cerveza Nacional')).not.toBeInTheDocument());
    expect(screen.getByText('Vino Tinto')).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unidad de medida configurable (wholesaleUnitLabel, 2026-09-05)
  // ═══════════════════════════════════════════════════════════════════════════

  it('muestra la unidad configurable del producto en el label del input y en el popup de rangos', async () => {
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleUnitLabel: 'caja',
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    // El label del input de packs es la unidad del producto con el packSize:
    // "caja (24)".
    expect(screen.getByText('caja (24)')).toBeInTheDocument();

    // El popup de rangos usa el plural de la unidad ("Desde 1 cajas").
    fireEvent.click(screen.getByTestId('wholesale-tiers-info-beer-1'));
    const [, html] = showBlockingInfoHtmlMock.mock.calls[0];
    expect(String(html)).toContain('cajas');
    expect(String(html)).not.toContain('paquetes');
  });

  it('sin unidad configurada cae al label por defecto "paquete"', async () => {
    mockProducts = [
      makeProduct('croq-1', {
        name: 'Croquetas',
        wholesaleEnabled: true,
        wholesalePackSize: 10,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 300 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Croquetas')).toBeInTheDocument());

    expect(screen.getByText('paquete (10)')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wholesale-tiers-info-croq-1'));
    const [, html] = showBlockingInfoHtmlMock.mock.calls[0];
    expect(String(html)).toContain('paquetes');
  });

  it('el error de mínimo usa la unidad del producto', async () => {
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleUnitLabel: 'caja',
        wholesaleTiers: [{ minPacks: 6, pricePerUnit: 680 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    const message = showBlockingErrorMock.mock.calls[0]?.[1] ?? '';
    expect(message).toContain('cajas');
    expect(message).not.toContain('paquetes');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Popup de no-disponibilidad con disponibles y faltantes (2026-09-05)
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // Paridad de filtros con /sales/new + botón carrito (2026-09-06)
  // ═══════════════════════════════════════════════════════════════════════════

  it('oculta las categorías sin productos mayoristas', async () => {
    mockCategories = [makeCategory(), makeCategory({ id: 'cat-2', name: 'Carnes' })];
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
      makeProduct('pan-1', { name: 'Pan', categoryId: 'cat-2' }), // Carnes: sin mayorista
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    expect(screen.getByTestId('wholesale-category-cat-1')).toBeInTheDocument();
    expect(screen.queryByTestId('wholesale-category-cat-2')).not.toBeInTheDocument();
  });

  it('mantiene el orden de la venta: buscador arriba, tabs de categorías debajo', async () => {
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    const search = screen.getByTestId('wholesale-search-input');
    const firstTab = screen.getByTestId('wholesale-category-all');
    expect(
      search.compareDocumentPosition(firstTab) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('el botón de agregar es el icono del carrito, sin texto', async () => {
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    const add = screen.getByTestId('wholesale-add-beer-1');
    expect(add).toHaveAttribute('aria-label', 'Añadir');
    expect(add.querySelector('svg')).not.toBeNull();
    expect(add.textContent?.trim()).toBe('');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Exclusividad Normal/Mayorista — popup de restricción (2026-09-06)
  // ═══════════════════════════════════════════════════════════════════════════

  it('bloquea añadir a la venta mayorista cuando hay una venta normal en curso y muestra el popup de restricción', async () => {
    // Carrito con una venta normal en curso (ítem Normal ya agregado).
    cartStateMock.items = [{ product: makeProduct('normal-1'), quantity: 2 }];
    cartStateMock.orderType = 1; // OrderType.Normal
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(addItemMock).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    const message = String(showBlockingErrorMock.mock.calls[0]?.[1] ?? '');
    expect(message).toContain('venta normal');
    expect(message).toContain('venta mayorista');
  });

  it('permite la venta mayorista cuando el carrito ya es de venta mayorista', async () => {
    cartStateMock.items = [{ product: makeProduct('beer-1'), quantity: 24 }];
    cartStateMock.orderType = 2; // OrderType.Mayorista
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(addItemMock).toHaveBeenCalled();
  });

  it('el popup de no-disponibilidad muestra disponibles y faltantes en unidades', async () => {
    hasInventoryModuleMock.mockReturnValue(true);
    inventoryServiceMock.mockReturnValue({ hasEntries: true, available: 40 });
    getItemQuantityMock.mockReturnValue(0);
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza',
        discountFromInvantory: true,
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    // 12 packs × 24 = 288 unidades pedidas, solo 40 disponibles → faltan 248.
    fireEvent.change(screen.getByTestId('wholesale-packs-input-beer-1'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByTestId('wholesale-add-beer-1'));

    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    const message = String(showBlockingErrorMock.mock.calls[0]?.[1] ?? '');
    expect(message).toContain('La cantidad del producto no está disponible');
    expect(message).toContain('Disponibles: 40');
    expect(message).toContain('Faltan 248');
    expect(message).toContain('288');
    // El detalle NO se agrega cuando la falla no es de cantidad (hasEntries true,
    // units <= available) — cubierto por el flujo de éxito de los otros tests.
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scanner + switch "Todos" (paridad con /sales/new, 2026-09-07)
  // ═══════════════════════════════════════════════════════════════════════════

  it('renderiza el botón del scanner junto al searchbox y abre el modal', async () => {
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    const scannerButton = screen.getByTestId('wholesale-scanner');
    expect(scannerButton).toBeInTheDocument();
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();

    fireEvent.click(scannerButton);
    expect(await screen.findByTestId('scanner-modal')).toBeInTheDocument();
  });

  /** Dispara un escaneo a través del ScannerModal mockeado. */
  function fireScan(barcode: string, quantity = 1) {
    const input = screen.getByTestId('scanner-mock-barcode') as HTMLInputElement;
    fireEvent.change(input, { target: { value: barcode } });
    input.dataset.barcode = barcode;
    const quantityInput = screen.getByTestId('scanner-mock-quantity') as HTMLInputElement;
    fireEvent.change(quantityInput, { target: { value: String(quantity) } });
    quantityInput.dataset.quantity = String(quantity);
    fireEvent.click(screen.getByTestId('scanner-mock-scan'));
  }

  it('scanner: barcode desconocido muestra PRODUCT_NOT_FOUND y no agrega nada', async () => {
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wholesale-scanner'));
    await screen.findByTestId('scanner-modal');
    fireScan('999999');

    await waitFor(() => expect(showToastErrorMock).toHaveBeenCalledTimes(1));
    expect(showToastErrorMock).toHaveBeenCalledWith('Producto no encontrado: 999999');
    expect(addItemMock).not.toHaveBeenCalled();
  });

  it('scanner: producto mayorista vendible se agrega con el mínimo del primer rango y OrderType.Mayorista', async () => {
    mockBarcodeProduct = makeProduct('beer-1', {
      name: 'Cerveza',
      barcode: '7501',
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [
        { minPacks: 5, pricePerUnit: 680 },
        { minPacks: 11, pricePerUnit: 660 },
      ],
    });
    mockProducts = [mockBarcodeProduct];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wholesale-scanner'));
    await screen.findByTestId('scanner-modal');
    fireScan('7501');

    // Cada escaneo agrega el mínimo del primer rango: 5 packs → 120 unidades.
    await waitFor(() => expect(addItemMock).toHaveBeenCalledTimes(1));
    const [product, quantity, orderType, price] = addItemMock.mock.calls[0];
    expect(product.id).toBe('beer-1');
    expect(quantity).toBe(120); // 5 × 24
    expect(orderType).toBe(OrderType.Mayorista);
    expect(price).toBe(680); // precio del primer rango
  });

  it('scanner: la cantidad escaneada multiplica el mínimo del primer rango', async () => {
    mockBarcodeProduct = makeProduct('beer-1', {
      name: 'Cerveza',
      barcode: '7501',
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }],
    });
    mockProducts = [mockBarcodeProduct];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wholesale-scanner'));
    await screen.findByTestId('scanner-modal');
    fireScan('7501', 3);

    // 3 × minPacks(5) = 15 packs → 15 × 24 = 360 unidades.
    await waitFor(() => expect(addItemMock).toHaveBeenCalledTimes(1));
    const [product, quantity] = addItemMock.mock.calls[0];
    expect(product.id).toBe('beer-1');
    expect(quantity).toBe(360);
  });

  it('scanner: producto sin config mayorista obtiene su propio mensaje (distinto de not-found)', async () => {
    // La lista tiene un mayorista (Cerveza) para que el toolbar renderice; el
    // barcode escaneado es un producto vendible SIN config mayorista (Pan).
    mockBarcodeProduct = makeProduct('pan-1', {
      name: 'Pan',
      barcode: '7502',
      availableToSale: true,
    });
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wholesale-scanner'));
    await screen.findByTestId('scanner-modal');
    fireScan('7502');

    await waitFor(() => expect(showToastErrorMock).toHaveBeenCalledTimes(1));
    expect(showToastErrorMock).toHaveBeenCalledWith(
      'El producto Pan no tiene configuración mayorista y no se puede vender en esta vista',
    );
    expect(addItemMock).not.toHaveBeenCalled();
  });

  it('scanner: escaneos repetidos del mismo barcode acumulan vía addItem (semántica de carrito)', async () => {
    mockBarcodeProduct = makeProduct('beer-1', {
      name: 'Cerveza',
      barcode: '7501',
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
    });
    mockProducts = [mockBarcodeProduct];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wholesale-scanner'));
    await screen.findByTestId('scanner-modal');

    fireScan('7501');
    await waitFor(() => expect(addItemMock).toHaveBeenCalledTimes(1));

    fireScan('7501');
    await waitFor(() => expect(addItemMock).toHaveBeenCalledTimes(2));
  });

  it('scanner: falla del gate de inventario muestra la alerta bloqueante con disponibles y no agrega', async () => {
    hasInventoryModuleMock.mockReturnValue(true);
    inventoryServiceMock.mockReturnValue({ hasEntries: true, available: 40 });
    getItemQuantityMock.mockReturnValue(0);
    mockBarcodeProduct = makeProduct('beer-1', {
      name: 'Cerveza',
      barcode: '7501',
      discountFromInvantory: true,
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }], // 5×24=120 > 40
    });
    mockProducts = [mockBarcodeProduct];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wholesale-scanner'));
    await screen.findByTestId('scanner-modal');
    fireScan('7501');

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledTimes(1));
    expect(addItemMock).not.toHaveBeenCalled();
    const message = String(showBlockingErrorMock.mock.calls[0]?.[1] ?? '');
    expect(message).toContain('La cantidad del producto no está disponible');
    expect(message).toContain('Disponibles en inventario: 40');
  });

  it('la búsqueda con el switch "Todos" ON recorre productos de todas las categorías', async () => {
    mockCategories = [makeCategory(), makeCategory({ id: 'cat-2', name: 'Carnes' })];
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza Pilsen',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
      makeProduct('croq-1', {
        name: 'Croquetas',
        categoryId: 'cat-2',
        wholesaleEnabled: true,
        wholesalePackSize: 10,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 300 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza Pilsen')).toBeInTheDocument());

    // Seleccionar la pestaña Carnes (solo Croquetas visibles)…
    fireEvent.click(screen.getByTestId('wholesale-category-cat-2'));
    await waitFor(() => expect(screen.queryByText('Cerveza Pilsen')).not.toBeInTheDocument());
    expect(screen.getByText('Croquetas')).toBeInTheDocument();

    // …y con "Todos" ON, buscar "pilsen" la encuentra igual (cruza categorías).
    const searchSwitch = screen.getByRole('switch', { name: 'Todos' });
    expect(searchSwitch).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByTestId('wholesale-search-input'), { target: { value: 'pilsen' } });
    await waitFor(() => expect(screen.getByText('Cerveza Pilsen')).toBeInTheDocument());
  });

  it('la búsqueda con el switch "Todos" OFF se restringe a la categoría seleccionada', async () => {
    mockCategories = [makeCategory(), makeCategory({ id: 'cat-2', name: 'Carnes' })];
    mockProducts = [
      makeProduct('beer-1', {
        name: 'Cerveza Pilsen',
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
      makeProduct('croq-1', {
        name: 'Croquetas',
        categoryId: 'cat-2',
        wholesaleEnabled: true,
        wholesalePackSize: 10,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 300 }],
      }),
    ];
    render(
      <Wrapper>
        <WholesalePage />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Cerveza Pilsen')).toBeInTheDocument());

    // Seleccionar Carnes y apagar "Todos": la búsqueda "pilsen" ya no encuentra
    // la cerveza (está en Bebidas), pero "croquetas" sí.
    fireEvent.click(screen.getByTestId('wholesale-category-cat-2'));
    fireEvent.click(screen.getByRole('switch', { name: 'Todos' }));
    fireEvent.change(screen.getByTestId('wholesale-search-input'), { target: { value: 'pilsen' } });
    await waitFor(() => expect(screen.queryByText('Cerveza Pilsen')).not.toBeInTheDocument());

    fireEvent.change(screen.getByTestId('wholesale-search-input'), {
      target: { value: 'croquetas' },
    });
    expect(screen.getByText('Croquetas')).toBeInTheDocument();
  });
});
