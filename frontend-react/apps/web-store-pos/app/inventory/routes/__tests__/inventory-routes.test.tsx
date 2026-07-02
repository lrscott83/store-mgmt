import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
    // Angular parity: INVENTORY.INVENTORY = 'Inventario' (inventory-available.component.html:4).
    expect(screen.getByText(/Inventario/i)).toBeInTheDocument();
  });
});

// ─── InventoryAvailablePage — header total inventory value (Angular parity) ─────────────────
//
// Angular reference: inventory-available.component.ts:38-40 `getInventoryCostTotal()` (sums
// `category.totalCostPrice` across the currently loaded categories$) + .html:6-9 (card-toolbar
// currency chip, `| currency:'USD':'symbol':'1.2-2'`).

describe('InventoryAvailablePage — header total inventory value', () => {
  it('shows the sum of all categories totalCostPrice as the header chip', () => {
    const categories: InventoryCategoryView[] = [
      {
        categoryId: 'cat-1',
        categoryName: 'Bebidas',
        totalQuantity: 20,
        totalCostPrice: 60,
        products: [
          {
            productId: 'p1',
            productName: 'Ron',
            categoryId: 'cat-1',
            categoryName: 'Bebidas',
            totalAvailable: 20,
            avgCostPrice: 3,
          },
        ],
      },
      {
        categoryId: 'cat-2',
        categoryName: 'Snacks',
        totalQuantity: 8,
        totalCostPrice: 40,
        products: [
          {
            productId: 'p2',
            productName: 'Papas',
            categoryId: 'cat-2',
            categoryName: 'Snacks',
            totalAvailable: 8,
            avgCostPrice: 5,
          },
        ],
      },
    ];

    vi.mocked(InventoryOfflineService).mockImplementationOnce(
      () =>
        ({
          getAvailableByCategory: vi.fn().mockReturnValue(categories),
        }) as unknown as InstanceType<typeof InventoryOfflineService>,
    );

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // 60 + 40 = 100.00
    expect(screen.getByText('$100.00')).toBeInTheDocument();
  });

  it('shows $0.00 when there is no inventory yet', () => {
    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
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

  it('shows New Entry button (Angular parity: GENERAL.ENTRY = "Entrada", today-entries.component.html:9)', () => {
    render(
      <Wrapper>
        <TodayEntriesPage />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Entrada' })).toBeInTheDocument();
  });
});

// ─── TodayEntriesPage — edit/deactivate actions regression guard (Angular
// parity: today-entries.component.html:24 `<app-entry-list [readOnly]="false">`
// — actions must stay reachable on THIS screen, unlike the Entries history
// screen below, diff-matrix #19) ────────────────────────────────────────────

describe('TodayEntriesPage — edit/deactivate actions stay reachable (regression guard)', () => {
  it('renders row-level edit/deactivate actions for today entries', () => {
    const todayEntries: InventoryEntryView[] = [
      {
        id: 'e1',
        productId: 'p1',
        productName: 'Ron',
        quantity: 5,
        costPrice: 3,
        date: new Date(),
        isActive: true,
      },
    ];
    vi.mocked(InventoryOfflineService).mockImplementationOnce(
      () =>
        ({
          getByDate: vi.fn().mockReturnValue(todayEntries),
        }) as unknown as InstanceType<typeof InventoryOfflineService>,
    );

    render(
      <Wrapper>
        <TodayEntriesPage />
      </Wrapper>,
    );

    expect(screen.getByText('Editar')).toBeInTheDocument();
    // CRITICAL bug fix (Angular parity: GENERAL.DELETE = 'Eliminar', not ORDERS.DEACTIVATE).
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
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

// ─── EntriesPage — day grouping + filter removal (Angular parity, gap #6) ────
//
// Angular reference: entries.component.ts:82-104 `groupEntries` (groups by calendar day,
// per-day count = Σquantity, per-day total = ΣcostPrice·quantity, ascending sort both across
// days and within a day) + :54-59 `getEntriesCount`/`getEntriesTotal` (grand totals) +
// entries.component.ts:43,62-67 (loadEntries() ALWAYS calls loadEntriesFiltered(null, null,
// null) — product/date filtering is dead code on this screen; the paymentType mat-radio-group
// is unwired to any query param and InventoryEntryView has no paymentType field at all, so it's
// inert). Confirmed via grep: filterInventoryEntries's only caller in the whole Angular
// codebase is this component, always with null args. Decision (orchestrator, 2026-07-02):
// remove React's product-name filter (no Angular analog) and date-range filter (React extra,
// no Angular analog), and omit the payment-type radio (Angular's own dead UI, no data-model
// backing — nothing correct to implement per the Angular-bug-handling policy).

// Shared fixtures reused by both the day-grouping suite and the read-only-history suite below.
const dayOneEntries: InventoryEntryView[] = [
  {
    id: 'e1',
    productId: 'p-a',
    productName: 'Product A',
    quantity: 2,
    costPrice: 3,
    date: new Date('2026-06-30T10:00:00.000Z'),
    isActive: true,
  },
  {
    id: 'e2',
    productId: 'p-b',
    productName: 'Product B',
    quantity: 1,
    costPrice: 10,
    date: new Date('2026-06-30T08:00:00.000Z'),
    isActive: true,
  },
];
const dayTwoEntries: InventoryEntryView[] = [
  {
    id: 'e3',
    productId: 'p-c',
    productName: 'Product C',
    quantity: 5,
    costPrice: 2,
    date: new Date('2026-07-01T09:00:00.000Z'),
    isActive: true,
  },
];

function mockEntries(entries: InventoryEntryView[]) {
  vi.mocked(InventoryOfflineService).mockImplementationOnce(
    () =>
      ({
        getAll: vi.fn().mockReturnValue(entries),
      }) as unknown as InstanceType<typeof InventoryOfflineService>,
  );
}

describe('EntriesPage — day grouping (Angular parity)', () => {
  it('shows the grand entries count and total in the header', () => {
    mockEntries([...dayOneEntries, ...dayTwoEntries]);
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    // count = 2+1+5 = 8; total = 2*3 + 1*10 + 5*2 = 6+10+10 = 26
    expect(screen.getByText('(8)')).toBeInTheDocument();
    expect(screen.getByText('$26.00')).toBeInTheDocument();
  });

  it('groups entries into one panel per calendar day with the correct per-day total', () => {
    mockEntries([...dayOneEntries, ...dayTwoEntries]);
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    const toggles = screen.getAllByTestId(/entry-day-panel-toggle-/);
    expect(toggles).toHaveLength(2);
    // day 1 total = 6+10 = 16.00; day 2 total = 10.00
    expect(screen.getByText('$16.00')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('sorts day panels ascending (oldest day first)', () => {
    mockEntries([...dayOneEntries, ...dayTwoEntries]);
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    const toggles = screen.getAllByTestId(/entry-day-panel-toggle-/);
    expect(toggles[0].getAttribute('data-testid')).toBe('entry-day-panel-toggle-2026-06-30');
    expect(toggles[1].getAttribute('data-testid')).toBe('entry-day-panel-toggle-2026-07-01');
  });

  it('sorts entries within a day ascending by time', () => {
    mockEntries([...dayOneEntries, ...dayTwoEntries]);
    const { container } = render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('entry-day-panel-toggle-2026-06-30'));
    const text = container.textContent ?? '';
    // Product B (08:00) must render before Product A (10:00) once expanded.
    expect(text.indexOf('Product B')).toBeLessThan(text.indexOf('Product A'));
  });

  it('shows the no-history message when there are no entries', () => {
    mockEntries([]);
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    expect(screen.getByText('No se encontró ninguna entrada')).toBeInTheDocument();
  });

  it('renders no product-name filter, no date-range filter, and no payment-type radio', () => {
    mockEntries([...dayOneEntries, ...dayTwoEntries]);
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    expect(screen.queryByPlaceholderText('Buscar')).not.toBeInTheDocument();
    expect(screen.queryByText('Desde')).not.toBeInTheDocument();
    expect(screen.queryByText('Hasta')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

// ─── EntriesPage — read-only history (Angular parity, diff-matrix #19) ──────
//
// Angular reference: entry-list.component.ts:22 `@Input() readOnly: boolean =
// true` + entries.component.html:46 `<app-entry-list [entries$]="...">` passes
// NO `[readOnly]` override, so the edit/delete menu
// (`isOwnerAdmin() && !readOnly`, entry-list.component.html:23) is ALWAYS
// hidden on this screen. `entries.component.html` also has NO "add new entry"
// button — that only exists on the separate Today Entries screen
// (today-entries.component.html:7). This is strict-parity removal per the
// orchestrator's decision on diff-matrix row #19.

describe('EntriesPage — read-only history (Angular parity, diff-matrix #19)', () => {
  it('renders no "Entrada" / add-entry button', () => {
    mockEntries([...dayOneEntries, ...dayTwoEntries]);
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument();
  });

  it('renders no row-level edit/deactivate actions once a day panel is expanded', () => {
    mockEntries([...dayOneEntries, ...dayTwoEntries]);
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('entry-day-panel-toggle-2026-06-30'));
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
    // Data still renders.
    expect(screen.getByText('Product A')).toBeInTheDocument();
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
        totalQuantity: 20,
        totalCostPrice: 100,
        products: [
          {
            productId: 'p1',
            productName: 'Ron',
            categoryId: 'cat-1',
            categoryName: 'Bebidas',
            totalAvailable: 20,
            avgCostPrice: 5,
          },
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
    // Scoped to the desktop table — the mobile card view (md:hidden) renders the same
    // "Bebidas - Ron" text a second time.
    const row = within(screen.getByRole('table')).getByText('Bebidas - Ron').closest('tr');
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
    expect(screen.getByText(/Ganancias del Día/i)).toBeInTheDocument();
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

    // Product row renders: name, sold=5, amount=50.00 and profit=50.00 (no cost, since no
    // productCosts were recorded) — proves the discountFromInvantory=false product was NOT
    // excluded and its sale is fully counted. Angular's table has no currency symbol in cells
    // (template uses `| number: '1.2-2'`, not `| currency`), so amounts render as plain "50.00".
    // Scoped to the desktop table — the mobile card view (md:hidden) renders the same
    // product text a second time.
    const row = within(screen.getByRole('table')).getByText(/Ron/).closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('5'); // sold
    expect(row).toHaveTextContent('50.00'); // amount (5 * price 10)
    expect(row).toHaveTextContent('0.00'); // unitCost/totalCost (no productCosts)
    // Total row reflects the same values since it's the only product/sale today.
    const totalRow = screen.getByText('Total').closest('tr');
    expect(totalRow).toHaveTextContent('50.00');
  });
});

// ─── InventoryTodaySalesProfitPage — Angular product-set filter (Stage 2.1 gap #3b) ─────────
//
// Angular sources the candidate product set via `.filter(p => p.isActive && p.availableToSale)`
// (inventory-today-sales-profit.component.ts:66-67), NOT from "whatever products happen to
// appear in today's sold order items". This matters beyond simple exclusion of
// inactive/non-sellable products: it is also the set gap #4's entry-only rows are drawn from —
// a product must be in this candidate set to ever surface as an entry-only row below.

function makeEntryView(overrides: Partial<InventoryEntryView> = {}): InventoryEntryView {
  return {
    id: 'e1',
    productId: 'p1',
    productName: '',
    quantity: 10,
    costPrice: 2,
    date: new Date(),
    isActive: true,
    ...overrides,
  };
}

describe('InventoryTodaySalesProfitPage — Angular product-set filter (gap #3b)', () => {
  beforeEach(() => {
    mockEgressProducts = [];
    mockEgressCategories = [];
  });

  it('excludes an inactive product even when it has today entries (would otherwise qualify as entry-only)', () => {
    mockEgressProducts = [makeEgressProduct({ id: 'p1', name: 'Ron', isActive: false })];
    vi.mocked(InventoryOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getByDate: vi.fn().mockReturnValue([makeEntryView({ productId: 'p1' })]),
          getAvailableByCategory: vi.fn().mockReturnValue([]),
          getAvailableQuantity: vi.fn().mockReturnValue({ hasEntries: false, available: 0 }),
          create: vi.fn(),
          update: vi.fn(),
          deactivate: vi.fn(),
        }) as unknown as InstanceType<typeof InventoryOfflineService>,
    );

    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );

    expect(screen.queryByText(/Ron/)).not.toBeInTheDocument();
  });

  it('excludes a non-availableToSale product even when it has today entries', () => {
    mockEgressProducts = [
      makeEgressProduct({ id: 'p1', name: 'NoVendible', isActive: true, availableToSale: false }),
    ];
    vi.mocked(InventoryOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getByDate: vi.fn().mockReturnValue([makeEntryView({ productId: 'p1' })]),
          getAvailableByCategory: vi.fn().mockReturnValue([]),
          getAvailableQuantity: vi.fn().mockReturnValue({ hasEntries: false, available: 0 }),
          create: vi.fn(),
          update: vi.fn(),
          deactivate: vi.fn(),
        }) as unknown as InstanceType<typeof InventoryOfflineService>,
    );

    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );

    expect(screen.queryByText(/NoVendible/)).not.toBeInTheDocument();
  });

  it('excludes an active & availableToSale product with neither sales nor today entries', () => {
    mockEgressProducts = [makeEgressProduct({ id: 'p1', name: 'SinActividad' })];
    // Default top-level mocks already return [] for getByDate and getActiveOrdersInDay.
    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );

    expect(screen.queryByText(/SinActividad/)).not.toBeInTheDocument();
    expect(screen.getByText('No hay ventas hoy')).toBeInTheDocument();
  });
});

// ─── InventoryTodaySalesProfitPage — entry-only rows (Stage 2.1 gap #4, Angular lines 98-104,
// 122-123) ─────────────────────────────────────────────────────────────────────────────────
//
// Angular includes a product in the report when `sold > 0 || hasTodayEntries(productId)`
// (line 123) — a product received today but not yet sold still surfaces, with an informational
// average unit cost from today's entries and totalCost=0 (contributes nothing to totals).

describe('InventoryTodaySalesProfitPage — entry-only rows (gap #4)', () => {
  beforeEach(() => {
    mockEgressProducts = [];
    mockEgressCategories = [makeCategory({ id: 'cat-1', name: 'Bebidas', order: 1 })];
  });

  it('includes a not-yet-sold product with today entries: sold=0, informational avg unitCost, totalCost=0, contributes 0 to totals', () => {
    mockEgressProducts = [
      makeEgressProduct({
        id: 'p1',
        name: 'Ron',
        categoryId: 'cat-1',
        categoryName: 'Bebidas',
        price: 15,
      }),
    ];
    vi.mocked(InventoryOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getByDate: vi.fn().mockReturnValue([
            makeEntryView({ id: 'e1', productId: 'p1', quantity: 10, costPrice: 2 }),
            makeEntryView({ id: 'e2', productId: 'p1', quantity: 10, costPrice: 4 }),
          ]),
          getAvailableByCategory: vi.fn().mockReturnValue([]),
          getAvailableQuantity: vi.fn().mockReturnValue({ hasEntries: false, available: 0 }),
          create: vi.fn(),
          update: vi.fn(),
          deactivate: vi.fn(),
        }) as unknown as InstanceType<typeof InventoryOfflineService>,
    );
    vi.mocked(OrderOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getActiveOrdersInDay: vi.fn().mockReturnValue([]),
        }) as unknown as InstanceType<typeof OrderOfflineService>,
    );

    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );

    // Scoped to the desktop table — the mobile card view (md:hidden) renders the same
    // product text a second time.
    const row = within(screen.getByRole('table')).getByText(/Ron/).closest('tr');
    expect(row).not.toBeNull();
    // sold = 0
    expect(row).toHaveTextContent('0');
    // avg unitCost = ((10*2) + (10*4)) / 20 = 3.00 (informational only)
    expect(row).toHaveTextContent('3.00');

    // Totals unaffected: nothing was sold, so sold/amount/cost/profit all stay at 0.
    const totalRow = screen.getByText('Total').closest('tr');
    expect(totalRow).toHaveTextContent('0.00');
  });
});

// ─── InventoryTodaySalesProfitPage — non-mutating FIFO cost (Angular-bug-handling, gap #3c
// documented deviation) ───────────────────────────────────────────────────────────────────
//
// Angular's `getAvailableInventoryCosts` (inventory-offline.service.ts:445-461) recomputes AND
// PERSISTS a FIFO cost allocation live on every profit-page render (`i.available -= ...` then
// `this.setCurrentInventoriesLocalStorage()`) — a genuine Angular bug: viewing the page twice
// double-deducts `available` for the same historical sale. Per the Angular-bug-handling policy,
// React mirrors the FIFO cost-allocation INTENT but sources it from each sold order item's
// `productCosts` — the FIFO cost breakdown already recorded, non-mutating, at the moment of the
// original sale (via `calculateOrderProfit`) — instead of re-deriving it live. These tests pin
// (1) correct FIFO cost for a multi-entry sale and (2) idempotence: rendering the page twice
// yields identical numbers and never mutates the underlying order/entry data.

describe('InventoryTodaySalesProfitPage — non-mutating FIFO cost (gap #3c, deliberate bug-fix over Angular)', () => {
  beforeEach(() => {
    mockEgressProducts = [
      makeEgressProduct({ id: 'p1', name: 'Ron', categoryId: 'cat-1', categoryName: 'Bebidas', price: 10 }),
    ];
    mockEgressCategories = [makeCategory({ id: 'cat-1', order: 1 })];
  });

  function makeOrderWithFifoSale(): Order {
    const orderItem: OrderItem = {
      productId: 'p1',
      productName: 'Ron',
      categoryId: 'cat-1',
      categoryName: 'Bebidas',
      name: 'Ron',
      quantity: 3,
      price: 10,
      productBusinessId: 'biz-1',
      // FIFO breakdown recorded at sale time: 2 units @ $2 + 1 unit @ $3 = totalCost 7.
      productCosts: [
        { id: 'e1', costPrice: 2, quantity: 2 },
        { id: 'e2', costPrice: 3, quantity: 1 },
      ],
      order: 1,
    };
    return {
      id: 'o1',
      orderItems: [orderItem],
      total: 30,
      itemsCount: 3,
      date: new Date(),
      type: OrderType.Normal,
      paymentType: PaymentType.Efectivo,
      isCredit: false,
      description: '',
      isActive: true,
      createdDate: new Date(),
      createdByName: 'test',
    };
  }

  it('computes correct FIFO cost for a sold product: amount=30.00, cost=7.00 (2@2 + 1@3), profit=23.00', () => {
    vi.mocked(OrderOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getActiveOrdersInDay: vi.fn().mockReturnValue([makeOrderWithFifoSale()]),
        }) as unknown as InstanceType<typeof OrderOfflineService>,
    );

    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );

    // Scoped to the desktop table — the mobile card view (md:hidden) renders the same
    // product text a second time.
    const row = within(screen.getByRole('table')).getByText(/Ron/).closest('tr');
    expect(row).toHaveTextContent('3'); // sold
    expect(row).toHaveTextContent('30.00'); // amount (3 * price 10)
    expect(row).toHaveTextContent('7.00'); // totalCost (FIFO: 2*2 + 1*3)
    expect(row).toHaveTextContent('23.00'); // profit (30 - 7)
  });

  it('is idempotent: rendering the page twice with the same fixtures yields identical totals and never mutates the source order/entries (no double-deduct, unlike Angular)', () => {
    const order = makeOrderWithFifoSale();
    const originalCosts = JSON.parse(JSON.stringify(order.orderItems[0].productCosts));

    vi.mocked(OrderOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getActiveOrdersInDay: vi.fn().mockReturnValue([order]),
        }) as unknown as InstanceType<typeof OrderOfflineService>,
    );
    const first = render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );
    const firstTotalText = screen.getByText('Total').closest('tr')?.textContent;
    first.unmount();

    vi.mocked(OrderOfflineService).mockImplementationOnce(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getActiveOrdersInDay: vi.fn().mockReturnValue([order]),
        }) as unknown as InstanceType<typeof OrderOfflineService>,
    );
    const second = render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );
    const secondTotalText = screen.getByText('Total').closest('tr')?.textContent;
    second.unmount();

    expect(secondTotalText).toBe(firstTotalText);
    // Mutation-bug guard: the order item's recorded productCosts must be byte-for-byte
    // untouched after two renders — proves React never re-ran a mutating FIFO deduction
    // against them (unlike Angular's getAvailableInventoryCosts, which would have decremented
    // `available` a second time on this second render).
    expect(order.orderItems[0].productCosts).toEqual(originalCosts);
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
