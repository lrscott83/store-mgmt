import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { InfoBox } from '~/shared/components/ui/info-box';

interface CategoryProductListProps {
  categories: ProductCategory[];
  products: Product[];
  searchQuery: string;
  onEdit: (product: Product) => void;
}

export function CategoryProductList({ categories, products, searchQuery, onEdit }: CategoryProductListProps) {
  const intl = useIntl();

  const filtered = searchQuery
    ? products.filter(
        (p) =>
          p.isActive &&
          (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.categoryName?.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : products.filter((p) => p.isActive);

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      {sortedCategories.map((category) => {
        const categoryProducts = filtered.filter((p) => p.categoryId === category.id);
        if (categoryProducts.length === 0) return null;
        return (
          <div key={category.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 rounded-t-lg">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{category.name}</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {categoryProducts.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-500">${product.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {!product.availableToSale && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        {intl.formatMessage({ id: 'PRODUCTS.FORM.AVAILABLE_TO_SALE' })}: Off
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onEdit(product)}
                      className="text-xs font-medium text-primary hover:text-primary-hover transition-colors"
                      aria-label={`${intl.formatMessage({ id: 'PRODUCTS.EDIT' })} ${product.name}`}
                    >
                      {intl.formatMessage({ id: 'PRODUCTS.EDIT' })}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {filtered.length === 0 && (
        <InfoBox className="text-center">
          {intl.formatMessage({ id: 'PRODUCTS.EMPTY_STATE' })}
        </InfoBox>
      )}
    </div>
  );
}
