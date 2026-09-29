import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, EModules, ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { Expense } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { readStoreExpenses } from '~/shared/lib/multistore/multi-store-aggregator';
import { ExpensesHistoryPage } from '../expenses-history';

// Mutable auth state — single-store, MultiMonedas OFF by default; each test flips
// storeModuleIds to turn the REAL gates (`hasMultiMonedasAvailable`, `useMultiStore`) on.
const { authStoreState } = vi.hoisted(() => ({
  authStoreState: {
    user: { selectedStoreId: 's1' } as {
      selectedStoreId: string;
      isOwnerAdmin?: boolean;
      storeModuleIds?: number[];
      storeList?: Array<{ id: string; name: string; isActive?: boolean }>;
    },
    isAuthenticated: true,
  },
}));
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn(
    (selector?: (s: typeof authStoreState) => unknown) =>
      typeof selector === 'function' ? selector(authStoreState) : authStoreState,
  );
  return { useAuthStore };
});

// Multi-store gate — OFF by default (matches the real hook for a non-owner), ON per test.
const multiStore = vi.hoisted(() => ({
  enabled: false,
  stores: [] as { id: string; name: string }[],
}));
vi.mock('~/shared/lib/hooks/use-multi-store', () => ({
  useMultiStore: () => ({ enabled: multiStore.enabled, stores: multiStore.stores }),
}));

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

const { singleStoreExpenses } = vi.hoisted(() => ({ singleStoreExpenses: [] as Expense[] }));
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    filterExpensesObservable: vi.fn(() =>
      Promise.resolve({
        data: singleStoreExpenses,
        succeeded: true,
        message: '',
        actionCode: 200,
        errors: [],
      }),
    ),
  })),
}));

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    type: ExpenseType.Comida,
    total: 20,
    date: new Date(2024, 2, 15, 10, 0, 0),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date(2024, 2, 15, 10, 0, 0),
    createdByName: '',
    ...overrides,
  } as Expense;
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <ExpensesHistoryPage />
    </IntlProvider>,
  );
}

describe('ExpensesHistoryPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    authStoreState.user = { selectedStoreId: 's1' };
    multiStore.enabled = false;
    multiStore.stores = [];
    singleStoreExpenses.length = 0;
  });

  it('gate OFF: mantiene el total mezclado legacy como CUP y sin filtro', async () => {
    singleStoreExpenses.push(
      makeExpense({ id: 'usd', total: 30, currency: Currency.USD }),
      makeExpense({ id: 'eur', total: 5, currency: Currency.EUR }),
    );
    await act(async () => {
      renderPage();
    });
    expect((await screen.findAllByText('35 CUP')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: muestra el filtro y solo la moneda por defecto (USD), sin mezclar', async () => {
    authStoreState.user = { selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] };
    singleStoreExpenses.push(
      makeExpense({ id: 'usd', total: 30, currency: Currency.USD }),
      makeExpense({ id: 'eur', total: 5, currency: Currency.EUR }),
    );
    await act(async () => {
      renderPage();
    });
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
    // Default = primera del orden acordado (USD): solo su dato y su total.
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia los datos y el filtro sigue visible', async () => {
    authStoreState.user = { selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] };
    singleStoreExpenses.push(
      makeExpense({ id: 'usd', total: 30, currency: Currency.USD }),
      makeExpense({ id: 'eur', total: 5, currency: Currency.EUR }),
    );
    await act(async () => {
      renderPage();
    });
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });

  it('gate ON + 1 moneda: sin filtro y el total muestra ESA moneda (fix del bug)', async () => {
    authStoreState.user = { selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] };
    singleStoreExpenses.push(
      makeExpense({ id: 'usd-1', total: 30, currency: Currency.USD }),
      makeExpense({ id: 'usd-2', total: 5, currency: Currency.USD }),
    );
    await act(async () => {
      renderPage();
    });
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    expect(screen.getAllByText('35 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('35 CUP')).toBeNull();
  });
});

