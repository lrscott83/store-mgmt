import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ExpenseType, OrderType, PaymentType, EModules } from '@store-mgmt/domain';
import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';

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

const mockGetActiveOrdersPriceBetweenDates = vi.fn().mockReturnValue(0);
const mockGetActiveOrdersProfitBetweenDates = vi.fn().mockReturnValue(0);
const mockGetActiveOrdersBetween = vi.fn().mockReturnValue([] as Order[]);
const mockGetCategoryCartItemsViewBetweenDates = vi.fn().mockReturnValue({
  data: [],
  succeeded: true,
  message: '',
  actionCode: 200,
  errors: [],
});
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersPriceBetweenDates: mockGetActiveOrdersPriceBetweenDates,
    getActiveOrdersProfitBetweenDates: mockGetActiveOrdersProfitBetweenDates,
    getActiveOrdersBetween: mockGetActiveOrdersBetween,
    getCategoryCartItemsViewBetweenDates: mockGetCategoryCartItemsViewBetweenDates,
  })),
}));

const mockGetActiveExpensesBetween = vi.fn().mockReturnValue([] as Expense[]);
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getActiveExpensesBetween: mockGetActiveExpensesBetween,
  })),
}));

const mockGetUnPaidSaleCreditsBetween = vi.fn().mockReturnValue([] as SaleCredit[]);
const mockGetPaidSaleCreditsBetween = vi.fn().mockReturnValue([] as SaleCredit[]);
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getUnPaidSaleCreditsBetween: mockGetUnPaidSaleCreditsBetween,
    getPaidSaleCreditsBetween: mockGetPaidSaleCreditsBetween,
  })),
}));

vi.mock('~/sales/components/category-stats', () => ({
  CategoryStats: ({ category }: { category: { id: string; name: string } }) => (
    <div data-testid={`category-stats-${category.id}`}>{category.name}</div>
  ),
}));

import { CuadrePorFechasPage } from '../cuadre-por-fechas';

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <CuadrePorFechasPage />
    </IntlProvider>,
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

