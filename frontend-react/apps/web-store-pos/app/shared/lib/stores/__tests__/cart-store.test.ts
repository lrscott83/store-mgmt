import { beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import { OrderType } from '@store-mgmt/domain';
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

// 1:1 port of Angular's ShoppingCartService: ONE `orderType` field on the store, overwritten
// only on the NEW-item branch of addItem (shopping-cart.service.ts:110); increments
// (increaseCartItem/decreaseCartItem) do NOT touch it. `price` lives per-CartItem, set on
// first add, and clearCart() resets orderType to Normal
// (frontend/src/app/_services/order/shopping-cart.service.ts:23,110,162).
describe('useCartStore — orderType + price threading (Egress/Mayorista realignment)', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.getState().clear();
  });

  it('defaults the store orderType to Normal', () => {
    expect(useCartStore.getState().orderType).toBe(OrderType.Normal);
  });

  it('addItem with no orderType arg keeps the store orderType at Normal (default param)', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1' }), 1);
    expect(useCartStore.getState().orderType).toBe(OrderType.Normal);
  });

  it('sets the store orderType on a NEW-item add', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1' }), 1, OrderType.Mayorista);
    expect(useCartStore.getState().orderType).toBe(OrderType.Mayorista);
  });

  it('stores the per-item price when provided on a NEW-item add', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1', price: 5 }), 1, OrderType.Mayorista, 8);
    const item = useCartStore.getState().items.find((i) => i.product.id === 'prod-1');
    expect(item?.price).toBe(8);
  });

  it('falls back to product.price when no custom price is provided on a NEW-item add', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1', price: 5 }));
    const item = useCartStore.getState().items.find((i) => i.product.id === 'prod-1');
    expect(item?.price).toBe(5);
  });

  it('does NOT overwrite orderType or price when incrementing an existing item', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1', price: 5 }), 1, OrderType.Mayorista, 9);
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1', price: 5 }), 2, OrderType.Normal, 1);
    expect(useCartStore.getState().orderType).toBe(OrderType.Mayorista);
    const item = useCartStore.getState().items.find((i) => i.product.id === 'prod-1');
    expect(item?.price).toBe(9);
    expect(item?.quantity).toBe(3);
  });

  it('clear() resets the store orderType back to Normal', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1' }), 1, OrderType.Mayorista);
    useCartStore.getState().clear();
    expect(useCartStore.getState().orderType).toBe(OrderType.Normal);
  });

  it('total() uses the per-item price when set (not product.price)', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1', price: 5 }), 2, OrderType.Mayorista, 8);
    expect(useCartStore.getState().total()).toBe(16); // 8 * 2, NOT 5 * 2
  });

  it('total() falls back to product.price for items with no custom price (Normal sale, byte-identical)', () => {
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1', price: 5 }), 2);
    useCartStore.getState().addItem(makeProduct({ id: 'prod-2', price: 3 }), 1);
    expect(useCartStore.getState().total()).toBe(13); // 5*2 + 3*1, identical to pre-change behavior
  });
});

// 1:1 port of Angular's ShoppingCartService.orderDescription field + updateOrderDetails/
// getOrderDescription (shopping-cart.service.ts:24,38-41,55-56). Angular's field is declared
// `private orderDescription: string;` with NO initializer (undefined at construction time),
// only ever set by updateOrderDetails() or reset to "" by clearCart() (line 163). React mirrors
// that: the store's initial `orderDescription` is `undefined`, not `""`.
describe('useCartStore — orderDescription (edit-order-details parity)', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.getState().clear();
  });

  it('updateOrderDetails writes both orderType and orderDescription', () => {
    useCartStore.getState().updateOrderDetails(OrderType.Mayorista, 'nota de entrega');
    expect(useCartStore.getState().orderType).toBe(OrderType.Mayorista);
    expect(useCartStore.getState().orderDescription).toBe('nota de entrega');
  });

  it('getOrderDescription returns the current orderDescription', () => {
    useCartStore.getState().updateOrderDetails(OrderType.Normal, 'entrega tarde');
    expect(useCartStore.getState().getOrderDescription()).toBe('entrega tarde');
  });

  it('clear() resets orderDescription to ""', () => {
    useCartStore.getState().updateOrderDetails(OrderType.Mayorista, 'nota de entrega');
    useCartStore.getState().clear();
    expect(useCartStore.getState().orderDescription).toBe('');
  });

  it('addItem still overwrites orderType unchanged (no field-name collision with orderDescription)', () => {
    useCartStore.getState().updateOrderDetails(OrderType.Otro, 'nota previa');
    useCartStore.getState().addItem(makeProduct({ id: 'prod-1' }), 1, OrderType.Mayorista);
    expect(useCartStore.getState().orderType).toBe(OrderType.Mayorista);
    expect(useCartStore.getState().orderDescription).toBe('nota previa');
  });
});
