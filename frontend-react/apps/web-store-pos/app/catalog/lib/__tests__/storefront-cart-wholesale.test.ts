import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import {
  lineMinPacks,
  linePackPrice,
  linePacks,
  lineTotal,
  useStorefrontCartStore,
  type StorefrontCartLine,
  type StorefrontCartProduct,
} from '~/catalog/lib/storefront-cart-store';

/**
 * Carrito del cliente en modo MAYORISTA (S4).
 *
 * La regla que se copia del POS, línea por línea:
 *   - el cliente elige PAQUETES;
 *   - el escalón aplicable es el de mayor `minPacks <= packs`;
 *   - el total de la línea es `packs × packSize × unitPrice`;
 *   - ± mueven UN paquete;
 *   - bajar del mínimo de paquetes SACA la línea del carrito.
 *
 * El modo unitario se prueba aquí solo para pinchar que NO cambió (la suite existente del store
 * sigue cubriéndolo desde fuera).
 */

const SLUG = 'mi-tienda';

/** Cerveza: caja de 12, 10 por unidad desde 1 caja y 8 por unidad desde 5 cajas. */
const WHOLESALE: StorefrontCartProduct = {
  id: 'cerveza',
  name: 'Cerveza',
  currency: 'CUP',
  unitPrice: 12,
  imageUrl: null,
  wholesale: {
    packSize: 12,
    unitLabel: 'caja',
    tiers: [
      { minPacks: 1, pricePerUnit: 40 },
      { minPacks: 5, pricePerUnit: 32 },
    ],
  },
};

function line(productId: string): StorefrontCartLine | undefined {
  return (useStorefrontCartStore.getState().itemsByStore[SLUG] ?? []).find(
    (item) => item.productId === productId,
  );
}

function addWholesale(quantity?: number) {
  useStorefrontCartStore.getState().addItem(SLUG, WHOLESALE, quantity);
}

