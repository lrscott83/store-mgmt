import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import {
  STOREFRONT_CART_STORAGE_KEY,
  useStorefrontCartStore,
} from '~/catalog/lib/storefront-cart-store';

function add(slug: string, productId: string, quantity = 1, unitPrice = 10) {
  useStorefrontCartStore
    .getState()
    .addItem(slug, { id: productId, name: `Producto ${productId}`, currency: 'CUP', unitPrice }, quantity);
}

function lines(slug: string) {
  return useStorefrontCartStore.getState().itemsByStore[slug] ?? [];
}

describe('storefront cart store (F3 — carrito del cliente anónimo)', () => {
  beforeEach(() => {
    localStorage.clear();
    useStorefrontCartStore.setState({ itemsByStore: {} });
    useCartStore.getState().clear();
  });

  it('persiste en su PROPIA clave, nunca en la del POS', () => {
    add('mi-tienda', 'p1');

    expect(STOREFRONT_CART_STORAGE_KEY).toBe('lizoft-catalog-cart');
    expect(STOREFRONT_CART_STORAGE_KEY).not.toBe('lizoft-cart');
    expect(localStorage.getItem(STOREFRONT_CART_STORAGE_KEY)).toContain('p1');
    // La clave del POS existe (su propio `persist` la escribe) pero NO conoce el producto del
    // cliente: las dos carritos viven en entradas distintas y no se pisan.
    expect(localStorage.getItem('lizoft-cart')).not.toContain('p1');
  });

  it('no toca el carrito del POS al añadir, cambiar o vaciar', () => {
    useCartStore.getState().addItem(
      {
        id: 'pos-1',
        name: 'Producto del POS',
        categoryId: 'c1',
        categoryName: 'Cat',
        price: 5,
        order: 1,
        availableToSale: true,
        discountFromInvantory: false,
        businessId: 'b1',
        isActive: true,
        createdDate: new Date('2025-01-01'),
        createdByName: 'test',
      },
      2,
    );

    add('mi-tienda', 'p1', 3);
    useStorefrontCartStore.getState().updateQuantity('mi-tienda', 'p1', 9);
    useStorefrontCartStore.getState().clear('mi-tienda');

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].product.id).toBe('pos-1');
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('añade, acumula cantidad y quita líneas', () => {
    add('mi-tienda', 'p1', 2);
    add('mi-tienda', 'p1', 3);
    add('mi-tienda', 'p2');

    expect(lines('mi-tienda')).toHaveLength(2);
    expect(lines('mi-tienda').find((line) => line.productId === 'p1')?.quantity).toBe(5);

    useStorefrontCartStore.getState().removeItem('mi-tienda', 'p1');
    expect(lines('mi-tienda').map((line) => line.productId)).toEqual(['p2']);
  });

  it('aisla por slug: dos tiendas no comparten carrito', () => {
    add('tienda-a', 'p1', 1);
    add('tienda-b', 'p2', 4);

    expect(lines('tienda-a').map((line) => line.productId)).toEqual(['p1']);
    expect(lines('tienda-b').map((line) => line.productId)).toEqual(['p2']);

    // Vaciar una no toca la otra.
    useStorefrontCartStore.getState().clear('tienda-a');
    expect(lines('tienda-a')).toEqual([]);
    expect(lines('tienda-b')).toHaveLength(1);

    // Y una tercera tienda nunca vio nada.
    expect(lines('tienda-c')).toEqual([]);
  });

  it('updateQuantity con 0 o menos quita la línea', () => {
    add('mi-tienda', 'p1', 2);

    useStorefrontCartStore.getState().updateQuantity('mi-tienda', 'p1', 0);
    expect(lines('mi-tienda')).toEqual([]);
  });

  it('el total y el conteo son de presentación, por tienda', () => {
    add('tienda-a', 'p1', 2, 82.5);
    add('tienda-a', 'p2', 1, 10);

    expect(useStorefrontCartStore.getState().total('tienda-a')).toBe(175);
    expect(useStorefrontCartStore.getState().count('tienda-a')).toBe(3);
    // Otra tienda no hereda el subtotal aunque comparta navegador.
    expect(useStorefrontCartStore.getState().total('tienda-b')).toBe(0);
  });
});
