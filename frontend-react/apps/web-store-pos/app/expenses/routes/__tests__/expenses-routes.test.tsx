import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules, ExpenseType, PaymentType, ExpenseErrors } from '@store-mgmt/domain';
import type { Expense } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';

// Category-C envelope helper: getExpensesInDayObservable resolves a BaseResponseModel<Expense[]>.
function expensesResponse(expenses: Expense[] = []) {
  return Promise.resolve({
    data: expenses,
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  });
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

// --- Mutable auth state (multi-store-panels): single-store by default;
// the multistore describe flips it to a MultiStores OwnerAdmin so the REAL
// useMultiStore gate decides the mode. Restored after each test. ---
const { authStoreState } = vi.hoisted(() => ({
  authStoreState: {
    user: { selectedStoreId: 's1' },
    isAuthenticated: true,
  } as {
    user: {
      selectedStoreId: string;
      isOwnerAdmin?: boolean;
      storeModuleIds?: number[];
      storeList?: Array<{ id: string; name: string; isActive?: boolean }>;
    };
    isAuthenticated: boolean;
  },
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn(
    (selector?: (s: typeof authStoreState) => unknown) =>
      typeof selector === 'function' ? selector(authStoreState) : authStoreState,
  );
  return { useAuthStore };
});

// multi-store-panels: per-store expense fixture shared by the aggregator read
// path (multi-store mode). The single-store mode never calls these.
const { storeExpensesFixture } = vi.hoisted(() => ({
  storeExpensesFixture: {} as Record<string, Expense[]>,
}));

vi.mock('~/shared/lib/multistore/multi-store-aggregator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/shared/lib/multistore/multi-store-aggregator')>();
  return {
    ...actual,
    unwrapStoreDek: vi.fn().mockResolvedValue(new Uint8Array([1])),
    readStoreExpenses: vi.fn((storeId: string) => storeExpensesFixture[storeId] ?? []),
  };
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

  it('renders without crashing', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <TodayExpensesPage />
        </Wrapper>,
      );
    });
    expect(document.body).toBeTruthy();
  });

  it('shows the today expenses title', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <TodayExpensesPage />
        </Wrapper>,
      );
    });
    expect(screen.getByText(/Gastos del día/i)).toBeInTheDocument();
  });

  it('shows add button', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <TodayExpensesPage />
        </Wrapper>,
      );
    });
    expect(screen.getByText('Gasto')).toBeInTheDocument();
  });

  it('does not show a running-total banner (Angular parity: expenses-today has none)', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <TodayExpensesPage />
        </Wrapper>,
      );
    });
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
    vi.mocked(ExpenseOfflineService)
      .mockImplementationOnce(mockImpl)
      .mockImplementationOnce(mockImpl);

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

