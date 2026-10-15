import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ChevronDownIcon, SearchIcon } from '~/shared/components/ui/icons';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';
import { filterInventoryCategories } from './inventory-product-list';
import { round2 } from '~/shared/lib/money';

interface ProductCountListProps {
  categories: InventoryCategoryView[];
  search: string;
  onSearchChange: (value: string) => void;
  /** Cantidad contada por producto, tal como la escribió el operador. Solo visual. */
  counts: Record<string, string>;
  onCountChange: (productId: string, value: string) => void;
}

/**
 * Diferencia del conteo: `contada − sistema`. Devuelve `null` cuando la fila
 * todavía no se contó (vacía o no numérica) — la vista muestra `—` en ese caso.
 * Función pura, testeable en aislamiento.
 */
export function countDifference(rawValue: string | undefined, system: number): number | null {
  if (rawValue === undefined || rawValue.trim() === '') return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  return round2(parsed - system);
}

/**
 * Conteo de productos — solo visual: los conteos viven en el estado de la
 * pantalla (los posee la ruta, que también decide cuándo limpiarlos). No
 * persiste nada ni ajusta el stock. Productos agrupados por categoría en
 * paneles colapsables, igual que las demás vistas de inventario.
 */
export function ProductCountList({
  categories,
  search,
  onSearchChange,
  counts,
  onCountChange,
}: ProductCountListProps) {
  const intl = useIntl();
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());

  const filtered = filterInventoryCategories(categories, search);
  const isSearching = search.trim() !== '';

  // Numeración de las filas en el orden en que se ven (continúa entre categorías).
  const rowIndexByProductId = new Map<string, number>();
  let nextRowIndex = 0;
  for (const cat of filtered) {
    for (const product of cat.products) {
      rowIndexByProductId.set(product.productId, (nextRowIndex += 1));
    }
  }

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
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          role="searchbox"
          data-testid="product-count-search"
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={intl.formatMessage({ id: 'INVENTORY.COUNT.SEARCH_PLACEHOLDER' })}
          className="w-full rounded border border-border py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-text-muted">
          {intl.formatMessage({ id: 'INVENTORY.CATEGORY_PRODUCT_NO_FOUND' })}
        </div>
      ) : (
        filtered.map((cat) => {
          const isExpanded = isSearching || expandedCategoryIds.has(cat.categoryId);
          return (
            <div key={cat.categoryId} className="space-y-1 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => toggleCategory(cat.categoryId)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                data-testid={`product-count-category-toggle-${cat.categoryId}`}
                aria-expanded={isExpanded}
              >
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
                  {cat.categoryName} ({cat.products.length})
                </h2>
                <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
              </button>
              {isExpanded && (
                <div className="space-y-2 border-t border-border bg-surface px-3 py-3">
                  {cat.products.map((p) => {
                    const rawValue = counts[p.productId];
                    const difference = countDifference(rawValue, p.totalAvailable);
                    const differenceClass =
                      difference === null
                        ? 'bg-gray-100 text-text-muted'
                        : difference < 0
                          ? 'bg-danger/10 text-danger'
                          : 'bg-success/10 text-success';
                    return (
                      <div
                        key={p.productId}
                        data-testid={`product-count-row-${p.productId}`}
                        className="flex items-center gap-3 rounded-lg border border-border px-3 py-3"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                          {rowIndexByProductId.get(p.productId)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-text">{p.productName}</p>
                          <p className="text-xs text-text-muted">
                            {intl.formatMessage(
                              { id: 'INVENTORY.COUNT.SYSTEM' },
                              { quantity: p.totalAvailable },
                            )}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <label
                              className="text-xs font-medium text-primary"
                              htmlFor={`inventory-count-${p.productId}`}
                            >
                              {intl.formatMessage({ id: 'INVENTORY.COUNT.COUNTED' })}
                            </label>
                            <input
                              id={`inventory-count-${p.productId}`}
                              data-testid={`inventory-count-input-${p.productId}`}
                              type="number"
                              min="0"
                              step="any"
                              value={rawValue ?? ''}
                              onChange={(e) => onCountChange(p.productId, e.target.value)}
                              className="w-24 rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>
                        <span
                          data-testid={`inventory-count-difference-${p.productId}`}
                          className={`shrink-0 rounded-md px-3 py-1 text-sm font-semibold ${differenceClass}`}
                        >
                          {difference === null ? '—' : `${difference >= 0 ? '+' : ''}${difference}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
