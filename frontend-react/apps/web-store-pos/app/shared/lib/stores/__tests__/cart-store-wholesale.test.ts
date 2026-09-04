import { beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import { OrderType } from '@store-mgmt/domain';
import { useCartStore } from '../cart-store';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'beer-1',
    name: 'Cerveza',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 700,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    wholesaleEnabled: true,
    wholesalePackSize: 24,
    wholesaleTiers: [
      { minPacks: 1, pricePerUnit: 680 },
      { minPacks: 11, pricePerUnit: 660 },
      { minPacks: 21, pricePerUnit: 640 },
    ],
    ...overrides,
  };
}

describe('useCartStore — flujo mayorista (packs × packSize → unidades, price custom, OrderType.Mayorista)', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.getState().clear();
  });

  it('agrega 12 paquetes como 288 unidades con el precio por unidad del tier', () => {
    useCartStore.getState().addItem(makeProduct(), 288, OrderType.Mayorista, 660);
    const state = useCartStore.getState();
    expect(state.orderType).toBe(OrderType.Mayorista);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(288);
    expect(state.items[0].price).toBe(660);
  });

  it('total = cantidad × precio por unidad (12 × 24 × 660 = 190080)', () => {
    useCartStore.getState().addItem(makeProduct(), 288, OrderType.Mayorista, 660);
    expect(useCartStore.getState().total()).toBe(190080);
  });

  it('getItemQuantity acumula en unidades (288 + 24 = 312)', () => {
    const store = useCartStore.getState();
    store.addItem(makeProduct(), 288, OrderType.Mayorista, 660);
    store.addItem(makeProduct(), 24, OrderType.Mayorista, 680);
    expect(useCartStore.getState().getItemQuantity('beer-1')).toBe(312);
  });

  it('clear() deja el carrito como venta Normal vacía (sin contaminar la siguiente venta)', () => {
    useCartStore.getState().addItem(makeProduct(), 288, OrderType.Mayorista, 660);
    useCartStore.getState().clear();
    const state = useCartStore.getState();
    expect(state.orderType).toBe(OrderType.Normal);
    expect(state.items).toHaveLength(0);
    expect(state.total()).toBe(0);
  });
});