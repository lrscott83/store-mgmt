import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules } from '@store-mgmt/domain';
import type { InventoryEntryView } from '@store-mgmt/domain';
import { CurrencyTotalAmount } from '~/shared/components/multimonedas/currency-total-amount';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';

// ─── Global mocks ────────────────────────────────────────────────────────────

const auth = vi.hoisted(() => ({
  state: {
    user: { selectedStoreId: 's1', storeModuleIds: [] as number[], isOwnerAdmin: true },
    isAuthenticated: true,
  },
}));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof auth.state) => unknown) =>
    typeof selector === 'function' ? selector(auth.state) : auth.state,
  ),
}));

const available = vi.hoisted(() => ({ categories: [] as InventoryCategoryView[] }));
const entries = vi.hoisted(() => ({ items: [] as InventoryEntryView[] }));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getInventoryCategoriesView: vi.fn().mockReturnValue({
      data: available.categories,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    }),
    filterInventoryEntries: vi.fn().mockResolvedValue({
      data: entries.items,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    }),
  })),
}));

vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({
    getStorageProductsMap: vi.fn(() => new Map()),
  })),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({})),
}));

// Sin MultiStores el modo multi-store queda apagado (single-store en todos los tests).
// Referencias ESTABLES: los efectos de las vistas dependen de `stores`; devolver un
// array nuevo en cada render dispararía el efecto en bucle.
const multiStoreState = vi.hoisted(() => ({
  enabled: false,
  stores: [] as { id: string; name: string }[],
}));
vi.mock('~/shared/lib/hooks/use-multi-store', () => ({
  useMultiStore: () => multiStoreState,
}));

import { InventoryAvailablePage } from '../available';
import { EntriesPage } from '../entries';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const header = () => document.querySelector('[data-slot="card-header"]') as HTMLElement;

function makeCategory(
  id: string,
  totalCostPrice: number,
  quantity: number,
  currency: Currency,
): InventoryCategoryView {
  return {
    categoryId: id,
    categoryName: `${id} Cat`,
    totalQuantity: quantity,
    totalCostPrice,
    totalCostPriceEntries: [{ amount: totalCostPrice, currency }],
    products: [
      {
        productId: `${id}-p`,
        productName: `${id} Prod`,
        categoryId: id,
        categoryName: `${id} Cat`,
        totalAvailable: quantity,
        avgCostPrice: totalCostPrice / quantity,
        currency,
      },
    ],
  };
}

function renderAvailable() {
  return render(
    <Wrapper>
      <InventoryAvailablePage />
    </Wrapper>,
  );
}

function renderEntries() {
  return render(
    <Wrapper>
      <EntriesPage />
    </Wrapper>,
  );
}

describe('InventoryAvailablePage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [], isOwnerAdmin: true };
    available.categories = [];
  });

  it('gate OFF: salida idéntica a la de hoy (total mezclado 75\u00A0CUP) y sin filtro', async () => {
    available.categories = [
      makeCategory('usd', 30, 10, Currency.USD),
      makeCategory('eur', 45, 9, Currency.EUR),
    ];
    renderAvailable();
    expect(await screen.findByText('usd Cat (10)')).toBeInTheDocument();
    expect(within(header()).getByText('75 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    expect(screen.getByText('eur Cat (9)')).toBeInTheDocument();
  });

  it('gate ON + 2 monedas: header y filas quedan en la moneda por defecto (USD)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    available.categories = [
      makeCategory('usd', 30, 10, Currency.USD),
      makeCategory('eur', 45, 9, Currency.EUR),
    ];
    renderAvailable();
    expect(await screen.findByTestId('currency-filter-select')).toBeInTheDocument();
    expect(within(header()).getByText('30 USD')).toBeInTheDocument();
    expect(screen.getByText('usd Cat (10)')).toBeInTheDocument();
    expect(screen.queryByText('eur Cat (9)')).toBeNull();
    expect(screen.queryByText('75 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia filas y header, y el filtro sigue visible', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    available.categories = [
      makeCategory('usd', 30, 10, Currency.USD),
      makeCategory('eur', 45, 9, Currency.EUR),
    ];
    renderAvailable();
    await screen.findByTestId('currency-filter-select');
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(within(header()).getByText('45 EUR')).toBeInTheDocument();
    expect(screen.getByText('eur Cat (9)')).toBeInTheDocument();
    expect(screen.queryByText('usd Cat (10)')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });

  it('gate ON + 1 moneda: sin filtro y sin filtrar (todos los datos visibles)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    available.categories = [
      makeCategory('usd-1', 30, 10, Currency.USD),
      makeCategory('usd-2', 45, 9, Currency.USD),
    ];
    renderAvailable();
    expect(await screen.findByText('usd-1 Cat (10)')).toBeInTheDocument();
    expect(within(header()).getByText('75 USD')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });
});

describe('EntriesPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [], isOwnerAdmin: true };
    entries.items = [];
  });

  function makeEntry(id: string, total: number, currency: Currency): InventoryEntryView {
    return {
      id,
      productId: `${id}-p`,
      productName: `${id} Prod`,
      quantity: 1,
      costPrice: total,
      date: new Date('2024-03-15T10:00:00.000'),
      isActive: true,
      currency,
    };
  }

  it('gate OFF: salida idéntica a la de hoy (total mezclado 75\u00A0CUP) y sin filtro', async () => {
    entries.items = [makeEntry('usd', 30, Currency.USD), makeEntry('eur', 45, Currency.EUR)];
    renderEntries();
    expect(await screen.findAllByText('75 CUP')).not.toHaveLength(0);
    expect(within(header()).getByText('75 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: header y panel del día quedan en la moneda por defecto (USD)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    entries.items = [makeEntry('usd', 30, Currency.USD), makeEntry('eur', 45, Currency.EUR)];
    renderEntries();
    expect(await screen.findByTestId('currency-filter-select')).toBeInTheDocument();
    expect(within(header()).getByText('30 USD')).toBeInTheDocument();
    expect(screen.queryByText('75 CUP')).toBeNull();
    expect(screen.queryByText('45 EUR')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia el total y el filtro sigue visible', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    entries.items = [makeEntry('usd', 30, Currency.USD), makeEntry('eur', 45, Currency.EUR)];
    renderEntries();
    await screen.findByTestId('currency-filter-select');
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(within(header()).getByText('45 EUR')).toBeInTheDocument();
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });

  it('gate ON + 1 moneda: sin filtro y sin filtrar (todos los datos visibles)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    entries.items = [
      makeEntry('usd-1', 30, Currency.USD),
      makeEntry('usd-2', 45, Currency.USD),
    ];
    renderEntries();
    expect(await screen.findAllByText('75 USD')).not.toHaveLength(0);
    expect(within(header()).getByText('75 USD')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });
});

// Referencia "ANTES" para una tienda SIN MultiMonedas con datos solo CUP: el formato
// multi-moneda hardcodeado caía en una única fila CUP, que es exactamente lo que
// `formatMoneyWithCurrency(total, CUP)` produce. Fija la paridad declarada en el reporte.
describe('Referencia legacy — CurrencyTotalAmount multiMonedas con datos CUP-only', () => {
  it('una sola moneda (CUP) rinde el mismo texto que el helper normal', () => {
    render(
      <CurrencyTotalAmount
        legacyTotal={75}
        entries={[{ amount: 30 }, { amount: 45 }]}
        multiMonedas
      />,
    );
    expect(screen.getByText('75 CUP')).toBeInTheDocument();
  });
});
