import type { CategoryCartItemsView } from '../lib/category-cart-items-view';
import { formatCurrency } from '~/shared/lib/format-currency';

interface CategoryStatsProps {
  category: CategoryCartItemsView;
}

/**
 * 1:1 port of Angular's `category-stats.component.html`: a bare table (no header row)
 * with a category summary row (name + items-count badge + total, all green/success)
 * followed by one row per product in `category.productItems` (same column layout).
 * No i18n keys here — Angular's template has zero static Spanish text, only
 * currency-formatted numbers and the category/product names themselves.
 */
export function CategoryStats({ category }: CategoryStatsProps) {
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
              <span className="font-bold text-success">{formatCurrency(category.total)}</span>
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
                <span className="font-bold text-success">{formatCurrency(product.total)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
