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
    expect(screen.getByText(/Gastos de hoy/i)).toBeInTheDocument();
  });

  it('shows add button', () => {
    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Nuevo gasto/i)).toBeInTheDocument();
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

import { ExpensesHistoryPage } from '../expenses-history';

describe('ExpensesHistoryPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
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
    expect(screen.getByText(/Historial de gastos/i)).toBeInTheDocument();
  });

  it('has NO add button', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    // "Nuevo gasto" must NOT appear in history
    expect(screen.queryByText(/Nuevo gasto/i)).not.toBeInTheDocument();
  });

  it('has NO delete button when list is empty', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.queryByText(/Eliminar/i)).not.toBeInTheDocument();
  });

  it('shows date filter controls', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.getByLabelText(/Desde/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hasta/i)).toBeInTheDocument();
  });

  it('shows pagination controls', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(screen.getByLabelText(/Anterior/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Siguiente/i)).toBeInTheDocument();
  });
});
