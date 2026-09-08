import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // Native date pickers (tap opens the system picker) under a dd-mm-yyyy display.
    expect((screen.getByTestId('cuadre-start-date') as HTMLInputElement).type).toBe('date');
    expect((screen.getByTestId('cuadre-end-date') as HTMLInputElement).type).toBe('date');
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
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-05' } });
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
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-07' } });
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
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-03' } });
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
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-07' } });
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

  describe('native date picker over dd-mm-yyyy display + compact controls (2026-09-08 follow-up)', () => {
    it('renders native type="date" pickers with a dd-mm-yyyy display placeholder', () => {
      renderPage();
      const start = screen.getByTestId('cuadre-start-date') as HTMLInputElement;
      const end = screen.getByTestId('cuadre-end-date') as HTMLInputElement;
      // Tap opens the native picker again; the visible display keeps the mask.
      expect(start.type).toBe('date');
      expect(end.type).toBe('date');
      expect(screen.getAllByPlaceholderText('dd-mm-yyyy').length).toBe(2);
    });

    it('shows the picked date as dd-mm-yyyy and the Spanish weekday under each field', () => {
      renderPage();
      // 2026-09-01 is a Tuesday; 2026-09-07 is a Monday.
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-07' } });
      expect(screen.getByDisplayValue('01-09-2026')).toBeTruthy();
      expect(screen.getByDisplayValue('07-09-2026')).toBeTruthy();
      expect(screen.getByTestId('cuadre-start-weekday').textContent).toBe('martes');
      expect(screen.getByTestId('cuadre-end-weekday').textContent).toBe('lunes');
    });

    it('hides the display value and weekday while the picker is empty', () => {
      renderPage();
      expect(screen.queryByTestId('cuadre-start-weekday')).toBeNull();
      expect(screen.queryByTestId('cuadre-end-weekday')).toBeNull();

      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
      expect(screen.getByTestId('cuadre-start-weekday').textContent).toBe('martes');

      // Clearing the picker clears both the display and the weekday.
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '' } });
      expect(screen.queryByTestId('cuadre-start-weekday')).toBeNull();
    });

    it('generates the summary from dates chosen in the picker', async () => {
      mockGetActiveOrdersPriceBetweenDates.mockReturnValue(500);
      renderPage();
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-07' } });
      fireEvent.click(screen.getByTestId('cuadre-generate'));

      await waitFor(() => {
        expect(screen.getByText('Ganancias Bruta')).toBeTruthy();
      });
      // Window parsed from the picked dates: Sep 1..7 2026 inclusive.
      const [start, end] = mockGetActiveOrdersPriceBetweenDates.mock.calls[0] as [Date, Date];
      expect(start.getDate()).toBe(1);
      expect(start.getMonth()).toBe(8);
      expect(start.getFullYear()).toBe(2026);
      expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('the generate button is icon-only (lupa) with an accessible label — no visible "Generar" text', () => {
      renderPage();
      expect(screen.getByTestId('cuadre-generate-icon')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Generar' })).toBeTruthy();
      expect(screen.queryByText('Generar')).toBeNull();
    });
  });

  describe('visible textbox — type and dd-mm-yyyy format', () => {
    it('renders each visible field as a read-only text input (never a native picker)', () => {
      renderPage();
      const startDisplay = screen.getByTestId('cuadre-start-display') as HTMLInputElement;
      const endDisplay = screen.getByTestId('cuadre-end-display') as HTMLInputElement;
      expect(startDisplay.type).toBe('text');
      expect(endDisplay.type).toBe('text');
      // The textbox must not intercept taps: read-only, unfocusable, hidden
      // from assistive technology (the labelled element is the date input).
      expect(startDisplay.readOnly).toBe(true);
      expect(startDisplay.tabIndex).toBe(-1);
      expect(startDisplay.getAttribute('aria-hidden')).toBe('true');
      expect(endDisplay.readOnly).toBe(true);
      expect(endDisplay.tabIndex).toBe(-1);
      expect(endDisplay.getAttribute('aria-hidden')).toBe('true');
    });

    it('formats the picked date as dd-mm-yyyy (never the ISO value)', () => {
      renderPage();
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
      fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-12-25' } });
      const startDisplay = screen.getByTestId('cuadre-start-display') as HTMLInputElement;
      const endDisplay = screen.getByTestId('cuadre-end-display') as HTMLInputElement;
      expect(startDisplay.value).toBe('01-09-2026');
      expect(endDisplay.value).toBe('25-12-2026');
      for (const display of [startDisplay, endDisplay]) {
        // dd-mm-yyyy shape: 2-digit day, 2-digit month, 4-digit year, dashes.
        expect(display.value).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      }
      // The native ISO value must never leak into the visible textbox.
      expect(startDisplay.value).not.toContain('2026-09-01');
      expect(endDisplay.value).not.toContain('2026-12-25');
    });

    it('clears the textbox when the picker is cleared', () => {
      renderPage();
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
      expect((screen.getByTestId('cuadre-start-display') as HTMLInputElement).value).toBe(
        '01-09-2026',
      );
      fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '' } });
      expect((screen.getByTestId('cuadre-start-display') as HTMLInputElement).value).toBe('');
    });
  });

  describe('tap on the control opens the native date picker popup', () => {
    it('the clickable layer of each field is the native type="date" input covering the display', () => {
      renderPage();
      const start = screen.getByTestId('cuadre-start-date') as HTMLInputElement;
      const end = screen.getByTestId('cuadre-end-date') as HTMLInputElement;
      // Native date controls open the picker popup on tap; the overlay is
      // transparent but covers the whole field so taps land on it.
      expect(start.type).toBe('date');
      expect(end.type).toBe('date');
      for (const picker of [start, end]) {
        expect(picker.className).toContain('absolute');
        expect(picker.className).toContain('inset-0');
        expect(picker.className).toContain('h-full');
        expect(picker.className).toContain('w-full');
        expect(picker.className).toContain('opacity-0');
        expect(picker.className).toContain('cursor-pointer');
      }
    });

    it('a tap (click) on the date layer focuses the native picker — the popup trigger', async () => {
      const user = userEvent.setup();
      renderPage();
      const start = screen.getByTestId('cuadre-start-date') as HTMLInputElement;
      await user.click(start);
      // The interaction reaches the date input (jsdom cannot render the native
      // calendar; the browser opens the popup on that click). It must never
      // land on the read-only display.
      expect(document.activeElement).toBe(start);
      expect(document.activeElement).not.toBe(screen.getByTestId('cuadre-start-display'));
    });

    it('the picker overlay is layered over the display inside the same field wrapper', () => {
      renderPage();
      const picker = screen.getByTestId('cuadre-start-date');
      const display = screen.getByTestId('cuadre-start-display');
      // Both live in the field's relative wrapper — the overlay is layered
      // ON TOP of the display, not beside it.
      expect(picker.parentElement).toBe(display.parentElement);
      // CSS painting order: the absolutely positioned date input paints ABOVE
      // the static in-flow display regardless of DOM order, so a real tap hits
      // the picker (which opens the popup), never the read-only text.
      expect(picker.className).toContain('absolute');
      expect(display.classList.contains('absolute')).toBe(false);
      expect(display.classList.contains('relative')).toBe(false);
    });
  });

  it('hides the Gastos KPI and the expenses/credits panels when modules are unavailable', async () => {
    mockAuthState.user.storeModuleIds = [];

    renderPage();
    fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-07' } });
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
