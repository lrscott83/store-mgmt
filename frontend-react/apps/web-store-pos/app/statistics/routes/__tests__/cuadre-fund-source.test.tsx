import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import {
  Currency,
  EModules,
  ExpenseFundSource,
  OrderType,
  PaymentType,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { CuadrePorFechasPage } from '../cuadre-por-fechas';

/**
 * expense-fund-source (2026-10-24): el panel "Resumen Efectivo" del Cuadre por
 * fechas resta SOLO los gastos con origen `Caja`. Un gasto `Externo` —o un
 * histórico sin el campo, aunque se pagara en efectivo— no reduce el efectivo.
 * El total de gastos sigue sumando los dos orígenes.
 */

const auth = vi.hoisted(() => ({
  state: {
    user: { selectedStoreId: 's1', storeModuleIds: [] as number[] },
    isAuthenticated: true,
  },
}));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof auth.state) => unknown) =>
    typeof selector === 'function' ? selector(auth.state) : auth.state,
  ),
}));

const multiStore = vi.hoisted(() => ({
  enabled: false,
  stores: [] as { id: string; name: string }[],
}));
vi.mock('~/shared/lib/hooks/use-multi-store', () => ({
  useMultiStore: () => ({ enabled: multiStore.enabled, stores: multiStore.stores }),
}));

const fixtures = vi.hoisted(() => ({
  ordersBetween: [] as Order[],
  expenses: [] as Expense[],
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersPriceBetweenDates: vi.fn(() => 0),
    getActiveOrdersProfitBetweenDates: vi.fn(() => 0),
    getActiveOrdersBetween: vi.fn(() => fixtures.ordersBetween),
    getCategoryCartItemsViewBetweenDates: vi.fn(() => ({
      data: [],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    })),
  })),
}));
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getActiveExpensesBetween: vi.fn(() => fixtures.expenses),
  })),
}));
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getUnPaidSaleCreditsBetween: vi.fn(() => [] as SaleCredit[]),
    getPaidSaleCreditsBetween: vi.fn(() => [] as SaleCredit[]),
  })),
}));
vi.mock('~/sales/components/category-stats', () => ({
  CategoryStats: ({ category }: { category: { id: string; name: string } }) => (
    <div data-testid={`category-stats-${category.id}`}>{category.name}</div>
  ),
}));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date: new Date('2026-09-02T10:00:00'),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    salePaymentMethod: SalePaymentMethod.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    currency: Currency.CUP,
    createdDate: new Date('2026-09-02T10:00:00'),
    createdByName: 'test',
    ...overrides,
  } as Order;
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: `exp-${Math.random().toString(36).slice(2)}`,
    type: 1,
    total: 20,
    date: new Date('2026-09-02T10:00:00'),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    currency: Currency.CUP,
    createdDate: new Date('2026-09-02T10:00:00'),
    createdByName: 'test',
    ...overrides,
  } as Expense;
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <CuadrePorFechasPage />
    </IntlProvider>,
  );
}

function generate() {
  fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-07' } });
  fireEvent.click(screen.getByTestId('cuadre-generate'));
}

function cashPanel(): HTMLElement {
  return screen.getByRole('button', { name: /Resumen Efectivo/ });
}

/** Importe exacto del header del panel (primer span con whitespace-nowrap). */
function panelAmount(panel: HTMLElement): string {
  return (panel.querySelector('span.whitespace-nowrap')?.textContent ?? '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

describe('CuadrePorFechasPage — expense fund source (expense-fund-source)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    multiStore.enabled = false;
    multiStore.stores = [];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [EModules.Expenses] };
    fixtures.ordersBetween = [];
    fixtures.expenses = [];
  });

  it('subtracts a Caja expense from the cash panel', async () => {
    fixtures.ordersBetween = [makeOrder({ id: 'cash-1', total: 100 })];
    fixtures.expenses = [
      makeExpense({ id: 'caja', total: 30, fundSource: ExpenseFundSource.Caja }),
    ];

    renderPage();
    generate();

    await waitFor(() => expect(cashPanel()).toHaveTextContent('70 CUP'));
    expect(panelAmount(cashPanel())).toBe('70 CUP');
  });

  it('does NOT subtract an Externo expense paid in cash', async () => {
    fixtures.ordersBetween = [makeOrder({ id: 'cash-1', total: 100 })];
    fixtures.expenses = [
      makeExpense({
        id: 'externo',
        total: 50,
        paymentType: PaymentType.Efectivo,
        fundSource: ExpenseFundSource.Externo,
      }),
    ];

    renderPage();
    generate();

    await waitFor(() => expect(panelAmount(cashPanel())).toBe('100 CUP'));
  });

  it('does NOT subtract a legacy expense with no fundSource field', async () => {
    fixtures.ordersBetween = [makeOrder({ id: 'cash-1', total: 100 })];
    fixtures.expenses = [makeExpense({ id: 'legacy', total: 70 })];

    renderPage();
    generate();

    await waitFor(() => expect(panelAmount(cashPanel())).toBe('100 CUP'));
  });

  it('keeps the expenses KPI summing both origins', async () => {
    fixtures.ordersBetween = [makeOrder({ id: 'cash-1', total: 100 })];
    fixtures.expenses = [
      makeExpense({ id: 'caja', total: 30, fundSource: ExpenseFundSource.Caja }),
      makeExpense({ id: 'externo', total: 50, fundSource: ExpenseFundSource.Externo }),
      makeExpense({ id: 'legacy', total: 70 }),
    ];

    renderPage();
    generate();

    const grid = await screen.findByTestId('cuadre-kpi-grid');
    expect(within(grid).getByText('Gastos')).toBeInTheDocument();
    expect(within(grid).getAllByText(/150 CUP/).length).toBeGreaterThan(0);
    expect(panelAmount(cashPanel())).toBe('70 CUP');
  });
});
