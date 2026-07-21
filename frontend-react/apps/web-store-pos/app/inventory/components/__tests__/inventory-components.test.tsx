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

  it('shows empty state when no categories (Angular parity: INVENTORY.CATEGORY_PRODUCT_NO_FOUND)', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={[]} />
      </Wrapper>,
    );
    expect(
      screen.getByText('No existe ningún producto disponible en la categoría'),
    ).toBeInTheDocument();
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

// ─── InventoryProductList — collapsible accordion (Angular parity: inventory-available.
// component.html:19-33 `mat-accordion` with `[expanded]="false"` — categories collapsed by
// default, click to expand) ──────────────────────────────────────────────────

describe('InventoryProductList — collapsible accordion (Angular parity)', () => {
  it('renders categories collapsed by default (product rows hidden, header summary shown)', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    // Category-level summary always visible, even collapsed.
    expect(screen.getByText('Bebidas (15)')).toBeInTheDocument();
    // Per-product rows are hidden until expanded.
    expect(screen.queryByText('Coca Cola')).not.toBeInTheDocument();
    expect(screen.queryByText('Fanta')).not.toBeInTheDocument();
  });

  it('expands a category on click, revealing its products', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('inventory-category-toggle-cat1'));
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(screen.getByText('Fanta')).toBeInTheDocument();
    // Other category stays collapsed.
    expect(screen.queryByText('Papas Lays')).not.toBeInTheDocument();
  });

  it('collapses an expanded category back on a second click', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    const toggle = screen.getByTestId('inventory-category-toggle-cat1');
    fireEvent.click(toggle);
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText('Coca Cola')).not.toBeInTheDocument();
  });

  it('auto-expands a category with matching search results', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'coca' } });
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
  });

  // Parity fix (collapsible-panel-chevron-parity): the category header must render the
  // shared ChevronDownIcon and rotate it (rotate-180) iff the category is expanded.
  it('renders a chevron on the category header that rotates iff the category is expanded', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    const toggle = screen.getByTestId('inventory-category-toggle-cat1');
    const svgClass = () => toggle.querySelector('svg')?.getAttribute('class') ?? '';
    expect(toggle.querySelector('svg')).toBeInTheDocument();
    expect(svgClass()).not.toContain('rotate-180');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(svgClass()).toContain('rotate-180');
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

  it('shows each product weighted-average unit cost (category expanded)', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('inventory-category-toggle-cat1'));
    // Coca Cola: avgCostPrice=2 -> $2.00; Fanta: avgCostPrice=3 -> $3.00
    expect(screen.getByText('$2.00')).toBeInTheDocument();
    expect(screen.getByText('$3.00')).toBeInTheDocument();
  });

  it('shows each product total value (avgCostPrice · totalAvailable, category expanded)', () => {
    render(
      <Wrapper>
        <InventoryProductList categories={MOCK_CATEGORIES} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('inventory-category-toggle-cat1'));
    fireEvent.click(screen.getByTestId('inventory-category-toggle-cat2'));
    // Coca Cola: 2 * 10 = $20.00; Fanta: 3 * 5 = $15.00; Papas Lays: 5 * 8 = $40.00
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    // $40.00 also appears as the Snacks category total (same numeric value, expected coincidence)
    expect(screen.getAllByText('$40.00').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── EntryList fixtures ─────────────────────────────────────────────────────

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

  it('shows empty state when no entries (Angular parity: INVENTORY.NO_ENTRY_FOUND)', () => {
    render(
      <Wrapper>
        <EntryList entries={[]} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('No existe ningún producto disponible')).toBeInTheDocument();
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

// ─── EntryList — readOnly prop (Angular parity: entry-list.component.ts:22
// `@Input() readOnly: boolean = true` — gates the edit/delete menu) ─────────

describe('EntryList — readOnly prop (Angular parity)', () => {
  it('shows edit/delete actions (via the gear menu) when isOwnerAdmin and readOnly is not passed', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} isOwnerAdmin />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('entry-actions-toggle-e1'));
    expect(screen.getByText('Editar')).toBeInTheDocument();
    // CRITICAL bug fix (Angular parity: entry-list.component.html:36 GENERAL.DELETE) — was
    // wrongly wired to ORDERS.DEACTIVATE ("Anular pedido"), the cancel-order label.
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
    expect(screen.queryByText('Anular pedido')).not.toBeInTheDocument();
  });

  it('hides edit/delete actions when readOnly is true, even for an owner-admin', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} isOwnerAdmin readOnly />
      </Wrapper>,
    );
    expect(screen.queryByTestId('entry-actions-toggle-e1')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
    // Data still renders — only the actions column is gated.
    expect(screen.getAllByText('Coca Cola').length).toBeGreaterThan(0);
  });
});

