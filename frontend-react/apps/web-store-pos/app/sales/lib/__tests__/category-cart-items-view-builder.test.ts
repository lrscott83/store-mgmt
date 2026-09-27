import { describe, it, expect } from 'vitest';
import type { OrderItem } from '@store-mgmt/domain';
import { buildCategoryCartItemsView } from '../category-cart-items-view';

/**
 * Contrato del builder compartido: es el único lugar donde vive la agregación que antes
 * estaba duplicada en `OrderOfflineService` (dos métodos) y en `today-stats.tsx`.
 */
function item(
  overrides: Partial<OrderItem> & Pick<OrderItem, 'categoryId' | 'productId'>,
): OrderItem {
  return {
    productName: overrides.productId,
    categoryName: overrides.categoryId,
    name: overrides.productId,
    quantity: 1,
    price: 1,
    productBusinessId: '',
    productCosts: [],
    order: 0,
    ...overrides,
  };
}

describe('buildCategoryCartItemsView', () => {
  it('preserva el orden de primera aparición de categorías y productos (sin sort por order)', () => {
    const orderItems = [
      item({ categoryId: 'B', categoryName: 'Cat B', productId: 'X' }),
      item({ categoryId: 'A', categoryName: 'Cat A', productId: 'Y' }),
      item({ categoryId: 'B', categoryName: 'Cat B', productId: 'Z' }),
    ];
    const storageCategories = [
      { id: 'A', order: 1 },
      { id: 'B', order: 2 },
    ];

    const result = buildCategoryCartItemsView(orderItems, storageCategories);

    // B aparece primero en orderItems, así que va primero aunque su order sea 2.
    expect(result.map((c) => c.id)).toEqual(['B', 'A']);
    expect(result[0].productItems.map((p) => p.name)).toEqual(['X', 'Z']);
  });

  it('suma cada línea con round2(price × qty) y luego round2 del total', () => {
    const orderItems = [
      item({ categoryId: 'A', productId: 'P', price: 0.1, quantity: 1 }),
      item({ categoryId: 'A', productId: 'P', price: 0.1, quantity: 2 }),
    ];

    const [category] = buildCategoryCartItemsView(orderItems, []);

    expect(category.total).toBe(0.3);
    expect(category.productItems[0].total).toBe(0.3);
  });

  it('redondea por línea antes de sumar (no redondea solo al final)', () => {
    const orderItems = [
      item({ categoryId: 'A', productId: 'P', price: 0.004, quantity: 1 }),
      item({ categoryId: 'A', productId: 'P', price: 0.004, quantity: 1 }),
    ];

    const [category] = buildCategoryCartItemsView(orderItems, []);

    // round2(0.004)=0 por línea → total 0 (si no se redondeara por línea daría 0.01).
    expect(category.productItems[0].total).toBe(0);
    expect(category.total).toBe(0);
  });

  it('itemsCount es la suma de cantidades por producto y por categoría', () => {
    const orderItems = [
      item({ categoryId: 'A', productId: 'P', quantity: 1.5 }),
      item({ categoryId: 'A', productId: 'P', quantity: 2.5 }),
      item({ categoryId: 'A', productId: 'Q', quantity: 3 }),
    ];

    const [category] = buildCategoryCartItemsView(orderItems, []);

    expect(category.itemsCount).toBe(7);
    expect(category.productItems[0].itemsCount).toBe(4);
    expect(category.productItems[1].itemsCount).toBe(3);
  });

  it('resuelve el order de categoría desde storageCategories', () => {
    const orderItems = [item({ categoryId: 'A', categoryName: 'Cat A', productId: 'P' })];
    const storageCategories = [{ id: 'A', order: 42 }];

    const [category] = buildCategoryCartItemsView(orderItems, storageCategories);

    expect(category.order).toBe(42);
  });

  it('cae a Number.MAX_VALUE cuando la categoría no está en storageCategories', () => {
    const orderItems = [item({ categoryId: 'ghost', productId: 'P' })];

    const [category] = buildCategoryCartItemsView(orderItems, [{ id: 'A', order: 1 }]);

    expect(category.order).toBe(Number.MAX_VALUE);
  });

  it('devuelve [] para entrada vacía', () => {
    expect(buildCategoryCartItemsView([], [{ id: 'A', order: 1 }])).toEqual([]);
  });
});
