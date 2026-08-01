import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { ExpenseType, PaymentType, ExpenseErrors } from '@store-mgmt/domain';
import type { Expense } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';

// Category-C envelope helper: getExpensesInDayObservable resolves a BaseResponseModel<Expense[]>.
function expensesResponse(expenses: Expense[] = []) {
  return Promise.resolve({ data: expenses, succeeded: true, message: '', actionCode: 200, errors: [] });
}

// response-envelope-nullability WU-D — the resolved-failure shape both offline reads guard
// against, even though the local-storage read they wrap never actually produces it.
function expensesFailureResponse() {
  return Promise.resolve({
    data: null,
    succeeded: false as const,
    message: null,
    actionCode: null,
    errors: [{ code: 'E01', description: 'failed' }],
  });
}

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
    getStorageExpenses: vi.fn().mockReturnValue([]),
    getExpensesInDayObservable: vi.fn().mockReturnValue(expensesResponse([])),
    create: vi.fn().mockReturnValue({ data: undefined, succeeded: true, errors: [] }),
    update: vi.fn().mockReturnValue({ data: undefined, succeeded: true, errors: [] }),
    deleteExpense: vi.fn().mockReturnValue({ succeeded: true, errors: [] }),
  })),
}));

// T5 (Angular parity, expense-list.component.ts:52-68 onDeleteExpense): a confirmDialog Swal
// gates the delete — mock the shared wrapper rather than asserting on inline DOM text/buttons.
const confirmDialogMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
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

  it('does not show a running-total banner (Angular parity: expenses-today has none)', () => {
    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    // Angular's expenses-today.component.html has NO running-total banner — the
    // React-only banner was removed per the Stage 3 strict-parity decision.
    expect(screen.queryByText(/Total del día/i)).not.toBeInTheDocument();
  });

  // G-i18n: update()'s only failure branch is not-found. Angular parity: updateExpense returns
  // DataResult(undefined, false, [ExpenseErrors.NotExists]) — SYNC, never throws. The route
  // branches on `.succeeded` and surfaces the localized EXPENSE_ERRORS.NOT_EXISTS text.
  it('shows the localized not-found error when update fails', async () => {
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
    } as Expense;
    const mockImpl = () =>
      ({
        getStorageExpenses: vi.fn().mockReturnValue([expense]),
        getExpensesInDayObservable: vi.fn().mockReturnValue(expensesResponse([expense])),
        create: vi.fn().mockReturnValue({ data: undefined, succeeded: true, errors: [] }),
        update: vi.fn().mockReturnValue({
          data: undefined,
          succeeded: false,
          errors: [ExpenseErrors.NotExists],
        }),
        deleteExpense: vi.fn().mockReturnValue({ succeeded: true, errors: [] }),
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
    // loadExpenses is now async (getExpensesInDayObservable) — wait for the row to appear.
    fireEvent.click(await screen.findByTestId('expense-actions-toggle-e1'));
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Actualizar'));
    expect(screen.getByText('El gasto no existe.')).toBeInTheDocument();
  });
});