describe('EntryList — gear action menu (S-GM-ENTRY)', () => {
  it('S-GM-ENTRY-1: owner-admin, not read-only sees the gear with Editar (text-primary) and Eliminar (text-danger, separator)', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} isOwnerAdmin readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('entry-actions-toggle-e1'));
    const editItem = screen.getByRole('menuitem', { name: 'Editar' });
    const deleteItem = screen.getByRole('menuitem', { name: 'Eliminar' });
    expect(editItem).toHaveClass('text-primary');
    expect(deleteItem).toHaveClass('text-danger');
    expect(deleteItem.previousElementSibling).toHaveAttribute('role', 'separator');
  });

  it('S-GM-ENTRY-2: read-only or non-owner-admin hides the actions gear', () => {
    const { rerender } = render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} isOwnerAdmin={false} readOnly={false} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('entry-actions-toggle-e1')).not.toBeInTheDocument();

    rerender(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} isOwnerAdmin readOnly />
      </Wrapper>,
    );
    expect(screen.queryByTestId('entry-actions-toggle-e1')).not.toBeInTheDocument();
  });

  it('S-GM-ENTRY-3: Editar and Eliminar invoke the existing onEdit/onDeactivate handlers with the entry', () => {
    const onEdit = vi.fn();
    const onDeactivate = vi.fn();
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} onEdit={onEdit} onDeactivate={onDeactivate} isOwnerAdmin readOnly={false} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('entry-actions-toggle-e1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith(MOCK_ENTRIES[0]);

    fireEvent.click(screen.getByTestId('entry-actions-toggle-e1'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
    expect(onDeactivate).toHaveBeenCalledWith(MOCK_ENTRIES[0]);
  });
});

// ─── EntryList — isOwnerAdmin gating (Angular parity: entry-list.component.html:16,23
// `@if (isOwnerAdmin())` for cost-price, `@if (isOwnerAdmin() && !readOnly)` for actions) ────
//
// Angular hides BOTH the cost-price column and the edit/delete actions from non-owner-admin
// users — React previously rendered the cost-price column and (when !readOnly) the actions
// column unconditionally, with no role check at all.

describe('EntryList — isOwnerAdmin gating (Angular parity)', () => {
  it('hides the cost-price column and all actions when isOwnerAdmin is false (default)', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByText('Precio de costo')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
    // Data still renders — only cost-price/actions columns are gated.
    expect(screen.getAllByText('Coca Cola').length).toBeGreaterThan(0);
  });

  it('shows the cost-price column when isOwnerAdmin is true', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} isOwnerAdmin />
      </Wrapper>,
    );
    expect(screen.getByText('Precio de costo')).toBeInTheDocument();
    expect(screen.getByText('$0.80')).toBeInTheDocument();
  });

  it('shows actions only when isOwnerAdmin is true AND readOnly is false', () => {
    render(
      <Wrapper>
        <EntryList entries={MOCK_ENTRIES} onEdit={vi.fn()} onDeactivate={vi.fn()} isOwnerAdmin />
      </Wrapper>,
    );
    expect(screen.getByTestId('entry-actions-toggle-e1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('entry-actions-toggle-e1'));
    expect(screen.getByText('Editar')).toBeInTheDocument();
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
  });
});

// ─── EditInventoryEntryModal ─────────────────────────────────────────────────

// Flag #4: the modal loads its product dropdown via getProductsToSelect() (async,
// ProductSelectView[]) and no longer touches ProductCategoryOfflineService.
vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getProductsToSelect: vi.fn(async () => ({ data: [], succeeded: true, message: '', actionCode: 200, errors: [] })),
  })),
}));

// Retained (hoisted, file-wide) for any other component in this suite — the modal itself
// no longer uses it.
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
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import type { InventoryEntry } from '@store-mgmt/domain';

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

