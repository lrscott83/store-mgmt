import { describe, expect, it } from 'vitest';
import { wholesaleDisplayOf } from '~/catalog/lib/catalog-wholesale';
import type { PublicCatalogProduct } from '~/sales/lib/services/catalog-http-service';

/**
 * `wholesaleDisplayOf` — el adaptador que decide si un producto publicado se vende por PAQUETES y
 * con qué números (R3-PACKPRICE-FALLBACK-UNPROVED, S1/S4).
 *
 * Dos caminos que ningún test fijaba y que cambian lo que el cliente lee:
 *
 *   1. el precio del paquete llega CALCULADO del servidor (`wholesalePackPrice`) y se prefiere tal
 *      cual; si la respuesta no lo trae —un payload anterior a la funcionalidad— se recalcula desde
 *      el escalón de entrada, porque el número que ve el cliente no puede depender de que él sepa
 *      multiplicar ni de un redondeo distinto al del servidor;
 *   2. un producto puede tener datos mayoristas y NO ser vendible por paquetes: sin `packSize`, sin
 *      escalones o sin la bandera, la config no es válida y la ficha se pinta como siempre. El
 *      servidor ya no publica esos productos en modo mayorista (S2), pero una respuesta vieja o un
 *      modo que cambió a mitad de sesión no puede dejar al cliente con una tarjeta sin precio.
 */

function makeProduct(overrides: Partial<PublicCatalogProduct> = {}): PublicCatalogProduct {
  return {
    id: 'cerveza',
    name: 'Cerveza',
    description: 'Caja de 12 botellas',
    price: 100,
    finalPrice: 100,
    hasDiscount: false,
    percentDiscountPrice: 0,
    percentDiscount: 0,
    discountPrice: 0,
    discountAmount: 0,
    isNew: false,
    currency: 'CUP',
    categoryId: 'c1',
    categoryName: 'Bebidas',
    categorySlug: 'bebidas',
    imageUrl: null,
    imageUrls: [],
    priceMode: 'Wholesale',
    wholesaleEnabled: true,
    wholesalePackSize: 12,
    wholesaleUnitLabel: 'caja',
    wholesaleMinPacks: 3,
    wholesaleUnitPrice: 32,
    wholesalePackPrice: 384,
    wholesaleTiers: [{ minPacks: 3, pricePerUnit: 32, packPrice: 384 }],
    ...overrides,
  };
}

describe('wholesaleDisplayOf — precio del paquete', () => {
  it('usa el precio que manda el servidor cuando viene', () => {
    // 384 es el número que el servidor calculó y con el que va a cobrar: recalcularlo aquí abriría
    // la puerta a dos redondeos distintos del mismo dinero.
    const display = wholesaleDisplayOf(makeProduct({ wholesalePackPrice: 384 }));

    expect(display).not.toBeNull();
    expect(display?.packPrice).toBe(384);
    expect(display?.unit).toBe('caja');
    expect(display?.unitPlural).toBe('cajas');
    expect(display?.packSize).toBe(12);
    expect(display?.minPacks).toBe(3);
  });

  it('si el servidor NO manda el precio del paquete lo recalcula desde el escalón de entrada', () => {
    // Payload anterior a la funcionalidad: sin `wholesalePackPrice`, el precio del paquete es el
    // precio por unidad del primer escalón (32) × las unidades del paquete (12).
    const display = wholesaleDisplayOf(makeProduct({ wholesalePackPrice: undefined }));

    expect(display?.packPrice).toBe(384);
    expect(display?.unit).toBe('caja');
  });

  it('un precio del paquete inválido (0) tampoco se publica: se recalcula', () => {
    const display = wholesaleDisplayOf(makeProduct({ wholesalePackPrice: 0 }));

    expect(display?.packPrice).toBe(384);
  });
});

describe('wholesaleDisplayOf — config inválida', () => {
  it('sin tamaño de paquete no se vende por paquetes', () => {
    expect(wholesaleDisplayOf(makeProduct({ wholesalePackSize: 0 }))).toBeNull();
  });

  it('sin escalones no hay precio que resolver', () => {
    expect(wholesaleDisplayOf(makeProduct({ wholesaleTiers: [] }))).toBeNull();
  });

  it('con la bandera mayorista apagada no se vende por paquetes', () => {
    expect(wholesaleDisplayOf(makeProduct({ wholesaleEnabled: false }))).toBeNull();
  });

  it('con datos mayoristas pero publicada POR UNIDAD se queda en precio unitario', () => {
    // El sync lleva siempre los dos precios (S3): el modo es lo que decide, y leer la config sola
    // pondría paquetes en el carrito de un catálogo por unidad.
    expect(wholesaleDisplayOf(makeProduct({ priceMode: 'Unit' }))).toBeNull();
  });
});
