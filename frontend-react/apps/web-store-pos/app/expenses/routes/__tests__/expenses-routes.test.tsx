import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';

// ─── Global mocks ────────────────────────────────────────────────────────────

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getActiveToday: vi.fn().mockReturnValue([]),
    getByDateRange: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── TodayExpensesPage ───────────────────────────────────────────────────────

import { TodayExpensesPage } from '../today-expenses';

describe('TodayExpensesPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the today expenses title', () => {
    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Gastos del día/i)).toBeInTheDocument();
  });

  it('shows add button', () => {
    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    expect(screen.getByText('Gasto')).toBeInTheDocument();
  });

  it('shows running total', () => {
    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    // Running total line should be present (shows $0.00 when empty)
    expect(screen.getByText(/Total del día/i)).toBeInTheDocument();
  });

  // G-i18n: update()'s only failure branch is not-found. The route must surface the
  // localized EXPENSE_ERRORS.NOT_EXISTS text, never the internal Error.message sentinel.
  it('shows the localized not-found error when update fails', () => {
    const expense = {
      id: 'e1',
      type: ExpenseType.Comida,
      total: 20,
      date: new Date(),
      paymentType: PaymentType.Efectivo,
      note: '',
      isActive: true,
      createdDate: new Date(),
      createdByName: '',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockImpl = () =>
      ({
        getAll: vi.fn().mockReturnValue([expense]),
        getActiveToday: vi.fn().mockReturnValue([expense]),
        getByDateRange: vi.fn().mockReturnValue([expense]),
        create: vi.fn(),
        update: vi.fn(() => {
          throw new Error('EXPENSE_NOT_FOUND');
        }),
        delete: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
    // Scoped to exactly the 2 constructor calls this test triggers (mount load + save), so
    // the module-level mock reverts to its default (empty) implementation for later tests.
    vi.mocked(ExpenseOfflineService).mockImplementationOnce(mockImpl).mockImplementationOnce(mockImpl);

    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Guardar'));
    expect(screen.getByText('El gasto no existe.')).toBeInTheDocument();
  });
});

// ─── ExpensesHistoryPage ─────────────────────────────────────────────────────
// Strict Angular parity (Stage 3 decision doc): day-grouped accordion (collapsed by
// default, all-time — no date window), single payment-type radio filter, read-only
// (no add/edit/delete anywhere), no pagination, no date-range/expense-type filters.

import { ExpensesHistoryPage } from '../expenses-history';

function makeExpense(overrides: Partial<{
  id: string;
  total: number;
  date: Date;
  paymentType: PaymentType;
}> = {}) {
  return {
    id: overrides.id ?? 'e1',
    type: ExpenseType.Comida,
    total: overrides.total ?? 20,
    date: overrides.date ?? new Date('2024-03-15T10:00:00.000'),
    paymentType: overrides.paymentType ?? PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date('2024-03-15T10:00:00.000'),
    createdByName: '',
  };
}

describe('ExpensesHistoryPage — strict Angular parity', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([]),
          getActiveToday: vi.fn().mockReturnValue([]),
          getByDateRange: vi.fn().mockReturnValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );
  });

  it('renders without crashing', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the history title', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Historial de Gastos/i)).toBeInTheDocument();
  });

  it('has NO add button', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.queryByText('Gasto')).not.toBeInTheDocument();
  });

  it('shows the history-specific empty state when there are no expenses', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.getByText('No se enxontró ningún gasto')).toBeInTheDocument();
  });

  it('has NO date-range or expense-type filter controls', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.queryByLabelText(/Desde/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Hasta/i)).not.toBeInTheDocument();
  });

  it('has NO pagination controls', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.queryByLabelText(/Anterior/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Siguiente/i)).not.toBeInTheDocument();
  });

  it('shows a single payment-type radio filter (Todas/Efectivo/Tarjeta/Zelle)', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(screen.getByText('Todas')).toBeInTheDocument();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
    expect(screen.getByText('Zelle')).toBeInTheDocument();
  });

  it('groups expenses by day (collapsed by default), shows per-day count + total, and never renders edit/delete', () => {
    const day1 = makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 });
    const day1b = makeExpense({ id: 'b', date: new Date('2024-03-15T14:00:00.000'), total: 15 });
    const day2 = makeExpense({ id: 'c', date: new Date('2024-03-14T09:00:00.000'), total: 5 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([day1, day1b, day2]),
          getActiveToday: vi.fn().mockReturnValue([]),
          getByDateRange: vi.fn().mockReturnValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );

    // Overall header count/total (all-time, unbounded — no 30-day window).
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();

    // Day panels present; content collapsed by default.
    expect(screen.getByText('15/03/2024 (2)')).toBeInTheDocument();
    expect(screen.getByText('14/03/2024 (1)')).toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();

    // Expand the most-recent day; still no edit/delete actions (readOnly).
    fireEvent.click(screen.getByTestId('expense-day-panel-toggle-2024-03-15'));
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
  });

  it('filters by payment type', () => {
    const cash = makeExpense({ id: 'a', paymentType: PaymentType.Efectivo, total: 10 });
    const card = makeExpense({ id: 'b', paymentType: PaymentType.Tarjeta, total: 25 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          getAll: vi.fn().mockReturnValue([cash, card]),
          getActiveToday: vi.fn().mockReturnValue([]),
          getByDateRange: vi.fn().mockReturnValue([]),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.getByText('(2)')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Tarjeta'));
    expect(screen.getByText('(1)')).toBeInTheDocument();
    // $25.00 now appears twice: the header total and the (single) day-panel total.
    expect(screen.getAllByText('$25.00')).toHaveLength(2);
  });
});