function makeExpense(
  overrides: Partial<{
    id: string;
    total: number;
    date: Date;
    paymentType: PaymentType;
  }> = {},
) {
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

  it('renders without crashing', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    expect(document.body).toBeTruthy();
  });

  it('shows the history title', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    // 2026-09-20 (owner): el header del historial muestra solo «Gastos».
    expect(screen.getByText('Gastos')).toBeInTheDocument();
    expect(screen.queryByText(/Historial de Gastos/i)).not.toBeInTheDocument();
  });

  it('has NO add button', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    expect(screen.queryByText('Gasto')).not.toBeInTheDocument();
  });

  it('shows the history-specific empty state when there are no expenses', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    expect(screen.getByText('No se encontró ningún gasto')).toBeInTheDocument();
  });

  it('has a date-range filter (2026-09-23, right-aligned) but no expense-type filter control', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    // Mismo DateRangeFilter compartido que entries/credits…
    expect(screen.getByTestId('date-range-filter-input')).toBeInTheDocument();
    expect(screen.getByTestId('date-range-filter-button')).toBeInTheDocument();
    // …alineado a la derecha (contenedor justify-end).
    expect(screen.getByTestId('date-range-filter-input').closest('.justify-end')).not.toBeNull();
    // Los inputs Desde/Hasta viven en el popover, cerrado por defecto.
    expect(screen.queryByLabelText(/Desde/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Hasta/i)).not.toBeInTheDocument();
  });

  it('has NO pagination controls', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    expect(screen.queryByLabelText(/Anterior/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Siguiente/i)).not.toBeInTheDocument();
  });

  // Filtro DINÁMICO (2026-09-19): las opciones salen de los gastos cargados —
  // con datos Efectivo/Tarjeta/Zelle se ofrecen las tres etiquetas resueltas.
  it('shows the dynamic payment-type options present in the data (Todas + Efectivo/Transferencia (CUP)/Zelle)', async () => {
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          filterExpensesObservable: vi.fn().mockReturnValue(
            expensesResponse([
              makeExpense({ id: 'a', paymentType: PaymentType.Efectivo }),
              makeExpense({ id: 'b', paymentType: PaymentType.Tarjeta }),
              makeExpense({ id: 'c', paymentType: PaymentType.Zelle }),
            ]),
          ),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(screen.getByText('Todas')).toBeInTheDocument();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
    expect(screen.getByText('Zelle')).toBeInTheDocument();
  });

  // Sin gastos no se ofrece NINGUNA opción de método (solo Todas).
  it('offers no payment-method options when there are no expenses', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    expect(screen.getByText('Todas')).toBeInTheDocument();
    expect(screen.queryByText('Efectivo')).not.toBeInTheDocument();
    expect(screen.queryByText('Transferencia (CUP)')).not.toBeInTheDocument();
    expect(screen.queryByText('Zelle')).not.toBeInTheDocument();
  });

  // Text-only (petición 2026-09-21): las formas de pago ya no muestran ícono — solo el
  // texto de la etiqueta, ni en las opciones ni en "Todas".
  it('renders payment-type filter labels as text-only, with no icon SVG before them', async () => {
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          filterExpensesObservable: vi.fn().mockReturnValue(
            expensesResponse([
              makeExpense({ id: 'a', paymentType: PaymentType.Efectivo }),
              makeExpense({ id: 'b', paymentType: PaymentType.Tarjeta }),
              makeExpense({ id: 'c', paymentType: PaymentType.Zelle }),
            ]),
          ),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });

    const todasLabel = screen.getByText('Todas').closest('label');
    expect(todasLabel?.querySelector('svg')).toBeNull();

    for (const text of ['Efectivo', 'Transferencia (CUP)', 'Zelle']) {
      const label = screen.getByText(text).closest('label');
      expect(label?.querySelector('svg')).toBeNull();
    }
  });

  // Dinámico: filtrar por Transferencia (CUP) deja solo los gastos legacy Tarjeta.
  it('filters by Transferencia (CUP) leaving only legacy-Tarjeta expenses', async () => {
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          filterExpensesObservable: vi.fn().mockReturnValue(
            expensesResponse([
              makeExpense({ id: 'a', paymentType: PaymentType.Efectivo, total: 10 }),
              makeExpense({ id: 'b', paymentType: PaymentType.Tarjeta, total: 15 }),
              makeExpense({ id: 'c', paymentType: PaymentType.Zelle, total: 5 }),
            ]),
          ),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );
    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });

    fireEvent.click(screen.getByText('Transferencia (CUP)'));
    // Solo el gasto Tarjeta (15): header (1) y total 15\u00A0CUP (también en el panel del día).
    expect(screen.getAllByText('(1)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15 CUP').length).toBeGreaterThan(0);
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
    expect(screen.getByText('30 CUP')).toBeInTheDocument();

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

  // Local-day grouping parity (orders.tsx local-grouping pattern): a late-evening expense must
  // group under ITS OWN local day — at a negative UTC offset the UTC key would have grouped it
  // under the NEXT day while it renders as the current one.
  it('groups expenses by LOCAL calendar day — a late-evening expense stays on its own local day', async () => {
    const late = makeExpense({ id: 'a', date: new Date(2024, 2, 15, 23, 30, 0), total: 10 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          filterExpensesObservable: vi.fn().mockReturnValue(expensesResponse([late])),
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

    expect(await screen.findByTestId('expense-day-panel-toggle-2024-03-15')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^expense-day-panel-toggle-/)).toHaveLength(1);
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

    fireEvent.click(screen.getByLabelText('Transferencia (CUP)'));
    expect(await screen.findByText('(1)')).toBeInTheDocument();
    // 25\u00A0CUP now appears twice: the header total and the (single) day-panel total.
    expect(screen.getAllByText('25 CUP')).toHaveLength(2);
  });

  it('date-range filter (2026-09-23): limits the history to the selected range, end day INCLUSIVE', async () => {
    const inRange = makeExpense({ id: 'a', date: new Date('2024-03-15T10:00:00.000'), total: 10 });
    const outOfRange = makeExpense({ id: 'b', date: new Date('2024-03-16T11:00:00.000'), total: 25 });
    vi.mocked(ExpenseOfflineService).mockImplementation(
      () =>
        ({
          // Mirror the REAL filterExpensesObservable: RAW comparisons with an
          // EXCLUSIVE end (half-open [start, end)) — the page sails the end
          // window to next-day midnight so the picked end day is included.
          filterExpensesObservable: vi.fn(
            (_t: unknown, _p: unknown, start?: Date, end?: Date) =>
              expensesResponse(
                [inRange, outOfRange].filter(
                  (e) => (!start || new Date(e.date) >= start) && (!end || new Date(e.date) < end),
                ),
              ),
          ),
          create: vi.fn(),
          update: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });
    expect(await screen.findByText('(2)')).toBeInTheDocument();

    // Popover: 15/03 → 15/03, Seleccionar, y aplicar con la lupa.
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2024-03-15' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2024-03-15' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    fireEvent.click(screen.getByTestId('date-range-filter-button'));

    // Solo el gasto del 15/03 (el del 16 queda fuera): header (1) y 10\u00A0CUP.
    expect(await screen.findAllByText('(1)').then((els) => els.length)).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('10 CUP').length).toBeGreaterThan(0);
    expect(screen.queryByText('25 CUP')).not.toBeInTheDocument();
    expect(screen.queryByText('(2)')).not.toBeInTheDocument();
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

// ─── ExpensesHistoryPage — multi-store-panels ────────────────────────────────
// OwnerAdmin + MultiStores + ≥2 tiendas activas → filtros GLOBALES fuera de
// los paneles, un panel colapsable por tienda con acordeón por día y totales
// fuera de los paneles. Sin MultiStores la vista es idéntica a la original
// (los describes anteriores pinchan ese modo con este mismo archivo).
describe('ExpensesHistoryPage — modo multistore (paneles por tienda)', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const key of Object.keys(storeExpensesFixture)) delete storeExpensesFixture[key];
    authStoreState.user = {
      selectedStoreId: 's1',
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores],
      storeList: [
        { id: 's1', name: 'Tienda Uno', isActive: true },
        { id: 's2', name: 'Tienda Dos', isActive: true },
      ],
    };
  });

  afterEach(() => {
    authStoreState.user = { selectedStoreId: 's1' };
  });

  it('MS-1: muestra el select global de tiendas y un panel colapsable por tienda, con totales por tienda y global fuera de los paneles', async () => {
    storeExpensesFixture.s1 = [
      makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 }),
      makeExpense({ id: 'b', date: new Date('2024-03-15T11:00:00.000'), total: 5 }),
    ];
    storeExpensesFixture.s2 = [
      makeExpense({ id: 'c', date: new Date('2024-03-16T09:00:00.000'), total: 7 }),
    ];

    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });

    // El header global solo dice «Gastos» (sin «Historial de»).
    expect(screen.getByText('Gastos')).toBeInTheDocument();
    expect(screen.queryByText(/Historial de Gastos/i)).not.toBeInTheDocument();

    // Select global con «Todas las tiendas» + una opción por tienda.
    expect(screen.getByTestId('multistore-select')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Todas las tiendas' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tienda Uno' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tienda Dos' })).toBeInTheDocument();

    // Un panel por tienda, colapsado por defecto, con su total al lado del nombre
    // (el nombre aparece en el <option> y en el header del panel).
    expect(screen.getByTestId('multistore-panel-toggle-s1')).toBeInTheDocument();
    expect(screen.getByTestId('multistore-panel-toggle-s2')).toBeInTheDocument();
    expect(screen.getAllByText('Tienda Uno').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tienda Dos').length).toBeGreaterThan(0);
    expect(screen.getByText('15 CUP')).toBeInTheDocument(); // total tienda s1
    expect(screen.getByText('7 CUP')).toBeInTheDocument(); // total tienda s2

    // Global fuera de los paneles: 3 gastos, 22\u00A0CUP.
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('22 CUP')).toBeInTheDocument();

    // El filtro de método de pago es GLOBAL (fuera de los paneles).
    expect(
      screen.getAllByRole('radio', { name: /Efectivo/ }).length,
    ).toBeGreaterThanOrEqual(1);
    // Nada expandido aún: no hay filas de gastos en el DOM.
    expect(screen.queryByTestId('expense-row-a')).not.toBeInTheDocument();
  });

  it('MS-5: el rango de fechas comparte fila con el select de tiendas (a la derecha) y filtra dentro de los paneles', async () => {
    storeExpensesFixture.s1 = [
      makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 }),
      makeExpense({ id: 'b', date: new Date('2024-03-16T11:00:00.000'), total: 5 }),
    ];
    storeExpensesFixture.s2 = [
      makeExpense({ id: 'c', date: new Date('2024-03-16T09:00:00.000'), total: 7 }),
    ];

    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });

    // Misma fila: el rango es hijo DIRECTO del mismo contenedor flex que el
    // select de tiendas (sin wrapper w-full que lo baje a otra línea) y se
    // estira hacia la derecha (flex-1 — patrón de credits.tsx).
    const rangeInput = screen.getByTestId('date-range-filter-input');
    const rangeRoot = rangeInput.parentElement;
    const row = screen.getByTestId('multistore-select').parentElement;
    expect(row).not.toBeNull();
    expect(rangeRoot).not.toBeNull();
    expect(rangeRoot!.parentElement).toBe(row);
    expect(rangeRoot).toHaveClass('flex-1');
    expect(row!.contains(rangeInput)).toBe(true);

    // Sin rango: (3) gastos, 22\u00A0CUP global.
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('22 CUP')).toBeInTheDocument();

    // Aplico 15/03 → 15/03 (día final INCLUYENTE): solo el gasto del 15/03.
    fireEvent.click(rangeInput);
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2024-03-15' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2024-03-15' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    fireEvent.click(screen.getByTestId('date-range-filter-button'));

    // Header global (1) + panel de Tienda Uno (1); 10\u00A0CUP en global y panel de s1.
    expect(screen.getAllByText('(1)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('10 CUP').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('(3)')).not.toBeInTheDocument();
    expect(screen.queryByText('22 CUP')).not.toBeInTheDocument();
  });

  it('MS-2: expandir un panel muestra los gastos agrupados por día de ESA tienda', async () => {
    storeExpensesFixture.s1 = [
      makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 }),
    ];
    storeExpensesFixture.s2 = [
      makeExpense({ id: 'c', date: new Date('2024-03-16T09:00:00.000'), total: 7 }),
    ];

    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });

    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s1'));
    // El acordeón por día vive DENTRO del panel de la tienda, también colapsado.
    fireEvent.click(screen.getByTestId('multistore-expense-day-panel-toggle-s1-2024-03-15'));
    expect(screen.getByTestId('expense-row-a')).toBeInTheDocument();
    // El gasto de la otra tienda no aparece dentro del panel de s1.
    expect(screen.queryByTestId('expense-row-c')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s2'));
    fireEvent.click(screen.getByTestId('multistore-expense-day-panel-toggle-s2-2024-03-16'));
    expect(screen.getByTestId('expense-row-c')).toBeInTheDocument();
  });

  it('MS-3: el filtro global de método de pago filtra dentro de los paneles y actualiza totales', async () => {
    storeExpensesFixture.s1 = [
      makeExpense({ id: 'a', total: 10, paymentType: PaymentType.Efectivo }),
      makeExpense({ id: 'b', total: 5, paymentType: PaymentType.Tarjeta }),
    ];
    storeExpensesFixture.s2 = [
      makeExpense({ id: 'c', total: 7, paymentType: PaymentType.Efectivo }),
    ];

    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });

    // Solo hay UN radio group global (el filtro vive fuera de los paneles).
    const efectivoRadios = screen.getAllByRole('radio', { name: /Efectivo/ });
    expect(efectivoRadios).toHaveLength(1);
    fireEvent.click(efectivoRadios[0]);

    // Global: quedan 2 de 3 (17\u00A0CUP) — el header y el total por tienda de s2.
    await waitFor(() => {
      expect(screen.getByText('(2)')).toBeInTheDocument();
      expect(screen.getByText('17 CUP')).toBeInTheDocument();
    });

    // Expandir s1 (tienda + día): solo el gasto en efectivo; s2 no cambió (7\u00A0CUP).
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s1'));
    fireEvent.click(screen.getByTestId('multistore-expense-day-panel-toggle-s1-2024-03-15'));
    expect(screen.getByTestId('expense-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('expense-row-b')).not.toBeInTheDocument();
    expect(screen.getByText('7 CUP')).toBeInTheDocument();
  });

  it('MS-4: una tienda sin datos en el dispositivo muestra el estado vacío del panel', async () => {
    storeExpensesFixture.s1 = [
      makeExpense({ id: 'a', date: new Date('2024-03-15T09:00:00.000'), total: 10 }),
    ];

    await act(async () => {
      render(
        <Wrapper>
          <ExpensesHistoryPage />
        </Wrapper>,
      );
    });

    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s2'));
    expect(
      screen.getByText('Sin datos de esta tienda en este dispositivo'),
    ).toBeInTheDocument();
  });
});
