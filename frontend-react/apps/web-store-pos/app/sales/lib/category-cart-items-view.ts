/**
 * View models matching Angular's `application/orders/category-cart-items.view.ts` and
 * `application/orders/product-cart-items.view.ts` — aggregated per-category / per-product
 * sales totals for the "Cuadre del día" (Today Stats) view. Not domain entities: these are
 * a service-layer projection, so they live in `sales/lib`, not `@store-mgmt/domain`.
 */
export interface ProductCartItemsView {
  name: string;
  order: number;
  total: number;
  itemsCount: number;
  price: number;
}

export interface CategoryCartItemsView {
  id: string;
  name: string;
  order: number;
  total: number;
  itemsCount: number;
  productItems: ProductCartItemsView[];
}