describe('ExpensesHistoryPage — filtro de moneda en modo multi-store', () => {
  beforeEach(() => {
    authStoreState.user = {
      selectedStoreId: 's1',
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores],
      storeList: [
        { id: 's1', name: 'Tienda A', isActive: true },
        { id: 's2', name: 'Tienda B', isActive: true },
      ],
    };
    multiStore.enabled = true;
    multiStore.stores = [
      { id: 's1', name: 'Tienda A' },
      { id: 's2', name: 'Tienda B' },
    ];
    for (const key of Object.keys(storeExpensesFixture)) delete storeExpensesFixture[key];
    vi.mocked(readStoreExpenses).mockImplementation((storeId) => storeExpensesFixture[storeId] ?? []);
  });

  function seedTwoStores() {
    storeExpensesFixture.s1 = [makeExpense({ id: 'usd', total: 30, currency: Currency.USD })];
    storeExpensesFixture.s2 = [makeExpense({ id: 'eur', total: 5, currency: Currency.EUR })];
  }

  it('gate OFF: mantiene el agregado legacy entre tiendas (35 CUP) y sin filtro', async () => {
    seedTwoStores();
    await act(async () => {
      renderPage();
    });
    expect(await screen.findByText('35 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: el agregado y los paneles quedan en la moneda por defecto (USD)', async () => {
    authStoreState.user = {
      selectedStoreId: 's1',
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores, EModules.MultiMonedas],
      storeList: [
        { id: 's1', name: 'Tienda A', isActive: true },
        { id: 's2', name: 'Tienda B', isActive: true },
      ],
    };
    seedTwoStores();
    await act(async () => {
      renderPage();
    });
    await screen.findByTestId('currency-filter-select');
    // Solo se ve USD: la tienda con EUR queda vacía, nunca la suma 35 CUP.
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia el agregado y los paneles', async () => {
    authStoreState.user = {
      selectedStoreId: 's1',
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores, EModules.MultiMonedas],
      storeList: [
        { id: 's1', name: 'Tienda A', isActive: true },
        { id: 's2', name: 'Tienda B', isActive: true },
      ],
    };
    seedTwoStores();
    await act(async () => {
      renderPage();
    });
    await screen.findByTestId('currency-filter-select');
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });
});

// ─── Filtro de canales de pago acotado a la moneda (2026-09-29) ───────────────
// Con MultiMonedas la etiqueta pierde el sufijo de moneda ("Transferencia" y no
// "Transferencia (CUP)") y la lista de canales se recalcula con la moneda
// seleccionada, para que nunca haya dos canales indistinguibles a la vez. Sin el
// módulo se conserva el comportamiento previo, sufijo incluido.

/** El fieldset de canales es el radiogroup que contiene el radio "Todas". */
function channelFilter() {
  return within(screen.getByText('Todas').closest('[role="radiogroup"]') as HTMLElement);
}

describe('ExpensesHistoryPage — filtro de canales por moneda (MultiMonedas)', () => {
  beforeEach(() => {
    authStoreState.user = { selectedStoreId: 's1' };
    multiStore.enabled = false;
    multiStore.stores = [];
    singleStoreExpenses.length = 0;
  });

  it('gate ON: sin sufijo de moneda, y la lista se recalcula al cambiar de moneda', async () => {
    authStoreState.user = { selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] };
    singleStoreExpenses.push(
      makeExpense({
        id: 'usd-xfer',
        total: 30,
        currency: Currency.USD,
        paymentType: PaymentType.Tarjeta,
      }),
      makeExpense({
        id: 'eur-zelle',
        total: 5,
        currency: Currency.EUR,
        paymentType: PaymentType.Zelle,
      }),
    );
    await act(async () => {
      renderPage();
    });

    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.USD) },
    });
    // USD solo tiene una transferencia → "Transferencia", sin el sufijo "(USD)".
    expect(channelFilter().getByRole('radio', { name: 'Transferencia' })).toBeInTheDocument();
    expect(
      channelFilter().queryByRole('radio', { name: 'Transferencia (USD)' }),
    ).not.toBeInTheDocument();
    // Zelle es de EUR: no se ofrece mientras la moneda sea USD.
    expect(channelFilter().queryByRole('radio', { name: 'Zelle' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    // EUR solo tiene Zelle → la transferencia sale del filtro.
    expect(channelFilter().getByRole('radio', { name: 'Zelle' })).toBeInTheDocument();
    expect(channelFilter().queryByRole('radio', { name: 'Transferencia' })).not.toBeInTheDocument();
  });

  it('gate ON: el canal elegido vuelve a "Todas" si no existe en la moneda nueva', async () => {
    authStoreState.user = { selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] };
    singleStoreExpenses.push(
      makeExpense({
        id: 'usd-xfer',
        total: 30,
        currency: Currency.USD,
        paymentType: PaymentType.Tarjeta,
      }),
      makeExpense({
        id: 'eur-efectivo',
        total: 5,
        currency: Currency.EUR,
        paymentType: PaymentType.Efectivo,
      }),
    );
    await act(async () => {
      renderPage();
    });
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.USD) },
    });
    fireEvent.click(channelFilter().getByRole('radio', { name: 'Transferencia' }));
    expect(channelFilter().getByRole('radio', { name: 'Transferencia' })).toBeChecked();

    // EUR no tiene transferencias: la selección deja de existir y se autorrepara.
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(channelFilter().getByRole('radio', { name: 'Todas' })).toBeChecked();
  });

  it('gate OFF: conserva el sufijo de moneda en las etiquetas del filtro', async () => {
    singleStoreExpenses.push(
      makeExpense({
        id: 'usd-xfer',
        total: 30,
        currency: Currency.USD,
        paymentType: PaymentType.Tarjeta,
      }),
    );
    await act(async () => {
      renderPage();
    });
    expect(channelFilter().getByRole('radio', { name: 'Transferencia (USD)' })).toBeInTheDocument();
    expect(channelFilter().queryByRole('radio', { name: 'Transferencia' })).not.toBeInTheDocument();
  });
});
