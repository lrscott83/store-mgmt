import { describe, it, expect } from 'vitest';
import { OrderType, Result } from '@store-mgmt/domain';
import type { Product } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { guardOrderType } from '../order-type-guard';

function makeProduct(): Product {
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
  };
}

function makeItem(): CartItem {
  return { product: makeProduct(), quantity: 1 };
}

describe('guardOrderType — exclusividad Normal/Mayorista', () => {
  it('permite añadir Normal con carrito vacío', () => {
    const result = guardOrderType({ items: [], cartOrderType: OrderType.Normal, requested: OrderType.Normal });
    expect(result.succeeded).toBe(true);
  });

  it('permite añadir Mayorista con carrito vacío', () => {
    const result = guardOrderType({ items: [], cartOrderType: OrderType.Normal, requested: OrderType.Mayorista });
    expect(result.succeeded).toBe(true);
  });

  it('permite añadir Normal cuando el carrito ya es de venta normal', () => {
    const result = guardOrderType({
      items: [makeItem(), makeItem()],
      cartOrderType: OrderType.Normal,
      requested: OrderType.Normal,
    });
    expect(result.succeeded).toBe(true);
  });

  it('permite añadir Mayorista cuando el carrito ya es de venta mayorista', () => {
    const result = guardOrderType({
      items: [makeItem()],
      cartOrderType: OrderType.Mayorista,
      requested: OrderType.Mayorista,
    });
    expect(result.succeeded).toBe(true);
  });

  it('bloquea añadir Mayorista cuando el carrito tiene venta normal en curso', () => {
    const result = guardOrderType({
      items: [makeItem()],
      cartOrderType: OrderType.Normal,
      requested: OrderType.Mayorista,
    });
    expect(result.succeeded).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].description).toContain('venta normal');
  });

  it('bloquea añadir Normal cuando el carrito tiene venta mayorista en curso', () => {
    const result = guardOrderType({
      items: [makeItem()],
      cartOrderType: OrderType.Mayorista,
      requested: OrderType.Normal,
    });
    expect(result.succeeded).toBe(false);
    expect(result.errors[0].description).toContain('venta mayorista');
  });

  it('carrito con ítems y orderType Normal por defecto (legacy) bloquea Mayorista igual', () => {
    const result = guardOrderType({
      items: [makeItem()],
      cartOrderType: OrderType.Normal,
      requested: OrderType.Mayorista,
    });
    expect(result.succeeded).toBe(false);
  });

  it('devuelve Result tipado (contrato con los handlers de las vistas)', () => {
    const result = guardOrderType({ items: [], cartOrderType: OrderType.Normal, requested: OrderType.Normal });
    expect(result).toBeInstanceOf(Result);
  });
});
