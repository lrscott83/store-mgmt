import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { PaymentType, OrderType, ExpenseType, EModules } from '@store-mgmt/domain';
import type { Order, Expense, SaleCredit } from '@store-mgmt/domain';

// --- Mocks (mutable state — set per-test via mockAuthState.user.storeModuleIds) ---

const mockAuthState = {
  user: { selectedStoreId: 's1', storeModuleIds: [] as number[] },
  isAuthenticated: true,
};
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockAuthState) => unknown) => {
    if (typeof selector === 'function') return selector(mockAuthState);
    return mockAuthState;
  }),
}));

// Category-B envelope helper: getCategoryCartItemsView returns a sync BaseResponseModel<CategoryCartItemsView[]>.
function categoryEnvelope(data: unknown[] = []) {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}

const mockGetActiveOrdersInDay = vi.fn().mockReturnValue([] as Order[]);
const mockGetCategoryCartItemsView = vi.fn().mockReturnValue(categoryEnvelope([]));
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersInDay: mockGetActiveOrdersInDay,
    getCategoryCartItemsView: mockGetCategoryCartItemsView,
  })),
}));

// Category-C envelope helper: getExpensesInDayObservable resolves a BaseResponseModel<Expense[]>.
function expensesEnvelope(data: Expense[] = []) {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}
const mockGetExpensesInDayObservable = vi
  .fn()
  .mockResolvedValue(expensesEnvelope([]));
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getExpensesInDayObservable: mockGetExpensesInDayObservable,
  })),
}));

// Category-C envelope helper: getUn/PaidSaleCreditsInDayObservable resolve a
// BaseResponseModel<SaleCredit[]>.
function creditsEnvelope(data: SaleCredit[] = []) {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}
const mockGetUnPaidSaleCreditsInDayObservable = vi
  .fn()
  .mockResolvedValue(creditsEnvelope([]));
const mockGetPaidSaleCreditsInDayObservable = vi
  .fn()
  .mockResolvedValue(creditsEnvelope([]));
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getUnPaidSaleCreditsInDayObservable: mockGetUnPaidSaleCreditsInDayObservable,
    getPaidSaleCreditsInDayObservable: mockGetPaidSaleCreditsInDayObservable,
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderItems: [],
    total: 100,
    itemsCount: 2,
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    type: ExpenseType.Otro,
    total: 20,
    date: new Date(),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function makeCredit(overrides: Partial<SaleCredit> = {}): SaleCredit {
  return {
    id: 'credit-1',
    orderId: 'order-1',
    client: 'Ana',
    total: 50,
    date: new Date(),
    paid: 0,
    isPaid: false,
    isActive: true,
    paidDate: null as unknown as Date,
    paidType: null as unknown as PaymentType,
    note: '',
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

import { TodayStatsPage } from '../today-stats';

describe('TodayStatsPage (Angular today-stats.component.html 1:1 port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user.storeModuleIds = [];
    mockGetActiveOrdersInDay.mockReturnValue([]);
    mockGetCategoryCartItemsView.mockReturnValue(categoryEnvelope([]));
    mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope([]));
    mockGetUnPaidSaleCreditsInDayObservable.mockResolvedValue(creditsEnvelope([]));
    mockGetPaidSaleCreditsInDayObservable.mockResolvedValue(creditsEnvelope([]));
  });

  it('renders the Angular header (Cuadre del día)', () => {
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.getByText('Cuadre del día')).toBeInTheDocument();
  });

  it('renders a Resumen Efectivo panel with a Ventas row (Gastos row hidden — module unavailable)', () => {
    mockGetActiveOrdersInDay.mockReturnValue([
      makeOrder({ paymentType: PaymentType.Efectivo, isCredit: false, total: 100 }),
    ]);
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.getByText('Resumen Efectivo')).toBeInTheDocument();
    // Panel body (the "Ventas" row) is collapsed by default — expand it first.
    fireEvent.click(screen.getByRole('button', { name: /Resumen Efectivo/ }));
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    // No expenses module available in default mock user -> Gastos row and panel hidden
    expect(screen.queryByText('Gastos')).toBeNull();
  });

  it('computes salesCashTotal from active orders with paymentType=Efectivo and isCredit=false', () => {
    mockGetActiveOrdersInDay.mockReturnValue([
      makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo, isCredit: false, total: 100 }),
      makeOrder({ id: 'o2', paymentType: PaymentType.Tarjeta, isCredit: false, total: 999 }),
      makeOrder({ id: 'o3', paymentType: PaymentType.Efectivo, isCredit: true, total: 999 }),
    ]);
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    // salesCashTotal = 100 only (excludes card payment + credit sale)
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
  });

  it('renders a Ventas ({itemsCount} productos) panel using getCategoryCartItemsView totals', () => {
    mockGetCategoryCartItemsView.mockReturnValue(
      categoryEnvelope([
        { id: 'cat1', name: 'Bebidas', order: 1, total: 30, itemsCount: 4, productItems: [] },
      ]),
    );
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ventas (4 productos)')).toBeInTheDocument();
  });

  it('does not render Gastos or Créditos panels when modules are unavailable', () => {
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.queryByText(/^Gastos \(/)).toBeNull();
    expect(screen.queryByText(/^Créditos Por Cobrar/)).toBeNull();
    expect(screen.queryByText(/^Créditos Pagados/)).toBeNull();
  });
});

