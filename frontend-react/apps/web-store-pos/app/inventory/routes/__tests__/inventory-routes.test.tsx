import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryEntryView, Order, OrderItem, Product, ProductCategory } from '@store-mgmt/domain';
import { PaymentType, OrderType } from '@store-mgmt/domain';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';

// ─── Global mocks ────────────────────────────────────────────────────────────

vi.mock('~/shared/lib/stores/auth-store', () => {
  // storeModuleIds: [] — EgressPage's checkAvailability calls hasInventoryModuleAvailable(user)
  // unconditionally (same as sale.tsx), which throws on a user object without this field.
  const state = { user: { selectedStoreId: 's1', storeModuleIds: [] as number[] }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getByDate: vi.fn().mockReturnValue([]),
    getAvailableByCategory: vi.fn().mockReturnValue([]),
    getAvailableQuantity: vi.fn().mockReturnValue({ hasEntries: false, available: 0 }),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  })),
}));

// Mutable fixtures for the EgressPage (Mayorista sale) tests below — declared here so the
// hoisted vi.mock factories can close over them; other pages in this file (e.g.
// InventoryAvailablePage) never populate them, so they keep seeing `[]`, matching prior
// behavior.
let mockEgressProducts: Product[] = [];
let mockEgressCategories: ProductCategory[] = [];

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(() => mockEgressProducts),
    getById: vi.fn().mockReturnValue(undefined),
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn(() => mockEgressCategories),
    getById: vi.fn((id: string) => mockEgressCategories.find((c) => c.id === id)),
  })),
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getActiveOrdersInDay: vi.fn().mockReturnValue([]),
  })),
}));

const addItemMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/stores/cart-store', () => {
  const state = {
    items: [] as unknown[],
    addItem: addItemMock,
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

// ─── InventoryAvailablePage ──────────────────────────────────────────────────

import { InventoryAvailablePage } from '../available';

describe('InventoryAvailablePage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the page title', () => {
    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );
    expect(screen.getByText(/Stock disponible/i)).toBeInTheDocument();
  });
});

// ─── TodayEntriesPage ────────────────────────────────────────────────────────

import { TodayEntriesPage } from '../today-entries';

describe('TodayEntriesPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodayEntriesPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows New Entry button', () => {
    render(
      <Wrapper>
        <TodayEntriesPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Nueva entrada/i)).toBeInTheDocument();
  });
});

// ─── EntriesPage ─────────────────────────────────────────────────────────────

import { EntriesPage } from '../entries';

describe('EntriesPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });
});

// ─── InventoryTodayQuantitiesPage ────────────────────────────────────────────

import { InventoryTodayQuantitiesPage } from '../today-quantities';

describe('InventoryTodayQuantitiesPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryTodayQuantitiesPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the page title', () => {
    render(
      <Wrapper>
        <InventoryTodayQuantitiesPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Cantidades del Día/i)).toBeInTheDocument();
  });
});

// ─── InventoryTodayQuantitiesPage — Angular formula parity ──────────────────
//
// Angular reference: inventory-today-quantities.component.ts:57-137. Product set filtered to
// `isActive && availableToSale` (line 63); per product: disponible = availableProduct?.quantity
// ?? 0 (line 90), entradas = sum(today entries) (line 92), vendido = sum(today order items)
// (line 93), inicio = disponible + vendido - entradas (line 94), final = disponible - vendido
// (line 95). Rows are grouped by category, ordered by category.order then product.order
// (lines 64-69, 118-134).

