import type { CategoryCartItemsView } from '../lib/category-cart-items-view';

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
          <tr className="border-b border-black">
            <td className="p-1">
              <span className="font-bold text-text">{category.name}</span>
            </td>
            <td className="p-1 text-right">
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                ({category.itemsCount})
              </span>
            </td>
            <td className="p-1 text-right">
              <span className="font-bold text-success">${category.total.toFixed(2)}</span>
            </td>
          </tr>
          {category.productItems.map((product) => (
            <tr key={product.name}>
              <td className="p-1">
                <span className="font-bold text-text">{product.name}</span>
              </td>
              <td className="p-1 text-right">
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  ({product.itemsCount})
                </span>
              </td>
              <td className="p-1 text-right">
                <span className="font-bold text-success">${product.total.toFixed(2)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
