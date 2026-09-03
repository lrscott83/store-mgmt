import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { formatCurrency } from '~/shared/lib/format-currency';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';

interface InventoryProductListProps {
  categories: InventoryCategoryView[];
}

/**
 * Pure filtering function — testable in isolation.
 * Returns categories whose name or whose products' names match the query.
 * Products within a category are also filtered to matching ones only.
 */
export function filterInventoryCategories(
  categories: InventoryCategoryView[],
  query: string,
): InventoryCategoryView[] {
  const q = query.trim().toLowerCase();
  if (!q) return categories;

  return categories.reduce<InventoryCategoryView[]>((acc, cat) => {
    const categoryMatches = cat.categoryName.toLowerCase().includes(q);

    const matchingProducts = categoryMatches
      ? cat.products
      : cat.products.filter((p) => p.productName.toLowerCase().includes(q));

    if (matchingProducts.length > 0) {
      acc.push({ ...cat, products: matchingProducts });
    }
    return acc;
  }, []);
}

export function InventoryProductList({ categories }: InventoryProductListProps) {
  const intl = useIntl();
  const [search, setSearch] = useState('');
  // Angular parity: inventory-available.component.html:19-33 `mat-accordion` with
  // `[expanded]="false"` — categories are collapsed by default, click header to expand.
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());

  const filtered = filterInventoryCategories(categories, search);
  const isSearching = search.trim() !== '';

  function toggleCategory(categoryId: string) {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <input
          role="searchbox"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={intl.formatMessage({ id: 'GENERAL.SEARCH' })}
          className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-text-muted">
          {intl.formatMessage({ id: 'INVENTORY.CATEGORY_PRODUCT_NO_FOUND' })}
        </div>
      ) : (
        filtered.map((cat) => {
          // A category with an active search match auto-expands, so filtering stays useful
          // without requiring an extra click (React-only UX addition on top of the accordion).
          const isExpanded = isSearching || expandedCategoryIds.has(cat.categoryId);
          return (
            <div key={cat.categoryId} className="space-y-1 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => toggleCategory(cat.categoryId)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                data-testid={`inventory-category-toggle-${cat.categoryId}`}
                aria-expanded={isExpanded}
              >
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
                  {cat.categoryName} ({cat.totalQuantity})
                </h2>
                <span className="flex items-center gap-2">
                  {/* Category total inventory value — Angular's mat-expansion-panel-header
                      category.totalCostPrice chip (inventory-available.component.html:26). */}
                  <span className="text-sm font-semibold text-primary">
                    {formatCurrency(cat.totalCostPrice)}
                  </span>
                  <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                </span>
              </button>
              {isExpanded && (
                <div className="divide-y divide-border border-t border-border bg-surface">
                  {cat.products.map((p) => (
                    <div key={p.productId} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="font-medium text-text">
                          {p.productName} ({p.totalAvailable})
                        </p>
                      </div>
                      <div className="text-right">
                        {/* Weighted-average unit cost + per-product total value — Angular's
                            product.costPrice / product.costPrice*product.quantity currency cells
                            (inventory-product-list.component.html:20-29). */}
                        <p className="text-sm font-semibold text-success">
                          {formatCurrency(p.avgCostPrice)}
                        </p>
                        <p className="text-sm font-semibold text-primary">
                          {formatCurrency(p.avgCostPrice * p.totalAvailable)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