// ─── EditInventoryEntryModal — create vs. edit mode (Angular parity) ────────
//
// Angular reference: edit-inventory-entry-modal.component.html:4 (title toggles
// INVENTORY_ENTRY.NEW_INVENTORY_ENTRY / EDIT_INVENTORY_ENTRY based on `!inventoryEntry`) and
// :84 (save button toggles GENERAL.INSERT / GENERAL.UPDATE). React previously had a
// copy-paste bug: both ternary branches resolved to the same key (always "new entry" copy)
// and the save button was hardcoded to GENERAL.SAVE regardless of mode.

function makeEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: 'e1',
    productId: 'p1',
    categoryId: 'cat1',
    quantity: 5,
    available: 5,
    costPrice: 2,
    date: new Date('2025-01-01'),
    order: 0,
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('EditInventoryEntryModal — title/save button toggle by mode (Angular parity)', () => {
  it('shows the create-mode title and save label when no entry is passed', () => {
    render(
      <Wrapper>
        <EditInventoryEntryModal isOpen onClose={vi.fn()} onSave={vi.fn()} storeId="s1" />
      </Wrapper>,
    );
    expect(screen.getByText('Adicionar Entrada')).toBeInTheDocument();
    expect(screen.queryByText('Editar Entrada')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
  });

  it('shows the edit-mode title and save label when an entry is passed', () => {
    render(
      <Wrapper>
        <EditInventoryEntryModal
          isOpen
          onClose={vi.fn()}
          onSave={vi.fn()}
          storeId="s1"
          entry={makeEntry()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Editar Entrada')).toBeInTheDocument();
    expect(screen.queryByText('Adicionar Entrada')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
  });
});

// ─── EditInventoryEntryModal — validation messages (Angular parity) ─────────
//
// Angular reference: edit-inventory-entry-modal.component.html:26,42,64 (GENERAL.VALIDATION.
// REQUIRED / NUMBER_GREADER_THAN_ONE / NUMBER_GREADER_THAN_ZERO, each interpolated with the
// field's own label). React previously hardcoded raw Spanish suffixes concatenated onto the
// field label instead of using these i18n keys.

describe('EditInventoryEntryModal — validation messages (Angular parity)', () => {
  it('shows the required-product message using GENERAL.VALIDATION.REQUIRED', () => {
    render(
      <Wrapper>
        <EditInventoryEntryModal isOpen onClose={vi.fn()} onSave={vi.fn()} storeId="s1" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(screen.getByText('Producto es requerido')).toBeInTheDocument();
  });

  it('shows the quantity-minimum message using GENERAL.VALIDATION.NUMBER_GREADER_THAN_ONE', async () => {
    vi.mocked(ProductOfflineService).mockImplementationOnce(
      () =>
        ({
          getProductsToSelect: vi.fn(async () => ({
            data: [{ id: 'p1', fullName: 'Bebidas - Ron' }],
            succeeded: true,
            message: '',
            actionCode: 200,
            errors: [],
          })),
        }) as unknown as InstanceType<typeof ProductOfflineService>,
    );
    render(
      <Wrapper>
        <EditInventoryEntryModal isOpen onClose={vi.fn()} onSave={vi.fn()} storeId="s1" />
      </Wrapper>,
    );
    await screen.findByRole('option', { name: 'Bebidas - Ron' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(screen.getByText('Cantidad mínimo valor es 1')).toBeInTheDocument();
  });

  it('shows the cost-price-minimum message using GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO', async () => {
    vi.mocked(ProductOfflineService).mockImplementationOnce(
      () =>
        ({
          getProductsToSelect: vi.fn(async () => ({
            data: [{ id: 'p1', fullName: 'Bebidas - Ron' }],
            succeeded: true,
            message: '',
            actionCode: 200,
            errors: [],
          })),
        }) as unknown as InstanceType<typeof ProductOfflineService>,
    );
    render(
      <Wrapper>
        <EditInventoryEntryModal isOpen onClose={vi.fn()} onSave={vi.fn()} storeId="s1" />
      </Wrapper>,
    );
    await screen.findByRole('option', { name: 'Bebidas - Ron' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Precio de costo'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(screen.getByText('Precio de costo mínimo valor es 0')).toBeInTheDocument();
  });
});