describe('CuadrePorFechasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user.storeModuleIds = [];
    mockGetActiveOrdersPriceBetweenDates.mockReturnValue(0);
    mockGetActiveOrdersProfitBetweenDates.mockReturnValue(0);
    mockGetActiveOrdersBetween.mockReturnValue([]);
    mockGetCategoryCartItemsViewBetweenDates.mockReturnValue({
      data: [],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    mockGetActiveExpensesBetween.mockReturnValue([]);
    mockGetUnPaidSaleCreditsBetween.mockReturnValue([]);
    mockGetPaidSaleCreditsBetween.mockReturnValue([]);
  });

  it('renders the header and the two date pickers, but no summary before generating', () => {
    renderPage();
    expect(screen.getByText('Cuadre por fechas')).toBeTruthy();
    expect(screen.getByTestId('cuadre-start-date')).toBeTruthy();
    expect(screen.getByTestId('cuadre-end-date')).toBeTruthy();
    expect(screen.queryByTestId('cuadre-card-title')).toBeNull();
  });

  it('shows EMPTY_DATES error when generating without both dates', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('cuadre-generate'));
    expect(screen.getByTestId('cuadre-range-error').textContent).toBe(
      'Selecciona las fechas de inicio y fin.',
    );
    expect(mockGetActiveOrdersPriceBetweenDates).not.toHaveBeenCalled();
  });

  it('shows INVALID_RANGE error when start > end', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '10-09-2026' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '05-09-2026' } });
    fireEvent.click(screen.getByTestId('cuadre-generate'));
    expect(screen.getByTestId('cuadre-range-error').textContent).toBe(
      'La fecha de inicio debe ser anterior o igual a la fecha de fin.',
    );
    expect(mockGetActiveOrdersPriceBetweenDates).not.toHaveBeenCalled();
  });

  it('generates the KPIs with gross/net profit semantics (option A: net = gross − expenses)', async () => {
    mockAuthState.user.storeModuleIds = [EModules.Expenses];
    mockGetActiveOrdersPriceBetweenDates.mockReturnValue(1000);
    mockGetActiveOrdersProfitBetweenDates.mockReturnValue(300);
    mockGetActiveExpensesBetween.mockReturnValue([makeExpense({ total: 80 })]);

    renderPage();
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01-09-2026' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '07-09-2026' } });
    fireEvent.click(screen.getByTestId('cuadre-generate'));

    await waitFor(() => {
      expect(screen.getByText('Ganancias Bruta')).toBeTruthy();
    });

    // KPI values: Ventas 1000, Gastos 80, Ganancias Bruta 300 (sales profit only),
    // Ganancias 220 (gross − expenses). getAllByText: the $80 expense also
    // renders inside the collapsed Gastos panel header. NBSP is normalized to a
    // plain space by getByText.
    expect(screen.getAllByText('$1 000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$80').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$300').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$220').length).toBeGreaterThan(0);
  });

  it('calls the range services with an inclusive [start, end+1day) window', async () => {
    renderPage();
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01-09-2026' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '03-09-2026' } });
    fireEvent.click(screen.getByTestId('cuadre-generate'));

    await waitFor(() => {
      expect(mockGetActiveOrdersPriceBetweenDates).toHaveBeenCalled();
    });
    const [start, end] = mockGetActiveOrdersPriceBetweenDates.mock.calls[0] as [Date, Date];
    // Local-day comparison (timezone-safe): the window spans from the first
    // day's midnight to the day AFTER the end day's midnight.
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8); // September (0-based)
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(3 * 24 * 60 * 60 * 1000); // Sep 1..3 → +3 days
  });

  it('renders the Cuadre card with the five panels after generating', async () => {
    mockAuthState.user.storeModuleIds = [EModules.Expenses, EModules.Credits];
    mockGetActiveOrdersBetween.mockReturnValue([
      makeOrder({ total: 100, paymentType: PaymentType.Efectivo, isCredit: false }),
      makeOrder({ total: 120, paymentType: PaymentType.Tarjeta, isCredit: false }),
      // Credit sales never count toward the payment summaries (cash or card).
      makeOrder({
        id: 'card-credit',
        total: 999,
        paymentType: PaymentType.Tarjeta,
        isCredit: true,
      }),
    ]);
    mockGetCategoryCartItemsViewBetweenDates.mockReturnValue({
      data: [
        {
          id: 'cat-1',
          name: 'Bebidas',
          order: 1,
          total: 100,
          itemsCount: 2,
          productItems: [],
        },
      ],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    mockGetActiveExpensesBetween.mockReturnValue([makeExpense({ total: 20 })]);
    mockGetUnPaidSaleCreditsBetween.mockReturnValue([makeCredit({ total: 50, isPaid: false })]);
    mockGetPaidSaleCreditsBetween.mockReturnValue([
      makeCredit({
        id: 'credit-2',
        total: 30,
        isPaid: true,
        paidDate: new Date(),
        paidType: PaymentType.Efectivo,
      }),
    ]);

    renderPage();
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01-09-2026' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '07-09-2026' } });
    fireEvent.click(screen.getByTestId('cuadre-generate'));

    await waitFor(() => {
      expect(screen.getByTestId('cuadre-card-title')).toBeTruthy();
    });

    // The five panels exist. NBSP amounts normalize to plain space for getByText.
    expect(screen.getByText('Resumen Efectivo')).toBeTruthy();
    // Pago por Tarjeta sits right after Resumen Efectivo (user request 2026-09-07)
    // and sums the range's card-paid non-credit sales (120).
    expect(screen.getByRole('button', { name: /Pago por Tarjeta/ })).toBeTruthy();
    expect(screen.getAllByText('$120').length).toBeGreaterThan(0);
    expect(screen.getByText('Gastos (1)')).toBeTruthy();
    expect(screen.getByText('Créditos Por Cobrar (1)')).toBeTruthy();
    // Angular parity: the paid-credits panel "(...)" slot shows the currency SUM
    // (raw number), not a count.
    expect(screen.getByText('Créditos Pagados (30)')).toBeTruthy();
    expect(screen.getByText('Ventas (2 productos)')).toBeTruthy();

    // The sales panel renders CategoryStats rows once expanded (collapsed by
    // default, matching today-stats' Angular mat-expansion-panel parity).
    fireEvent.click(screen.getByText('Ventas (2 productos)'));
    expect(screen.getByTestId('category-stats-cat-1')).toBeTruthy();
  });

  describe('date format dd-mm-yyyy + generate button (user request 2026-09-08)', () => {
    it('renders text inputs with dd-mm-yyyy placeholder instead of native date pickers', () => {
      renderPage();
      const start = screen.getByTestId('cuadre-start-date') as HTMLInputElement;
      const end = screen.getByTestId('cuadre-end-date') as HTMLInputElement;
      // Text inputs with a dd-mm-yyyy placeholder — not native type="date" pickers.
      expect(start.type).toBe('text');
      expect(end.type).toBe('text');
      expect(start.placeholder).toBe('dd-mm-yyyy');
      expect(end.placeholder).toBe('dd-mm-yyyy');
    });

    it('auto-formats typed digits into the dd-mm-yyyy mask while typing', () => {
      renderPage();
      const start = screen.getByTestId('cuadre-start-date') as HTMLInputElement;
      // Typing raw digits gets progressively masked: "09012026" → "09-01-2026".
      fireEvent.change(start, { target: { value: '0901' } });
      expect(start.value).toBe('09-01');
      fireEvent.change(start, { target: { value: '09012026' } });
      expect(start.value).toBe('09-01-2026');
    });

    it('accepts a complete dd-mm-yyyy date and generates the summary', async () => {
      mockGetActiveOrdersPriceBetweenDates.mockReturnValue(500);
      renderPage();
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01092026' } });
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '07092026' } });
      fireEvent.click(screen.getByTestId('cuadre-generate'));

      await waitFor(() => {
        expect(screen.getByText('Ganancias Bruta')).toBeTruthy();
      });
      // Window parsed from dd-mm-yyyy: Sep 1..7 2026 inclusive.
      const [start, end] = mockGetActiveOrdersPriceBetweenDates.mock.calls[0] as [Date, Date];
      expect(start.getDate()).toBe(1);
      expect(start.getMonth()).toBe(8);
      expect(start.getFullYear()).toBe(2026);
      expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('rejects an invalid dd-mm-yyyy date with a clear error', () => {
      renderPage();
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '32012026' } }); // día 32
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '07092026' } });
      fireEvent.click(screen.getByTestId('cuadre-generate'));
      expect(screen.getByTestId('cuadre-range-error').textContent).toBe('Formato de fecha inválido. Usa dd-mm-yyyy.');
      expect(mockGetActiveOrdersPriceBetweenDates).not.toHaveBeenCalled();
    });

    it('rejects an incomplete date with the same format error', () => {
      renderPage();
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01-09' } });
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '07-09-2026' } });
      fireEvent.click(screen.getByTestId('cuadre-generate'));
      expect(screen.getByTestId('cuadre-range-error').textContent).toBe('Formato de fecha inválido. Usa dd-mm-yyyy.');
      expect(mockGetActiveOrdersPriceBetweenDates).not.toHaveBeenCalled();
    });

    it('accepts fully dashed dd-mm-yyyy input (mask-friendly paste/edit)', async () => {
      renderPage();
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01-09-2026' } });
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '03-09-2026' } });
      fireEvent.click(screen.getByTestId('cuadre-generate'));

      await waitFor(() => {
        expect(mockGetActiveOrdersPriceBetweenDates).toHaveBeenCalled();
      });
      const [start] = mockGetActiveOrdersPriceBetweenDates.mock.calls[0] as [Date, Date];
      expect(start.getDate()).toBe(1);
      expect(start.getMonth()).toBe(8);
    });

    it('the generate button renders the magnifying-glass icon next to the date controls', () => {
      renderPage();
      expect(screen.getByTestId('cuadre-generate-icon')).toBeTruthy();
    });

    it('shows the Spanish weekday under each input once the date is complete (user request 2026-09-08)', () => {
      renderPage();
      // Not shown while the date is incomplete or invalid.
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01-09' } });
      expect(screen.queryByTestId('cuadre-start-weekday')).toBeNull();

      // 2026-09-01 is a Tuesday; 2026-09-07 is a Monday.
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01092026' } });
      expect(screen.getByTestId('cuadre-start-weekday').textContent).toBe('martes');
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '07092026' } });
      expect(screen.getByTestId('cuadre-end-weekday').textContent).toBe('lunes');

      // An invalid complete date hides the weekday again.
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '32012026' } });
      expect(screen.queryByTestId('cuadre-start-weekday')).toBeNull();
    });
  });

  it('hides the Gastos KPI and the expenses/credits panels when modules are unavailable', async () => {
    mockAuthState.user.storeModuleIds = [];

    renderPage();
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '01-09-2026' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '07-09-2026' } });
    fireEvent.click(screen.getByTestId('cuadre-generate'));

    await waitFor(() => {
      expect(screen.getByText('Ganancias Bruta')).toBeTruthy();
    });

    // No expenses module → no Gastos KPI, no Gastos panel.
    expect(screen.queryByText('Gastos')).toBeNull();
    expect(mockGetActiveExpensesBetween).not.toHaveBeenCalled();
    // No credits module → no credits panels.
    expect(screen.queryByText(/Créditos Por Cobrar/)).toBeNull();
    expect(mockGetUnPaidSaleCreditsBetween).not.toHaveBeenCalled();
  });
});
