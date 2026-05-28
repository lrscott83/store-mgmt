import { useState } from 'react';
import { useIntl } from 'react-intl';
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

  const filtered = filterInventoryCategories(categories, search);

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
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400">
          {intl.formatMessage({ id: 'INVENTORY.EMPTY_STATE' })}
        </div>
      ) : (
        filtered.map((cat) => (
          <div key={cat.categoryId} className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {cat.categoryName}
            </h2>
            <div className="divide-y rounded border bg-white">
              {cat.products.map((p) => (
                <div key={p.productId} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-800">{p.productName}</p>
                    <p className="text-xs text-gray-400">{p.categoryName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-blue-700">{p.totalAvailable}</p>
                    <p className="text-xs text-gray-400">
                      {intl.formatMessage({ id: 'INVENTORY.ENTRY.AVAILABLE' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
