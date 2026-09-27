import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, OrderType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { CuadrePorFechasPage } from '../cuadre-por-fechas';

/**
 * currency-filter-per-view / T13 (payment-channels-and-multipayment):
 * los buckets "Resumen Efectivo" y "Pago por Transferencia" de la vista
 * single-store deben ser MUTUAMENTE EXCLUYENTES y resolver el canal real con
 * `normalizedOrderPaymentMethod`.
 *
 * Regresión cubierta: un traspaso en USD se persiste con el espejo legacy
 * `paymentType = Efectivo` (sale-payment-method-compat.ts). Si Efectivo se
 * selecciona por el campo legacy, la orden entra TAMBIÉN al bucket de efectivo
 * y se cuenta dos veces (efectivo + transferencia). El path multi-store ya lo
 * resolvió; este test fija el single-store para que no diverja.
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
  salesTotal: 0,
  grossProfit: 0,
  categories: [] as unknown[],
  expenses: [] as Expense[],
  unpaidCredits: [] as SaleCredit[],
  paidCredits: [] as SaleCredit[],
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersPriceBetweenDates: vi.fn(() => fixtures.salesTotal),
    getActiveOrdersProfitBetweenDates: vi.fn(() => fixtures.grossProfit),
    getActiveOrdersBetween: vi.fn(() => fixtures.ordersBetween),
    getCategoryCartItemsViewBetweenDates: vi.fn(() => ({
      data: fixtures.categories,
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
    getUnPaidSaleCreditsBetween: vi.fn(() => fixtures.unpaidCredits),
    getPaidSaleCreditsBetween: vi.fn(() => fixtures.paidCredits),
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
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  } as Order;
}

/** Traspaso USD: canal real Transferencia, espejo legacy Efectivo (el bug). */
function usdTransfer(): Order {
  return makeOrder({
    id: 'usd-transfer',
    total: 300,
    currency: Currency.USD,
    salePaymentMethod: SalePaymentMethod.Transferencia,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
  });
}

/** Traspaso CUP: canal real Transferencia, espejo legacy Tarjeta. */
function cupTransfer(): Order {
  return makeOrder({
    id: 'cup-transfer',
    total: 50,
    currency: Currency.CUP,
    salePaymentMethod: SalePaymentMethod.Transferencia,
    paymentType: PaymentType.Tarjeta,
    isCredit: false,
  });
}

/** Venta en efectivo plano: canal real Efectivo. */
function cupCash(): Order {
  return makeOrder({
    id: 'cup-cash',
    total: 100,
    currency: Currency.CUP,
    salePaymentMethod: SalePaymentMethod.Efectivo,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
  });
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

function transferPanel(): HTMLElement {
  return screen.getByRole('button', { name: /Pago por Transferencia/ });
}

/**
 * Importe EXACTO del header del panel (primer span con `whitespace-nowrap`).
 * Evita coincidencias por substring: `toHaveTextContent('0 USD')` también
 * casaría dentro de `300 USD`.
 */
function panelAmount(panel: HTMLElement): string {
  // El formateador usa NBSP (U+00A0) entre número y moneda; se normaliza a
  // espacio plano para poder comparar con un literal estable.
  return (panel.querySelector('span.whitespace-nowrap')?.textContent ?? '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

describe('CuadrePorFechasPage — buckets Efectivo/Transferencia (single-store)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    multiStore.enabled = false;
    multiStore.stores = [];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.ordersBetween = [];
    fixtures.salesTotal = 0;
    fixtures.grossProfit = 0;
    fixtures.categories = [];
    fixtures.expenses = [];
    fixtures.unpaidCredits = [];
    fixtures.paidCredits = [];
  });

  // Módulo OFF: salida legacy, pero los buckets siguen siendo excluyentes.
  it('un traspaso USD NO entra en Efectivo y sí cuenta una sola vez como Transferencia', async () => {
    fixtures.ordersBetween = [usdTransfer(), cupTransfer(), cupCash()];
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-card-title')).toBeTruthy());

    // Efectivo = solo la venta en efectivo (100). El traspaso USD (300) NO se
    // duplica en efectivo; antes del fix este bucket mostraba 400.
    expect(panelAmount(cashPanel())).toBe('100 CUP');
    // Transferencia = 300 (USD) + 50 (CUP), cada orden exactamente una vez.
    expect(panelAmount(transferPanel())).toBe('350 CUP');
  });

  // Módulo ON con 2 monedas: el filtro arranca en USD (orden acordado USD → CUP).
  it('con MultiMonedas ON, el traspaso USD vive SOLO en Transferencia y el total no se duplica', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.ordersBetween = [usdTransfer(), cupTransfer(), cupCash()];
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-card-title')).toBeTruthy());

    // Filtro visible, moneda por defecto USD.
    expect(screen.getByTestId('currency-filter')).toBeTruthy();

    // USD: efectivo vacío, transferencia con los 300 una sola vez.
    expect(panelAmount(cashPanel())).toBe('0 USD');
    expect(panelAmount(transferPanel())).toBe('300 USD');

    // La suma de buckets coincide con las órdenes USD (300), no con 600.
    expect(screen.queryByText('600 USD')).toBeNull();
    expect(screen.getAllByText('300 USD').length).toBeGreaterThan(0);
  });

  it('con MultiMonedas ON, en CUP el efectivo plano queda en Efectivo y el traspaso CUP en Transferencia', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.ordersBetween = [usdTransfer(), cupTransfer(), cupCash()];
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-card-title')).toBeTruthy());

    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.CUP) },
    });

    expect(panelAmount(cashPanel())).toBe('100 CUP');
    expect(panelAmount(transferPanel())).toBe('50 CUP');
  });
});
