import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { SaleProductRow } from './sale-product-row';

interface CartQtyMap {
  [productId: string]: number;
}

interface SaleCategoryProductsProps {
  category: ProductCategory;
  products: Product[];
  cartQtyMap: CartQtyMap;
  onAdd: (product: Product) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
}

export function SaleCategoryProducts({
  category,
  products,
  cartQtyMap,
  onAdd,
  onIncrease,
  onDecrease,
}: SaleCategoryProductsProps) {
  const intl = useIntl();

  const availableProducts = products.filter(
    (p) => p.availableToSale && p.isActive && p.categoryId === category.id,
  );

  if (availableProducts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
        {category.name}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {availableProducts.map((product) => (
          <SaleProductRow
            key={product.id}
            product={product}
            quantity={cartQtyMap[product.id] ?? 0}
            onAdd={onAdd}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
          />
        ))}
      </div>
    </div>
  );
}