describe('InventoryTodayQuantitiesPage — Angular inicio/entradas/disponible/vendido/final formula', () => {
  beforeEach(() => {
    mockEgressProducts = [];
    mockEgressCategories = [];
  });

  it('computes inicio/entradas/disponible/vendido/final for a product with known entries and sales', () => {
    mockEgressProducts = [
      makeEgressProduct({ id: 'p1', name: 'Ron', categoryId: 'cat-1', categoryName: 'Bebidas', order: 1 }),
    ];
    mockEgressCategories = [makeCategory({ id: 'cat-1', order: 1 })];

    const entries: InventoryEntryView[] = [
      { id: 'e1', productId: 'p1', productName: 'Ron', quantity: 4, costPrice: 5, date: new Date(), isActive: true },
      { id: 'e2', productId: 'p1', productName: 'Ron', quantity: 6, costPrice: 5, date: new Date(), isActive: true },
    ];
    const categoryView: InventoryCategoryView[] = [
      {
        categoryId: 'cat-1',
        categoryName: 'Bebidas',
        products: [
          { productId: 'p1', productName: 'Ron', categoryId: 'cat-1', categoryName: 'Bebidas', totalAvailable: 20 },
        ],
      },
    ];
    vi.mocked(InventoryOfflineService).mockImplementationOnce(
      () =>
        ({
          getByDate: vi.fn().mockReturnValue(entries),
          getAvailableByCategory: vi.fn().mockReturnValue(categoryView),
        }) as unknown as InstanceType<typeof InventoryOfflineService>,
    );

    const orderItem: OrderItem = {
      productId: 'p1',
      productName: 'Ron',
      categoryId: 'cat-1',
      categoryName: 'Bebidas',
      name: 'Ron',
      quantity: 6,
      price: 10,
      productBusinessId: 'biz-1',
      productCosts: [],
      order: 1,
    };
    const order: Order = {
      id: 'o1',
      orderItems: [orderItem],
      total: 60,
      itemsCount: 6,
      date: new Date(),
      type: OrderType.Normal,
      paymentType: PaymentType.Efectivo,
      isCredit: false,
      description: '',
      isActive: true,
      createdDate: new Date(),
      createdByName: 'test',
    };
    vi.mocked(OrderOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getActiveOrdersInDay: vi.fn().mockReturnValue([order]),
        }) as unknown as InstanceType<typeof OrderOfflineService>,
    );

    render(
      <Wrapper>
        <InventoryTodayQuantitiesPage />
      </Wrapper>,
    );

    // disponible=20, entradas=10, vendido=6 -> inicio=20+6-10=16, final=20-6=14
    const row = screen.getByText('Bebidas - Ron').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('16'); // inicio
    expect(row).toHaveTextContent('10'); // entradas
    expect(row).toHaveTextContent('20'); // disponible
    expect(row).toHaveTextContent('6'); // vendido
    expect(row).toHaveTextContent('14'); // final
  });

  it('excludes inactive and non-availableToSale products from the report (Angular filter, line 63)', () => {
    mockEgressProducts = [
      makeEgressProduct({ id: 'p1', name: 'Inactivo', isActive: false, availableToSale: true }),
      makeEgressProduct({ id: 'p2', name: 'NoVendible', isActive: true, availableToSale: false }),
    ];
    mockEgressCategories = [makeCategory({ id: 'cat-1', order: 1 })];

    render(
      <Wrapper>
        <InventoryTodayQuantitiesPage />
      </Wrapper>,
    );

    expect(screen.queryByText(/Inactivo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NoVendible/)).not.toBeInTheDocument();
    expect(screen.getByText('No hay productos disponibles')).toBeInTheDocument();
  });

  it('groups products by category, ordered by category.order then product.order', () => {
    mockEgressCategories = [
      makeCategory({ id: 'cat-2', name: 'Snacks', order: 2 }),
      makeCategory({ id: 'cat-1', name: 'Bebidas', order: 1 }),
    ];
    mockEgressProducts = [
      makeEgressProduct({ id: 'p-a', name: 'Papas', categoryId: 'cat-2', categoryName: 'Snacks', order: 1 }),
      makeEgressProduct({ id: 'p-b', name: 'Cerveza', categoryId: 'cat-1', categoryName: 'Bebidas', order: 2 }),
      makeEgressProduct({ id: 'p-c', name: 'Agua', categoryId: 'cat-1', categoryName: 'Bebidas', order: 1 }),
    ];

    render(
      <Wrapper>
        <InventoryTodayQuantitiesPage />
      </Wrapper>,
    );

    const rows = screen.getAllByRole('row').filter((r) => r.closest('tbody'));
    const names = rows.map((r) => r.textContent);
    const aguaIdx = names.findIndex((n) => n?.includes('Agua'));
    const cervezaIdx = names.findIndex((n) => n?.includes('Cerveza'));
    const papasIdx = names.findIndex((n) => n?.includes('Papas'));

    expect(aguaIdx).toBeGreaterThanOrEqual(0);
    expect(cervezaIdx).toBeGreaterThan(aguaIdx); // same category (Bebidas), order 1 before order 2
    expect(papasIdx).toBeGreaterThan(cervezaIdx); // Snacks (order 2) comes after Bebidas (order 1)
  });
});

// ─── InventoryTodaySalesProfitPage ───────────────────────────────────────────

import { InventoryTodaySalesProfitPage } from '../today-sales-profit';

describe('InventoryTodaySalesProfitPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the profit page title', () => {
    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Ganancia de hoy/i)).toBeInTheDocument();
  });
});

// ─── EgressPage — Mayorista wholesale-sale screen (Angular egress.component parity) ────────
//
// Angular's EgressComponent (egress.component.ts:20) is NOT a waste/CRUD tracker — it is a
// wholesale (Mayorista) SALE screen: `orderType = OrderType.Mayorista` (default), a full
// `OrderTypeUtils.getOrderTypes()` selector, and the reused `SaleCategoryProductsComponent`.
// These tests supersede the old fabricated waste-CRUD "EgressPage — smoke render" suite
// (deleted, not duplicated — see Stage 2.1 tasks 2.1/3.5).

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'cat-1', name: 'Bebidas', order: 1, isActive: true, ...overrides };
}

function makeEgressProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Coca Cola',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 10,
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

// ─── InventoryTodaySalesProfitPage — product inclusion filter (Angular parity) ──────────────
//
// Angular's InventoryTodaySalesProfitComponent.loadProfitData() sources products via
// `.filter(p => p.isActive && p.availableToSale)` only (inventory-today-sales-profit.component.ts:66-67)
// — there is NO `discountFromInvantory` exclusion. A sold product with
// `discountFromInvantory: false` is still counted in revenue/profit (its FIFO cost naturally
// comes out to 0 via the eligibility-gated cost-alloc path, per Stage 2.1 L4 map gap #3a).

describe('InventoryTodaySalesProfitPage — product inclusion filter (Angular parity: no discountFromInvantory exclusion)', () => {
  beforeEach(() => {
    mockEgressProducts = [];
  });

  it('includes a sold product with discountFromInvantory=false in the profit table and its totals', () => {
    mockEgressProducts = [
      makeEgressProduct({ id: 'p1', name: 'Ron', price: 10, discountFromInvantory: false }),
    ];

    const orderItem: OrderItem = {
      productId: 'p1',
      productName: 'Ron',
      categoryId: 'cat-1',
      categoryName: 'Bebidas',
      name: 'Ron',
      quantity: 5,
      price: 10,
      productBusinessId: 'biz-1',
      productCosts: [],
      order: 1,
    };
    const order: Order = {
      id: 'o1',
      orderItems: [orderItem],
      total: 50,
      itemsCount: 5,
      date: new Date(),
      type: OrderType.Normal,
      paymentType: PaymentType.Efectivo,
      isCredit: false,
      description: '',
      isActive: true,
      createdDate: new Date(),
      createdByName: 'test',
    };
    vi.mocked(OrderOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getActiveOrdersInDay: vi.fn().mockReturnValue([order]),
        }) as unknown as InstanceType<typeof OrderOfflineService>,
    );

    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );

    // Product row renders: name, units sold, and revenue = profit = $50.00 (no cost, since
    // no productCosts were recorded) — proves the discountFromInvantory=false product was
    // NOT excluded and its sale is fully counted.
    const row = screen.getByText('Ron').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('5'); // unitsSold
    expect(row).toHaveTextContent('$50.00'); // revenue
    expect(row).toHaveTextContent('$0.00'); // cost (no productCosts)
    // Total row reflects the same values since it's the only product/sale today.
    const totalRow = screen.getByText('Total').closest('tr');
    expect(totalRow).toHaveTextContent('$50.00');
  });
});

import { EgressPage } from '../egress';

describe('EgressPage — Mayorista wholesale-sale screen (Angular egress.component parity)', () => {
  beforeEach(() => {
    mockEgressProducts = [];
    mockEgressCategories = [];
    addItemMock.mockClear();
  });

  it('renders the Angular header text INVENTORY_EGRESS.HEADER ("Salida")', () => {
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    expect(screen.getByText('Salida')).toBeInTheDocument();
  });

  it('renders the full OrderType selector (Angular getOrderTypes(): all 5 types) defaulting to Mayorista', () => {
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    const select = screen.getByLabelText('Tipo') as HTMLSelectElement;
    expect(select.value).toBe(String(OrderType.Mayorista));
    for (const label of ['Normal', 'Mayorista', 'Merma', 'Ajuste', 'Otro']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('renders one category button per active category', () => {
    mockEgressCategories = [makeCategory({ id: 'c1', name: 'Bebidas' }), makeCategory({ id: 'c2', name: 'Snacks' })];
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Bebidas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Snacks' })).toBeInTheDocument();
  });

  it('renders an editable price input by default (Mayorista is non-Normal, SaleProductRow parity)', () => {
    mockEgressCategories = [makeCategory()];
    mockEgressProducts = [makeEgressProduct()];
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Precio')).toBeInTheDocument();
  });

  it('threads productId, quantity, orderType (Mayorista) and the edited price into cart-store.addItem', () => {
    mockEgressCategories = [makeCategory()];
    mockEgressProducts = [makeEgressProduct({ id: 'p1', price: 10 })];
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      1,
      OrderType.Mayorista,
      12,
    );
  });

  it('threads the newly-selected orderType (not the stale default) when the selector is changed before adding', () => {
    mockEgressCategories = [makeCategory()];
    mockEgressProducts = [makeEgressProduct({ id: 'p1' })];
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: String(OrderType.Merma) } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      1,
      OrderType.Merma,
      expect.any(Number),
    );
  });
});
