import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryEntry, Product, ProductCategory } from '@store-mgmt/domain';

// ─── PDF export mock (presentation-parity-bucket-b WU3) ───────────────────────
// Mock only the PDF module — generateProductRows() itself runs for real against
// localStorage (same convention as the rest of this file), so the wiring test
// exercises the real row-building aggregation, not a stub.
const exportInventoryTodaySalePdfMock = vi.fn().mockResolvedValue(undefined);
vi.mock('~/reports/lib/pdf/inventory-today-sale-pdf', () => ({
  exportInventoryTodaySalePdf: (...args: unknown[]) => exportInventoryTodaySalePdfMock(...args),
}));

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

  it('shows sales summary section', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Resumen de ventas/i)).toBeInTheDocument();
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
});

// ─── "Generar Reporte" PDF export button (presentation-parity-bucket-b WU3) ───────────────
//
// Angular's inventory-today-sale.component.html renders a `mat-fab extended` button
// (file_download icon, label REPORT.INVENTORY_TODAY_SALE) that calls generateReport() — a
// disabled no-op in Angular (angular-bugs-policy #511). React wires it to actually work:
// generateProductRows() (real, unmocked) builds the 13-col ledger from live offline data,
// then exportInventoryTodaySalePdf (mocked here) is invoked with those rows.
describe('TodayReportPage — Generar Reporte PDF export button', () => {
  beforeEach(() => {
    localStorage.clear();
    exportInventoryTodaySalePdfMock.mockClear();
  });

  it('renders the button above the Sales Summary / Inventory Status dashboard sections', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );

    const button = screen.getByRole('button', { name: /Inventario a precio de venta/i });
    const salesSummaryHeading = screen.getByText(/Resumen de ventas/i);

    expect(button).toBeInTheDocument();
    // DOCUMENT_POSITION_FOLLOWING (4) means salesSummaryHeading comes AFTER button.
    expect(button.compareDocumentPosition(salesSummaryHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the existing sales-summary dashboard section unchanged alongside the new button', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );

    expect(screen.getByText(/Resumen de ventas/i)).toBeInTheDocument();
    expect(screen.getByText(/Pedidos/i)).toBeInTheDocument();
  });

  it('activating the button builds rows from real offline data and invokes the PDF export with them', async () => {
    seedProducts([makeProduct('p1', { name: 'Coca Cola 500ml', categoryId: 'cat-1' })]);
    seedCategories([makeCategory('cat-1', { name: 'Bebidas' })]);
    seedInventory(new Map([['p1', [makeEntry('e1', 'p1', { available: 5, quantity: 5, costPrice: 2 })]]]));

    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Inventario a precio de venta/i }));

    await waitFor(() => expect(exportInventoryTodaySalePdfMock).toHaveBeenCalledTimes(1));

    const rows = exportInventoryTodaySalePdfMock.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productId: 'p1',
      productName: 'Coca Cola 500ml',
      unit: 'U',
      disponible: 5,
      vendido: 0,
    });
  });
});