// T5 (Angular parity, expense-list.component.ts:52-68 onDeleteExpense): confirmDialog Swal
// (question icon, GENERAL.DELETE_CONFIRM_TITLE/MESSAGE with {name: GENERAL.EXPENSE},
// GENERAL.YES/NO) gates the delete — replaces the previous React-only div-modal confirmation.
describe('TodayExpensesPage — delete gated by confirmDialog (T5)', () => {
  function makeExpense(): Expense {
    return {
      id: 'e1',
      type: ExpenseType.Comida,
      total: 20,
      date: new Date(),
      paymentType: PaymentType.Efectivo,
      note: '',
      isActive: true,
      createdDate: new Date(),
      createdByName: '',
    } as Expense;
  }

  beforeEach(() => {
    confirmDialogMock.mockClear();
    confirmDialogMock.mockResolvedValue(true);
  });

  it('T5: confirms via confirmDialog with the exact Angular keys, then calls deleteExpense(id)', async () => {
    const expense = makeExpense();
    const deleteExpenseMock = vi.fn().mockReturnValue({ succeeded: true, errors: [] });
    const mockImpl = () =>
      ({
        getStorageExpenses: vi.fn().mockReturnValue([expense]),
        getExpensesInDayObservable: vi.fn().mockReturnValue(expensesResponse([expense])),
        create: vi.fn(),
        update: vi.fn(),
        deleteExpense: deleteExpenseMock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
    // 3 constructor calls: mount load, the delete handler's own instance, and the reload
    // triggered after a successful delete.
    vi.mocked(ExpenseOfflineService)
      .mockImplementationOnce(mockImpl)
      .mockImplementationOnce(mockImpl)
      .mockImplementationOnce(mockImpl);

    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByTestId('expense-actions-toggle-e1'));
    fireEvent.click(screen.getByText('Eliminar'));

    await waitFor(() =>
      expect(confirmDialogMock).toHaveBeenCalledWith({
        title: 'Confirmación para eliminar',
        message: '¿Está seguro que desea eliminar este Gasto?',
        confirmButtonText: 'Si',
        cancelButtonText: 'No',
      }),
    );
    await waitFor(() => expect(deleteExpenseMock).toHaveBeenCalledWith('e1'));
  });

  it('T5: does NOT call deleteExpense when the confirmDialog is cancelled', async () => {
    const expense = makeExpense();
    const deleteExpenseMock = vi.fn().mockReturnValue({ succeeded: true, errors: [] });
    const mockImpl = () =>
      ({
        getStorageExpenses: vi.fn().mockReturnValue([expense]),
        getExpensesInDayObservable: vi.fn().mockReturnValue(expensesResponse([expense])),
        create: vi.fn(),
        update: vi.fn(),
        deleteExpense: deleteExpenseMock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;
    vi.mocked(ExpenseOfflineService).mockImplementationOnce(mockImpl);
    confirmDialogMock.mockResolvedValueOnce(false);

    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByTestId('expense-actions-toggle-e1'));
    fireEvent.click(screen.getByText('Eliminar'));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalled());
    expect(deleteExpenseMock).not.toHaveBeenCalled();
  });
});

// response-envelope-nullability WU-D — BEHAVIORAL GAP, pinned not fixed.
// getExpensesInDayObservable succeeded:false silently swallows (no error state,
// no error UI) — same idiom as the sibling silent guards on this branch. This
// test pins the current behavior; it does not assert any new user-facing text.
describe('TodayExpensesPage — getExpensesInDayObservable succeeded:false (silent-failure idiom, pinned)', () => {
  it('leaves the list empty with no error UI when the response resolves with succeeded:false', async () => {
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
    } as Expense;
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          getStorageExpenses: vi.fn().mockReturnValue([expense]),
          getExpensesInDayObservable: vi.fn().mockReturnValue(expensesFailureResponse()),
          create: vi.fn(),
          update: vi.fn(),
          deleteExpense: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <TodayExpensesPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['EXPENSES.EMPTY_STATE'])).toBeInTheDocument();
    });
    expect(screen.queryByTestId('expense-actions-toggle-e1')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
          filterExpensesObservable: vi.fn().mockReturnValue(expensesResponse([])),
          create: vi.fn(),
          update: vi.fn(),
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
    expect(screen.getByText('No se encontró ningún gasto')).toBeInTheDocument();
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

  // Parity fix (presentation-parity-bucket-e item 1b): expenses.component.html:15-23 shows the
  // payment glyph before each real payment-type label, but the "Todas" (null) option has none.
  it('shows a PaymentMethodIcon before each real payment-type label, but not before "Todas"', () => {
    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );

    const todasLabel = screen.getByText('Todas').closest('label');
    expect(todasLabel?.querySelector('svg')).toBeNull();

    for (const text of ['Efectivo', 'Tarjeta', 'Zelle']) {
      const label = screen.getByText(text).closest('label');
      expect(label?.querySelector('svg')).not.toBeNull();
    }
  });

  it('groups expenses by day (collapsed by default), shows per-day count + total, and never renders edit/delete', async () => {
    const day1 = makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 });
    const day1b = makeExpense({ id: 'b', date: new Date('2024-03-15T14:00:00.000'), total: 15 });
    const day2 = makeExpense({ id: 'c', date: new Date('2024-03-14T09:00:00.000'), total: 5 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          filterExpensesObservable: vi.fn().mockReturnValue(expensesResponse([day1, day1b, day2])),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );

    // Overall header count/total (all-time, unbounded — no 30-day window).
    // loadExpenses is now async (filterExpensesObservable) — wait for the grouped data to render.
    expect(await screen.findByText('(3)')).toBeInTheDocument();
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

  // Parity fix (collapsible-panel-chevron-parity): the day-panel header must render the
  // shared ChevronDownIcon and rotate it (rotate-180) iff the panel is expanded.
  it('renders a chevron on the day-panel header that rotates iff the panel is expanded', async () => {
    const day1 = makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          filterExpensesObservable: vi.fn().mockReturnValue(expensesResponse([day1])),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );

    const toggle = await screen.findByTestId('expense-day-panel-toggle-2024-03-15');
    const svgClass = () => toggle.querySelector('svg')?.getAttribute('class') ?? '';
    expect(toggle.querySelector('svg')).toBeInTheDocument();
    expect(svgClass()).not.toContain('rotate-180');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Toggle behavior unchanged: clicking still expands the panel (aria-expanded flips)
    // AND the chevron rotates in lockstep.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(svgClass()).toContain('rotate-180');
  });

  it('filters by payment type', async () => {
    const cash = makeExpense({ id: 'a', paymentType: PaymentType.Efectivo, total: 10 });
    const card = makeExpense({ id: 'b', paymentType: PaymentType.Tarjeta, total: 25 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          // Mirror the real filterExpensesObservable: filter the day's expenses by the
          // paymentType arg the page passes (Angular's only wired filter control).
          filterExpensesObservable: vi.fn((_type: unknown, pt: PaymentType | undefined) =>
            expensesResponse([cash, card].filter((e) => !pt || e.paymentType === pt)),
          ),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );
    expect(await screen.findByText('(2)')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Tarjeta'));
    expect(await screen.findByText('(1)')).toBeInTheDocument();
    // $25.00 now appears twice: the header total and the (single) day-panel total.
    expect(screen.getAllByText('$25.00')).toHaveLength(2);
  });
});

// response-envelope-nullability WU-D — BEHAVIORAL GAP, pinned not fixed.
// filterExpensesObservable succeeded:false silently swallows (no error state, no
// error UI) — same idiom as the sibling silent guards on this branch. This test
// pins the current behavior; it does not assert any new user-facing text.
describe('ExpensesHistoryPage — filterExpensesObservable succeeded:false (silent-failure idiom, pinned)', () => {
  it('shows the empty state with no error UI when the response resolves with succeeded:false', async () => {
    const day1 = makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          filterExpensesObservable: vi.fn().mockReturnValue(expensesFailureResponse()),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <ExpensesHistoryPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('No se encontró ningún gasto')).toBeInTheDocument();
    });
    expect(screen.queryByText(`$${day1.total}.00`)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
