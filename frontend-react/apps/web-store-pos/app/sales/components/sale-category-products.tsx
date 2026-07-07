import type { Product, Result } from '@store-mgmt/domain';
import type { OrderType } from '@store-mgmt/domain';
import { SaleProductRow } from './sale-product-row';

interface SaleCategoryProductsProps {
  /** Products already scoped to the selected category by the parent (Angular's `products$`
   * comes pre-filtered from ProductService.getProductsToSaleByCategoryId). */
  products: Product[];
  orderType: OrderType;
  onAdded: (productId: string, quantity: number, price: number) => void;
  checkAvailability?: (productId: string, quantity: number) => Result;
}

/**
 * Strict parity with Angular's sale-category-products.component.html: a simple list of
 * per-product rows for the currently-selected category, no extra grouping/search/filter UI.
 */
export function SaleCategoryProducts({ products, orderType, onAdded, checkAvailability }: SaleCategoryProductsProps) {
  return (
    <div>
      {products.map((product) => (
        <SaleProductRow
          key={product.id}
          product={product}
          orderType={orderType}
          onAdded={onAdded}
          checkAvailability={checkAvailability}
        />
      ))}
    </div>
  );
}