describe('storefront cart — modo mayorista (S4)', () => {
  beforeEach(() => {
    localStorage.clear();
    useStorefrontCartStore.setState({ itemsByStore: {} });
    useCartStore.getState().clear();
  });

  it('añadir sin cantidad entra por el MÍNIMO de paquetes y factura el escalón de entrada', () => {
    addWholesale();

    const added = line('cerveza');
    expect(added?.packs).toBe(1);
    expect(added?.packSize).toBe(12);
    // Unidades al servidor: packs × packSize.
    expect(added?.quantity).toBe(12);
    expect(added?.unitPrice).toBe(40);
    expect(lineTotal(added!)).toBe(480);
  });

  it('la cantidad mínima manda: un producto con mínimo 3 entra con 3 paquetes', () => {
    useStorefrontCartStore.getState().addItem(SLUG, {
      ...WHOLESALE,
      id: 'fardo',
      wholesale: {
        packSize: 6,
        unitLabel: 'fardo',
        tiers: [{ minPacks: 3, pricePerUnit: 20 }],
      },
    });

    expect(line('fardo')?.packs).toBe(3);
    expect(line('fardo')?.quantity).toBe(18);
    expect(lineMinPacks(line('fardo')!)).toBe(3);
  });

  it('una cantidad explícita por debajo del mínimo sube al mínimo, no crea una línea invendible', () => {
    useStorefrontCartStore.getState().addItem(
      SLUG,
      {
        ...WHOLESALE,
        id: 'fardo',
        wholesale: {
          packSize: 6,
          unitLabel: 'fardo',
          tiers: [{ minPacks: 3, pricePerUnit: 20 }],
        },
      },
      1,
    );

    expect(line('fardo')?.packs).toBe(3);
    expect(line('fardo')?.quantity).toBe(18);
  });

  it('± mueven UN paquete y re-resuelven el escalón al cruzar el rango', () => {
    addWholesale();

    // 1 → 2 paquetes: sigue el primer escalón.
    useStorefrontCartStore.getState().updateQuantity(SLUG, 'cerveza', 2);
    expect(line('cerveza')?.packs).toBe(2);
    expect(line('cerveza')?.unitPrice).toBe(40);
    expect(line('cerveza')?.quantity).toBe(24);

    // 2 → 5 paquetes: ahora aplica el segundo escalón, y la línea ENTERA pasa a ese precio.
    useStorefrontCartStore.getState().updateQuantity(SLUG, 'cerveza', 5);
    expect(line('cerveza')?.packs).toBe(5);
    expect(line('cerveza')?.unitPrice).toBe(32);
    expect(line('cerveza')?.quantity).toBe(60);
    expect(lineTotal(line('cerveza')!)).toBe(1920);

    // Y de vuelta al rango anterior.
    useStorefrontCartStore.getState().updateQuantity(SLUG, 'cerveza', 4);
    expect(line('cerveza')?.unitPrice).toBe(40);
    expect(lineTotal(line('cerveza')!)).toBe(4 * 12 * 40);
  });

  it('el precio de un paquete es unitario × unidades del paquete', () => {
    addWholesale();

    expect(linePackPrice(line('cerveza')!)).toBe(480);
    expect(linePacks(line('cerveza')!)).toBe(1);
  });

  it('bajar por debajo del mínimo SACA la línea del carrito', () => {
    useStorefrontCartStore.getState().addItem(SLUG, {
      ...WHOLESALE,
      id: 'fardo',
      wholesale: {
        packSize: 6,
        unitLabel: 'fardo',
        tiers: [{ minPacks: 3, pricePerUnit: 20 }],
      },
    });

    // 3 → 2 paquetes: por debajo del mínimo vendible, la línea desaparece.
    useStorefrontCartStore.getState().updateQuantity(SLUG, 'fardo', 2);
    expect(line('fardo')).toBeUndefined();

    // Y 0 también la quita (mismo criterio que el carrito del POS).
    addWholesale();
    useStorefrontCartStore.getState().updateQuantity(SLUG, 'cerveza', 0);
    expect(line('cerveza')).toBeUndefined();
  });

  it('acumula paquetes sobre la línea existente y re-resuelve el precio del total', () => {
    addWholesale();
    addWholesale();

    expect(line('cerveza')?.packs).toBe(2);
    expect(line('cerveza')?.unitPrice).toBe(40);

    // 4 paquetes ya entran en el segundo escalón: la acumulación no cobra el precio viejo.
    addWholesale(3);
    expect(line('cerveza')?.packs).toBe(5);
    expect(line('cerveza')?.unitPrice).toBe(32);
  });

  it('guarda en la línea lo que la vista necesita para no volver a pedir el producto', () => {
    addWholesale();

    const added = line('cerveza')!;
    expect(added.priceMode).toBe('Wholesale');
    expect(added.packSize).toBe(12);
    expect(added.unitLabel).toBe('caja');
    expect(added.tiers).toEqual([
      { minPacks: 1, pricePerUnit: 40 },
      { minPacks: 5, pricePerUnit: 32 },
    ]);
  });

  it('total y contador hablan en paquetes en mayorista', () => {
    addWholesale();

    expect(useStorefrontCartStore.getState().total(SLUG)).toBe(480);
    // Una caja es UNA cosa en el carrito, no 12.
    expect(useStorefrontCartStore.getState().count(SLUG)).toBe(1);
  });

  it('suma líneas mayoristas y por unidad con el importe que corresponde a cada una', () => {
    useStorefrontCartStore
      .getState()
      .addItem(SLUG, { id: 'arroz', name: 'Arroz', currency: 'CUP', unitPrice: 10 }, 3);
    addWholesale();

    // Arroz: 3 × 10. Cerveza: 1 caja × 12 × 40.
    expect(useStorefrontCartStore.getState().total(SLUG)).toBe(30 + 480);
    expect(useStorefrontCartStore.getState().count(SLUG)).toBe(3 + 1);
  });

  it('un producto con config mayorista pero publicado por unidad se queda por unidad', () => {
    // El modo lo decide `priceMode` en la carta; aquí se prueba la guarda del store: sin config
    // publicada no hay línea de paquetes, aunque el producto traiga precios mayoristas.
    useStorefrontCartStore
      .getState()
      .addItem(SLUG, { id: 'camisa', name: 'Camisa', currency: 'CUP', unitPrice: 82.5 });

    const added = line('camisa')!;
    expect(added.priceMode).toBeUndefined();
    expect(added.quantity).toBe(1);
    expect(added.unitPrice).toBe(82.5);
    expect(linePacks(added)).toBe(1);
    expect(lineMinPacks(added)).toBe(1);
    expect(lineTotal(added)).toBe(82.5);
  });
});
