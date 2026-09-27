import type { OrderItem } from '@store-mgmt/domain';
import { round2 } from '~/shared/lib/money';

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

/** Agrupa por `String(item[key])` preservando el orden de primera aparición (Map). */
function groupBy<T>(items: readonly T[], key: keyof T): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupId = String(item[key]);
    const collection = groups.get(groupId);
    if (collection) collection.push(item);
    else groups.set(groupId, [item]);
  }
  return groups;
}

/** Mismo `round2(Σ round2(price × qty))` que usaba el servicio (no cambia el redondeo). */
function getOrderItemsTotal(items: readonly OrderItem[]): number {
  return round2(items.reduce((sum, item) => sum + round2(item.price * item.quantity), 0));
}

/** Suma de cantidades (puede ser fraccionaria). */
function getOrderItemsCount(items: readonly OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Agregación pura compartida: reagrupa ítems de órdenes por categoría → producto con el
 * MISMO `round2(Σ round2(price × qty))`. El orden de las categorías y de los productos
 * sigue el orden de primera aparición en `orderItems` (insertion order del `Map`), NO un
 * sort por `order` — comportamiento deliberado heredado del servicio. El `order` de cada
 * categoría sale de `storageCategories`; sin coincidencia cae a `Number.MAX_VALUE`.
 *
 * Callers: `OrderOfflineService.getCategoryCartItemsView` /
 * `getCategoryCartItemsViewBetweenDates` (envelope propio) y `today-stats.tsx` (sobre las
 * órdenes ya filtradas por moneda).
 */
export function buildCategoryCartItemsView(
  orderItems: readonly OrderItem[],
  storageCategories: readonly { id: string; order: number }[],
): CategoryCartItemsView[] {
  const categoryGroups = groupBy(orderItems, 'categoryId');

  const categoryItemsView: CategoryCartItemsView[] = [];
  categoryGroups.forEach((categoryItems) => {
    const item = categoryItems[0];
    const productGroups = groupBy(categoryItems, 'productId');
    const productItems: ProductCartItemsView[] = [];
    productGroups.forEach((products) => {
      const product = products[0];
      productItems.push({
        name: product.name,
        order: product.order,
        total: getOrderItemsTotal(products),
        itemsCount: getOrderItemsCount(products),
        price: product.price,
      });
    });
    const storageCategory = storageCategories.find((c) => c.id === item.categoryId);
    categoryItemsView.push({
      id: item.categoryId,
      name: item.categoryName,
      order: storageCategory ? storageCategory.order : Number.MAX_VALUE,
      total: getOrderItemsTotal(categoryItems),
      itemsCount: getOrderItemsCount(categoryItems),
      productItems,
    });
  });

  return categoryItemsView;
}
