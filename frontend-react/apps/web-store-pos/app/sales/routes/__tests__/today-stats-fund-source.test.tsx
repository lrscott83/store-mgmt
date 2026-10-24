import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import {
  EModules,
  ExpenseFundSource,
  ExpenseType,
  OrderType,
  PaymentType,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';

/**
 * expense-fund-source (2026-10-24): el "Resumen Efectivo" del Cuadre del día
 * resta SOLO los gastos pagados con dinero de la caja. Un gasto externo —o un
 * histórico sin el campo, aunque se haya pagado en efectivo— no toca el cajón.
 */

const mockAuthState = {
  user: { selectedStoreId: 's1', storeModuleIds: [EModules.Expenses] as number[] },
  isAuthenticated: true,
};
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockAuthState) => unknown) => {
    if (typeof selector === 'function') return selector(mockAuthState);
    return mockAuthState;
  }),
}));

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

function expensesEnvelope(data: Expense[] = []) {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}
const mockGetExpensesInDayObservable = vi.fn().mockResolvedValue(expensesEnvelope([]));
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getExpensesInDayObservable: mockGetExpensesInDayObservable,
  })),
}));

function creditsEnvelope(data: SaleCredit[] = []) {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}
const mockGetUnPaidSaleCreditsInDayObservable = vi.fn().mockResolvedValue(creditsEnvelope([]));
const mockGetPaidSaleCreditsInDayObservable = vi.fn().mockResolvedValue(creditsEnvelope([]));
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
    itemsCount: 1,
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    salePaymentMethod: SalePaymentMethod.Efectivo,
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

import { TodayStatsPage } from '../today-stats';

async function renderWith(orders: Order[], expenses: Expense[]): Promise<void> {
  mockGetActiveOrdersInDay.mockReturnValue(orders);
  mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope(expenses));
  await act(async () => {
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
  });
}

describe('TodayStatsPage — expense fund source (expense-fund-source)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user.storeModuleIds = [EModules.Expenses];
    mockGetActiveOrdersInDay.mockReturnValue([]);
    mockGetCategoryCartItemsView.mockReturnValue(categoryEnvelope([]));
    mockGetExpensesInDayObservable.mockResolvedValue(expensesEnvelope([]));
    mockGetUnPaidSaleCreditsInDayObservable.mockResolvedValue(creditsEnvelope([]));
    mockGetPaidSaleCreditsInDayObservable.mockResolvedValue(creditsEnvelope([]));
  });

  it('subtracts a Caja expense from the cash summary', async () => {
    await renderWith(
      [makeOrder({ id: 'cash-1', total: 100 })],
      [makeExpense({ id: 'e-caja', total: 30, fundSource: ExpenseFundSource.Caja })],
    );

    expect(screen.getByRole('button', { name: /Resumen Efectivo/ })).toHaveTextContent('70 CUP');
  });

  it('does NOT subtract an Externo expense paid in cash', async () => {
    await renderWith(
      [makeOrder({ id: 'cash-1', total: 100 })],
      [
        makeExpense({
          id: 'e-externo',
          total: 50,
          paymentType: PaymentType.Efectivo,
          fundSource: ExpenseFundSource.Externo,
        }),
      ],
    );

    expect(screen.getByRole('button', { name: /Resumen Efectivo/ })).toHaveTextContent('100 CUP');
  });

  it('does NOT subtract a legacy expense with no fundSource field', async () => {
    await renderWith(
      [makeOrder({ id: 'cash-1', total: 100 })],
      [makeExpense({ id: 'e-legacy', total: 70, paymentType: PaymentType.Efectivo })],
    );

    expect(screen.getByRole('button', { name: /Resumen Efectivo/ })).toHaveTextContent('100 CUP');
  });

  it('still counts both origins in the expenses panel total', async () => {
    await renderWith(
      [makeOrder({ id: 'cash-1', total: 100 })],
      [
        makeExpense({ id: 'e-caja', total: 30, fundSource: ExpenseFundSource.Caja }),
        makeExpense({ id: 'e-externo', total: 50, fundSource: ExpenseFundSource.Externo }),
        makeExpense({ id: 'e-legacy', total: 70 }),
      ],
    );

    expect(screen.getByText('Gastos (3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resumen Efectivo/ })).toHaveTextContent('70 CUP');
  });

  it('does not read a Caja expense paid by transfer as a cash expense of another method', async () => {
    await renderWith(
      [makeOrder({ id: 'cash-1', total: 100 })],
      [
        makeExpense({
          id: 'e-caja-transfer',
          total: 40,
          fundSource: ExpenseFundSource.Caja,
          salePaymentMethod: SalePaymentMethod.Transferencia,
        }),
      ],
    );

    expect(screen.getByRole('button', { name: /Resumen Efectivo/ })).toHaveTextContent('60 CUP');
  });
});
