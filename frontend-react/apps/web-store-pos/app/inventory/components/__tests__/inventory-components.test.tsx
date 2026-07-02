import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── InventoryProductList ───────────────────────────────────────────────────

import { InventoryProductList, filterInventoryCategories } from '../inventory-product-list';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';

const MOCK_CATEGORIES: InventoryCategoryView[] = [
  {
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    totalQuantity: 15,
    totalCostPrice: 35,
    products: [
      {
        productId: 'p1',
        productName: 'Coca Cola',
        categoryId: 'cat1',
        categoryName: 'Bebidas',
        totalAvailable: 10,
        avgCostPrice: 2,
      },
      {
        productId: 'p2',
        productName: 'Fanta',
        categoryId: 'cat1',
        categoryName: 'Bebidas',
        totalAvailable: 5,
        avgCostPrice: 3,
      },
    ],
  },
  {
    categoryId: 'cat2',
    categoryName: 'Snacks',
    totalQuantity: 8,
    totalCostPrice: 40,
    products: [
      {
        productId: 'p3',
        productName: 'Papas Lays',
        categoryId: 'cat2',
        categoryName: 'Snacks',
        totalAvailable: 8,
        avgCostPrice: 5,
      },
    ],
  },
];

describe('filterInventoryCategories — pure function', () => {
  it('returns all categories when query is empty', () => {
    const result = filterInventoryCategories(MOCK_CATEGORIES, '');
    expect(result).toHaveLength(2);
  });

  it('filters by product name (case-insensitive)', () => {
    const result = filterInventoryCategories(MOCK_CATEGORIES, 'coca');
    expect(result).toHaveLength(1);
    expect(result[0].products).toHaveLength(1);
    expect(result[0].products[0].productName).toBe('Coca Cola');
  });

  it('filters by category name', () => {
    const result = filterInventoryCategories(MOCK_CATEGORIES, 'snacks');
    expect(result).toHaveLength(1);
    expect(result[0].categoryName).toBe('Snacks');
  });

  it('returns empty when no match', () => {
    const result = filterInventoryCategories(MOCK_CATEGORIES, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('keeps categories that have at least one matching product', () => {
    const result = filterInventoryCategories(MOCK_CATEGORIES, 'fanta');
    expect(result).toHaveLength(1);
    expect(result[0].products).toHaveLength(1);
    expect(result[0].products[0].productName).toBe('Fanta');
  });
});

describe('InventoryProductList — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows empty state when no categories', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={[]} />
      </Wrapper>,
    );
    expect(screen.getByText(/No hay entradas/i)).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('filters products when typing in search', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'coca' } });
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(screen.queryByText('Fanta')).not.toBeInTheDocument();
  });
});

// ─── InventoryProductList — weighted avg cost + total value (gap #4/#5, Angular parity) ────
//
// Angular reference: inventory-available.component.html:24-30 (category header shows
// `{{category.categoryName}} ({{category.totalQuantity}})` + `{{category.totalCostPrice |
// currency}}`) and inventory-product-list.component.html:14-29 (per-product row shows
// `{{product.costPrice | currency}}` — the weighted-avg unit cost — and
// `{{product.costPrice * product.quantity | currency}}` — the per-product total value).

describe('InventoryProductList — weighted avg cost + total value (Angular parity)', () => {
  it('shows the category total quantity next to the category name', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    expect(screen.getByText('Bebidas (15)')).toBeInTheDocument();
    expect(screen.getByText('Snacks (8)')).toBeInTheDocument();
  });

  it('shows the category total inventory value ($ prefix, matching Angular currency pipe)', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    expect(screen.getByText('$35.00')).toBeInTheDocument();
    // $40.00 appears twice: the Snacks category total AND Papas Lays' product total value
    // (5 * 8 = 40) — same numeric coincidence documented in the test below.
    expect(screen.getAllByText('$40.00').length).toBeGreaterThanOrEqual(1);
  });

  it('shows each product weighted-average unit cost', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    // Coca Cola: avgCostPrice=2 -> $2.00; Fanta: avgCostPrice=3 -> $3.00
    expect(screen.getByText('$2.00')).toBeInTheDocument();
    expect(screen.getByText('$3.00')).toBeInTheDocument();
  });

  it('shows each product total value (avgCostPrice · totalAvailable)', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    // Coca Cola: 2 * 10 = $20.00; Fanta: 3 * 5 = $15.00; Papas Lays: 5 * 8 = $40.00
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    // $40.00 also appears as the Snacks category total (same numeric value, expected coincidence)
    expect(screen.getAllByText('$40.00').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── InventoryDailyEntries ──────────────────────────────────────────────────

import { InventoryDailyEntries } from '../inventory-daily-entries';
import type { InventoryEntryView } from '@store-mgmt/domain';

const MOCK_ENTRIES: InventoryEntryView[] = [
  {
    id: 'e1',
    productId: 'p1',
    productName: 'Coca Cola',
    quantity: 50,
    costPrice: 0.8,
    date: new Date('2025-01-01T10:00:00Z'),
    isActive: true,
  },
  {
    id: 'e2',
    productId: 'p1',
    productName: 'Coca Cola',
    quantity: 30,
    costPrice: 0.9,
    date: new Date('2025-01-01T11:00:00Z'),
    isActive: true,
  },
  {
    id: 'e3',
    productId: 'p2',
    productName: 'Fanta',
    quantity: 20,
    costPrice: 0.7,
    date: new Date('2025-01-01T09:00:00Z'),
    isActive: true,
  },
];

describe('InventoryDailyEntries — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryDailyEntries entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows empty state when no entries', () => {
    render(
      <Wrapper>
        <InventoryDailyEntries entries={[]} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/No hay entradas/i)).toBeInTheDocument();
  });

  it('groups entries by product name', () => {
    render(
      <Wrapper>
        <InventoryDailyEntries entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    // Both product names should appear
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(screen.getByText('Fanta')).toBeInTheDocument();
  });
});

// ─── EntryList ──────────────────────────────────────────────────────────────

import { EntryList } from '../entry-list';

describe('EntryList — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows empty state when no entries', () => {
    render(
      <Wrapper>
        <EntryList entries={[]} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/No hay entradas/i)).toBeInTheDocument();
  });

  it('renders each entry', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    // MOCK_ENTRIES has two Coca Cola rows so use getAllByText
    expect(screen.getAllByText('Coca Cola').length).toBeGreaterThan(0);
    expect(screen.getByText('Fanta')).toBeInTheDocument();
  });
});

// ─── EditInventoryEntryModal ─────────────────────────────────────────────────

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

import { EditInventoryEntryModal } from '../edit-inventory-entry-modal';

describe('EditInventoryEntryModal — smoke render', () => {
  it('does not render when closed', () => {
    const { container } = render(
      <Wrapper>
        <EditInventoryEntryModal
          isOpen={false}
          onClose={vi.fn()}
          onSave={vi.fn()}
          storeId="s1"
        />
      </Wrapper>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders form when open', () => {
    render(
      <Wrapper>
        <EditInventoryEntryModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          storeId="s1"
        />
      </Wrapper>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
