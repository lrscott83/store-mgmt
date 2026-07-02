import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryEntryView, Order, OrderItem, Product, ProductCategory } from '@store-mgmt/domain';
import { PaymentType, OrderType } from '@store-mgmt/domain';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';

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
    expect(screen.getByText(/Cantidades de hoy/i)).toBeInTheDocument();
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
