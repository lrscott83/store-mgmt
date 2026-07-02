import { beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import { useCartStore } from '../cart-store';

// getItemQuantity is a 1:1 port of Angular's ShoppingCartService.getCartItemQuantity
// (frontend/src/app/_services/order/shopping-cart.service.ts:166-174), used by
// sale-product-row.component.ts:60 to include the cart's already-added quantity when
// checking stock availability.

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Coca Cola',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1.5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('useCartStore.getItemQuantity', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.getState().clear();
  });

  it('returns 0 when the product is not in the cart', () => {
    expect(useCartStore.getState().getItemQuantity('missing')).toBe(0);
  });

  it('returns the item quantity when the product is in the cart', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-9' }), 3);
    expect(useCartStore.getState().getItemQuantity('prod-9')).toBe(3);
  });

  it('sums quantity across repeated addItem calls for the same product (Angular semantics)', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-9' }), 2);
    useCartStore.getState().addItem(makeProduct({ id: 'prod-9' }), 5);
    expect(useCartStore.getState().getItemQuantity('prod-9')).toBe(7);
  });
});
