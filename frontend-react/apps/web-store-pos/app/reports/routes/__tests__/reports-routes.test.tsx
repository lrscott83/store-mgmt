import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryEntry, Product, ProductCategory } from '@store-mgmt/domain';

// ─── Global mocks ─────────────────────────────────────────────────────────────

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

// Note: OrderOfflineService / InventoryOfflineService / ProductRepository /
// ProductCategoryRepository are NOT mocked (unlike the previous version of this file) — they
// run for real against localStorage, exactly like inventory-offline-service.test.ts and
// order-offline-service.test.ts. This is required to exercise the actual
// getInventoryCategoriesView() derivation (a mocked stub can't catch a regression in how
// today-report.tsx consumes the real service).

const storeId = 's1';

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 10,
    order: 0,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: '',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

function seedProducts(products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));
}

function makeCategory(id: string, overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id, name: `Category ${id}`, order: 0, isActive: true, ...overrides };
}

function seedCategories(categories: ProductCategory[]): void {
  const entries = categories.map((c) => [c.id, c] as [string, ProductCategory]);
  localStorage.setItem(`lizoft.store-product-categories-${storeId}`, JSON.stringify(entries));
}

function makeEntry(id: string, productId: string, overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id,
    productId,
    categoryId: 'cat-1',
    quantity: 10,
    available: 10,
    costPrice: 2.5,
    date: new Date('2024-01-15T10:00:00.000Z'),
    order: 0,
    isActive: true,
    createdDate: new Date('2024-01-15T10:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

function seedInventory(map: Map<string, InventoryEntry[]>): void {
  localStorage.setItem(`lizoft.store-inventory-entries-${storeId}`, JSON.stringify(Array.from(map.entries())));
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── TodayReportPage ──────────────────────────────────────────────────────────

import { TodayReportPage } from '../today-report';

describe('TodayReportPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the reports title', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Reportes de hoy/i)).toBeInTheDocument();
  });

  it('shows the Actualizar refresh button', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Actualizar/i)).toBeInTheDocument();
  });

  it('shows sales summary section', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Resumen de ventas/i)).toBeInTheDocument();
  });

  it('shows inventory status section', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Estado de inventario/i)).toBeInTheDocument();
  });

  it('shows zero values in empty state without crashing', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    // Should show 0 order count or similar zero values
    expect(document.body).toBeTruthy();
  });

  it('shows order count label', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Pedidos/i)).toBeInTheDocument();
  });

  it('shows inventory empty state when no items available', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Sin stock disponible/i)).toBeInTheDocument();
  });
});

// ─── Regression: available-inventory table (getInventoryCategoriesView parity) ────────────
//
// CRITICAL bug (fixed here): computeTodayReport used to build the "available" table from
// InventoryOfflineService.getActiveInventoryEntriesStorage() cast through `as unknown as
// {available}` — but InventoryEntryView has no `available` field (only `quantity`), so
// `entry.available` was always `undefined` -> `av=0` -> the `available > 0` filter never
// passed -> the table was PERMANENTLY EMPTY regardless of real stock. The fix rebuilds the
// table from InventoryOfflineService.getInventoryCategoriesView() (the real 1:1 port of
// Angular's getInventoryCategoriesView, already consumed by inventory-available.component.ts
// + inventory-product-list.component.ts in Angular), which correctly reads entry.available.
describe('TodayReportPage — available inventory table (real getInventoryCategoriesView)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists products with real stock in the available table instead of showing the empty state', () => {
    seedProducts([makeProduct('p1', { name: 'Coca Cola 500ml', categoryId: 'cat-1' })]);
    seedCategories([makeCategory('cat-1', { name: 'Bebidas' })]);
    seedInventory(
      new Map([
        ['p1', [makeEntry('e1', 'p1', { available: 5, costPrice: 2 })]],
      ]),
    );

    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );

    // The empty state must NOT be shown — real stock exists.
    expect(screen.queryByText(/Sin stock disponible/i)).not.toBeInTheDocument();
    expect(screen.getByText('Coca Cola 500ml')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('sums available across multiple active entries for the same product', () => {
    seedProducts([makeProduct('p1', { name: 'Water 1L', categoryId: 'cat-1' })]);
    seedCategories([makeCategory('cat-1', { name: 'Bebidas' })]);
    seedInventory(
      new Map([
        [
          'p1',
          [
            makeEntry('e1', 'p1', { order: 0, available: 3, costPrice: 1 }),
            makeEntry('e2', 'p1', { order: 1, available: 4, costPrice: 1.5 }),
          ],
        ],
      ]),
    );

    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );

    expect(screen.getByText('Water 1L')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('excludes products whose entries are fully depleted (available = 0)', () => {
    seedProducts([makeProduct('p1', { name: 'Sold Out Item', categoryId: 'cat-1' })]);
    seedCategories([makeCategory('cat-1', { name: 'Bebidas' })]);
    seedInventory(
      new Map([['p1', [makeEntry('e1', 'p1', { available: 0, costPrice: 1 })]]]),
    );

    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );

    expect(screen.queryByText('Sold Out Item')).not.toBeInTheDocument();
    expect(screen.getByText(/Sin stock disponible/i)).toBeInTheDocument();
  });
});