describe('TodayStatsPage — with Expenses + Credits modules available', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user.storeModuleIds = [EModules.Expenses, EModules.Credits];
    mockGetActiveOrdersInDay.mockReturnValue([]);
    mockGetCategoryCartItemsView.mockReturnValue(categoryEnvelope([]));
  });

  it('renders Gastos and Créditos panels when the user has those modules', async () => {
    mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope([makeExpense({ total: 15 })]));
    mockGetUnPaidSaleCreditsInDayObservable.mockResolvedValue(
      creditsEnvelope([makeCredit({ total: 40 })]),
    );
    mockGetPaidSaleCreditsInDayObservable.mockResolvedValue(
      creditsEnvelope([makeCredit({ id: 'c2', isPaid: true, total: 60 })]),
    );

    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );

    // Expenses/credits now load via async *Observable methods — wait for each to settle.
    expect(await screen.findByText('Gastos (1)')).toBeInTheDocument();
    expect(await screen.findByText('Créditos Por Cobrar (1)')).toBeInTheDocument();
    // Angular's literal template bug: header shows getPaidSaleCreditsTotal() (a currency
    // sum), not a count, inside the "(...)" slot — preserved verbatim, see today-stats.tsx.
    expect(await screen.findByText('Créditos Pagados (60)')).toBeInTheDocument();
  });

  // Parity fix (presentation-parity-bucket-e item 1a): Angular's expense-list.component.html:12
  // renders the payment-method glyph immediately before the total amount — React's Gastos row
  // in Cuadre del día had lost it.
  it('renders a PaymentMethodIcon immediately before the Gastos row total (Angular parity)', async () => {
    mockGetExpensesInDayObservable.mockResolvedValue(
      expensesEnvelope([makeExpense({ total: 15, paymentType: PaymentType.Tarjeta })]),
    );

    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );

    const toggle = await screen.findByRole('button', { name: /Gastos \(1\)/ });
    fireEvent.click(toggle);

    const row = screen.getByText('Otro').closest('tr');
    expect(row).not.toBeNull();
    const totalWrapper = within(row as HTMLElement).getByText('$15.00');
    expect(totalWrapper.firstChild?.nodeName.toLowerCase()).toBe('svg');
  });

  // Parity fix (collapsible-panel-chevron-parity): ExpansionPanel converts from uncontrolled
  // <details>/<summary> to a controlled div+button+useState+conditional-body pattern (matching
  // the other 6 list-screen panels), preserving exact default-collapsed + independent-toggle
  // semantics (guards ADR-2), and now renders a rotating ChevronDownIcon.
  describe('ExpansionPanel — controlled restructure (collapsible-panel-chevron-parity)', () => {
    it('defaults every panel to collapsed (body not rendered)', async () => {
      mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope([makeExpense({ total: 15 })]));
      mockGetUnPaidSaleCreditsInDayObservable.mockResolvedValue(
        creditsEnvelope([makeCredit({ total: 40, client: 'Ana' })]),
      );

      render(
        <Wrapper>
          <TodayStatsPage />
        </Wrapper>,
      );

      // Panel headers/titles are always visible (they're on the button itself)...
      expect(await screen.findByText('Gastos (1)')).toBeInTheDocument();
      expect(await screen.findByText('Créditos Por Cobrar (1)')).toBeInTheDocument();
      // ...but panel BODY content is not rendered until expanded.
      expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    });

    it('opens a panel on click, revealing its body, and renders a chevron rotated only while open', async () => {
      mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope([makeExpense({ total: 15 })]));

      render(
        <Wrapper>
          <TodayStatsPage />
        </Wrapper>,
      );

      const toggle = await screen.findByRole('button', { name: /Gastos \(1\)/ });
      const svgClass = () => toggle.querySelector('svg')?.getAttribute('class') ?? '';
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(svgClass()).not.toContain('rotate-180');
      expect(screen.queryByText('Otro')).not.toBeInTheDocument(); // EXPENSES.TYPE.OTRO row, body-only

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(svgClass()).toContain('rotate-180');
      expect(screen.getByText('Otro')).toBeInTheDocument();
    });

    it('closes an open panel on a second click (body removed again, chevron un-rotates)', async () => {
      mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope([makeExpense({ total: 15 })]));

      render(
        <Wrapper>
          <TodayStatsPage />
        </Wrapper>,
      );

      const toggle = await screen.findByRole('button', { name: /Gastos \(1\)/ });
      fireEvent.click(toggle);
      expect(screen.getByText('Otro')).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle.querySelector('svg')?.getAttribute('class') ?? '').not.toContain('rotate-180');
      expect(screen.queryByText('Otro')).not.toBeInTheDocument();
    });

    it('toggles two panel instances independently', async () => {
      mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope([makeExpense({ total: 15 })]));
      mockGetUnPaidSaleCreditsInDayObservable.mockResolvedValue(
        creditsEnvelope([makeCredit({ total: 40, client: 'Ana' })]),
      );

      render(
        <Wrapper>
          <TodayStatsPage />
        </Wrapper>,
      );

      const expensesToggle = await screen.findByRole('button', { name: /Gastos \(1\)/ });
      const creditsToggle = screen.getByRole('button', { name: /Créditos Por Cobrar \(1\)/ });

      // Expand only the Gastos panel — Créditos body must stay collapsed.
      fireEvent.click(expensesToggle);
      expect(screen.getByText('Otro')).toBeInTheDocument();
      expect(screen.queryByText('Ana')).not.toBeInTheDocument();

      // Now expand the Créditos panel too — both bodies visible, independently controlled.
      fireEvent.click(creditsToggle);
      expect(screen.getByText('Otro')).toBeInTheDocument();
      expect(screen.getByText('Ana')).toBeInTheDocument();

      // Collapsing Gastos again must not affect the still-open Créditos panel.
      fireEvent.click(expensesToggle);
      expect(screen.queryByText('Otro')).not.toBeInTheDocument();
      expect(screen.getByText('Ana')).toBeInTheDocument();
    });
  });
});
