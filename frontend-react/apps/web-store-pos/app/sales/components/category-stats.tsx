import type { CategoryCartItemsView } from '../lib/category-cart-items-view';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

interface CategoryStatsProps {
  category: CategoryCartItemsView;
  /** Moneda con la que formatear los montos; ausente = CUP (DEFAULT_CURRENCY). */
  currency?: number;
}

/**
 * 1:1 port of Angular's `category-stats.component.html`: a bare table (no header row)
 * with a category summary row (name + items-count badge + total, all green/success)
 * followed by one row per product in `category.productItems` (same column layout).
 * No i18n keys here — Angular's template has zero static Spanish text, only
 * currency-formatted numbers and the category/product names themselves.
 *
 * `currency` es opcional (currency-filter-per-view): las vistas que filtran por
 * moneda lo pasan con la moneda elegida para que las filas muestren solo esa
 * moneda; los llamadores que no lo pasan mantienen el CUP por defecto.
 */
export function CategoryStats({ category, currency }: CategoryStatsProps) {
  if (!category) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td className="p-1">
              <span className="font-bold text-text">{category.name}</span>
            </td>
            <td className="p-1 text-right">
              <span className="font-bold text-success">({category.itemsCount})</span>
            </td>
            <td className="p-1 text-right">
              <span className="font-bold text-success">
                {formatMoneyWithCurrency(category.total, currency)}
              </span>
            </td>
          </tr>
          {category.productItems.map((product) => (
            <tr key={product.name}>
              <td className="p-1">
                <span className="font-bold text-text">{product.name}</span>
              </td>
              <td className="p-1 text-right">
                <span className="font-bold text-success">({product.itemsCount})</span>
              </td>
              <td className="p-1 text-right">
                <span className="font-bold text-success">
                  {formatMoneyWithCurrency(product.total, currency)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
