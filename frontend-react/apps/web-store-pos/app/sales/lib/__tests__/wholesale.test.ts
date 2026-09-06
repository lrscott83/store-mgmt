import { describe, expect, it } from 'vitest';
import type { Product, WholesaleConfig } from '@store-mgmt/domain';
import {
  getWholesaleConfig,
  getWholesaleMinPacks,
  normalizeWholesaleConfig,
  resolveWholesalePrice,
  validateWholesaleConfig,
  wholesaleUnitName,
  wholesaleUnitPlural,
  wholesaleUnits,
} from '../wholesale';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Cerveza',
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 700,
    order: 0,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: '',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

const beerConfig: WholesaleConfig = {
  packSize: 24,
  tiers: [
    { minPacks: 1, pricePerUnit: 680 },
    { minPacks: 11, pricePerUnit: 660 },
    { minPacks: 21, pricePerUnit: 640 },
  ],
};

describe('getWholesaleMinPacks — cantidad mínima de paquetes', () => {
  it('sin config mayorista devuelve 0 (sin mínimo)', () => {
    expect(getWholesaleMinPacks(makeProduct())).toBe(0);
  });

  it('devuelve el minPacks del primer rango (el menor de todos)', () => {
    const result = getWholesaleMinPacks(
      makeProduct({ wholesaleEnabled: true, wholesalePackSize: 24, wholesaleTiers: beerConfig.tiers }),
    );
    expect(result).toBe(1);
  });

  it('primer rango que no comienza en 1: el mínimo es ese valor', () => {
    const result = getWholesaleMinPacks(
      makeProduct({
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }],
      }),
    );
    expect(result).toBe(5);
  });

  it('con tiers desordenados toma el menor minPacks', () => {
    const result = getWholesaleMinPacks(
      makeProduct({
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [
          { minPacks: 11, pricePerUnit: 660 },
          { minPacks: 1, pricePerUnit: 680 },
        ],
      }),
    );
    expect(result).toBe(1);
  });

  it('wholesaleEnabled=false o sin tiers devuelve 0', () => {
    expect(
      getWholesaleMinPacks(
        makeProduct({ wholesaleEnabled: false, wholesalePackSize: 24, wholesaleTiers: beerConfig.tiers }),
      ),
    ).toBe(0);
    expect(
      getWholesaleMinPacks(
        makeProduct({ wholesaleEnabled: true, wholesalePackSize: 24, wholesaleTiers: [] }),
      ),
    ).toBe(0);
  });
});

describe('wholesaleUnits — packs × packSize', () => {
  it('convierte paquetes a unidades (12 cajas de 24 → 288)', () => {
    expect(wholesaleUnits(12, 24)).toBe(288);
  });

  it('convierte paquetes de 6 (3 × 6 → 18)', () => {
    expect(wholesaleUnits(3, 6)).toBe(18);
  });
});

describe('resolveWholesalePrice', () => {
  it('sin config mayorista cae al precio retail (unitPrice = product.price)', () => {
    const result = resolveWholesalePrice(makeProduct(), 2);
    expect(result).toEqual({ unitPrice: 700, total: 1400 });
  });

  it('wholesaleEnabled=false cae al precio retail', () => {
    const result = resolveWholesalePrice(
      makeProduct({ wholesaleEnabled: false, wholesalePackSize: 24, wholesaleTiers: beerConfig.tiers }),
      2,
    );
    expect(result).toEqual({ unitPrice: 700, total: 1400 });
  });

  it('usa el tier base (minPacks 1) cuando no se supera ningún umbral', () => {
    const result = resolveWholesalePrice(
      makeProduct({ wholesaleEnabled: true, wholesalePackSize: 24, wholesaleTiers: beerConfig.tiers }),
      5,
    );
    expect(result.unitPrice).toBe(680);
    expect(result.total).toBe(5 * 24 * 680);
  });

  it('elige el tier con el mayor minPacks <= paquetes (12 cajas → tier de 11 → 660)', () => {
    const result = resolveWholesalePrice(
      makeProduct({ wholesaleEnabled: true, wholesalePackSize: 24, wholesaleTiers: beerConfig.tiers }),
      12,
    );
    expect(result.unitPrice).toBe(660);
    expect(result.total).toBe(12 * 24 * 660); // 190.080
  });

  it('elige el tier superior (21+ cajas → 640) y respeta la cantidad', () => {
    const result = resolveWholesalePrice(
      makeProduct({ wholesaleEnabled: true, wholesalePackSize: 24, wholesaleTiers: beerConfig.tiers }),
      25,
    );
    expect(result.unitPrice).toBe(640);
    expect(result.total).toBe(25 * 24 * 640);
  });

  it('primer rango > 1: packs por debajo del umbral se venden al precio normal', () => {
    const result = resolveWholesalePrice(
      makeProduct({
        price: 700,
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }],
      }),
      4,
    );
    expect(result.unitPrice).toBe(700);
    expect(result.total).toBe(4 * 24 * 700);
  });

  it('primer rango > 1: desde el umbral aplica el precio del rango', () => {
    const result = resolveWholesalePrice(
      makeProduct({
        price: 700,
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 5, pricePerUnit: 680 }],
      }),
      5,
    );
    expect(result.unitPrice).toBe(680);
    expect(result.total).toBe(5 * 24 * 680);
  });

  it('redondea el total a 2 decimales', () => {
    const result = resolveWholesalePrice(
      makeProduct({ price: 10, wholesaleEnabled: true, wholesalePackSize: 3, wholesaleTiers: [{ minPacks: 1, pricePerUnit: 3.333333 }] }),
      2,
    );
    expect(result.total).toBe(round3(2 * 3 * 3.333333));
  });
});

describe('validateWholesaleConfig', () => {
  it('config ausente es válida (producto no mayorista)', () => {
    expect(validateWholesaleConfig(undefined, 700).succeeded).toBe(true);
  });

  it('config válida pasa', () => {
    expect(validateWholesaleConfig(beerConfig, 700).succeeded).toBe(true);
  });

  it('packSize ausente/0/negativo/no entero falla', () => {
    for (const bad of [0, -3, 2.5]) {
      const result = validateWholesaleConfig({ packSize: bad, tiers: beerConfig.tiers }, 700);
      expect(result.succeeded).toBe(false);
      expect(result.errors.some((e) => e.code === 'Product.WholesalePackSizeInvalid')).toBe(true);
    }
  });

  // NaN = campo vaciado por el usuario (wholesale-config-section emite NaN, nunca 0).
  // La validación al guardar es la que exige un valor correcto.
  it('packSize NaN (campo vaciado) falla al guardar', () => {
    const result = validateWholesaleConfig({ packSize: NaN, tiers: beerConfig.tiers }, 700);
    expect(result.succeeded).toBe(false);
    expect(result.errors.some((e) => e.code === 'Product.WholesalePackSizeInvalid')).toBe(true);
  });

  it('minPacks NaN (campo vaciado) falla al guardar', () => {
    const result = validateWholesaleConfig(
      { packSize: 24, tiers: [{ minPacks: NaN, pricePerUnit: 680 }] },
      700,
    );
    expect(result.succeeded).toBe(false);
    expect(result.errors.some((e) => e.code === 'Product.WholesaleInvalidMinPacks')).toBe(true);
  });

  it('pricePerUnit NaN (campo vaciado) falla al guardar', () => {
    const result = validateWholesaleConfig(
      { packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: NaN }] },
      700,
    );
    expect(result.succeeded).toBe(false);
    expect(result.errors.some((e) => e.code === 'Product.WholesaleInvalidPricePerUnit')).toBe(true);
  });

  it('sin tiers falla', () => {
    const result = validateWholesaleConfig({ packSize: 24, tiers: [] }, 700);
    expect(result.succeeded).toBe(false);
    expect(result.errors.some((e) => e.code === 'Product.WholesaleTiersEmpty')).toBe(true);
  });

  // El primer rango NO está obligado a comenzar en 1: los packs por debajo del primer rango
  // se venden al precio normal (fallback en resolveWholesalePrice). Definir un rango que
  // empieza en 5 es válido.
  it('primer rango que no comienza en 1 es válido', () => {
    const result = validateWholesaleConfig(
      { packSize: 24, tiers: [{ minPacks: 5, pricePerUnit: 680 }] },
      700,
    );
    expect(result.succeeded).toBe(true);
  });

  it('minPacks duplicados fallan', () => {
    const result = validateWholesaleConfig(
      { packSize: 24, tiers: [
        { minPacks: 1, pricePerUnit: 680 },
        { minPacks: 1, pricePerUnit: 660 },
      ] },
      700,
    );
    expect(result.succeeded).toBe(false);
    expect(result.errors.some((e) => e.code === 'Product.WholesaleDuplicateMinPacks')).toBe(true);
  });

  it('pricePerUnit mayor que el precio retail falla', () => {
    const result = validateWholesaleConfig(
      { packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 750 }] },
      700,
    );
    expect(result.succeeded).toBe(false);
    expect(result.errors.some((e) => e.code === 'Product.WholesalePriceAboveRetail')).toBe(true);
  });

  it('pricePerUnit no positivo falla', () => {
    const result = validateWholesaleConfig(
      { packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 0 }] },
      700,
    );
    expect(result.succeeded).toBe(false);
  });
});

describe('normalizeWholesaleConfig', () => {
  it('ordena tiers ascendente, redondea precios y packSize a entero', () => {
    const normalized = normalizeWholesaleConfig(
      {
        packSize: 24.4,
        tiers: [
          { minPacks: 21, pricePerUnit: 640.004 },
          { minPacks: 1, pricePerUnit: 680.006 },
          { minPacks: 11, pricePerUnit: 660 },
        ],
      },
      700,
    );
    expect(normalized.packSize).toBe(24);
    expect(normalized.tiers.map((t) => t.minPacks)).toEqual([1, 11, 21]);
    expect(normalized.tiers[0].pricePerUnit).toBe(680.01);
  });
});

// ─── Unidad de medida configurable (wholesaleUnitLabel, 2026-09-05) ─────────

describe('wholesaleUnitName — unidad de medida del producto', () => {
  it('devuelve la unidad configurada del producto ("caja")', () => {
    expect(wholesaleUnitName(makeProduct({ wholesaleUnitLabel: 'caja' }))).toBe('caja');
  });

  it('cae a "paquete" sin label configurado', () => {
    expect(wholesaleUnitName(makeProduct())).toBe('paquete');
  });

  it('cae a "paquete" con label vacío o solo espacios (trim antes del check)', () => {
    expect(wholesaleUnitName(makeProduct({ wholesaleUnitLabel: '' }))).toBe('paquete');
    expect(wholesaleUnitName(makeProduct({ wholesaleUnitLabel: '   ' }))).toBe('paquete');
  });
});

describe('wholesaleUnitPlural — plural de la unidad', () => {
  it('agrega "s" a la unidad ("caja" → "cajas")', () => {
    expect(wholesaleUnitPlural('caja')).toBe('cajas');
  });

  it('el plural es SIEMPRE, incluso con minPacks 1 ("1 paquetes" histórico pineado por E2E)', () => {
    expect(wholesaleUnitPlural('paquete')).toBe('paquetes');
  });
});

describe('getWholesaleConfig — unitLabel en la config normalizada', () => {
  it('incluye unitLabel cuando el producto lo tiene', () => {
    const config = getWholesaleConfig(
      makeProduct({
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
        wholesaleUnitLabel: 'caja',
      }),
    );
    expect(config?.unitLabel).toBe('caja');
  });

  it('omite unitLabel cuando el producto no lo tiene (clave ausente, no string vacío)', () => {
    const config = getWholesaleConfig(
      makeProduct({
        wholesaleEnabled: true,
        wholesalePackSize: 24,
        wholesaleTiers: [{ minPacks: 1, pricePerUnit: 680 }],
      }),
    );
    expect(config?.unitLabel).toBeUndefined();
  });

  it('normalizeWholesaleConfig preserva el unitLabel con trim', () => {
    const normalized = normalizeWholesaleConfig({
      packSize: 24,
      tiers: [{ minPacks: 1, pricePerUnit: 680 }],
      unitLabel: '  caja  ',
    });
    expect(normalized.unitLabel).toBe('caja');
  });

  it('normalizeWholesaleConfig omite unitLabel vacío', () => {
    const normalized = normalizeWholesaleConfig({
      packSize: 24,
      tiers: [{ minPacks: 1, pricePerUnit: 680 }],
      unitLabel: '   ',
    });
    expect(normalized.unitLabel).toBeUndefined();
  });
});

// local helper to mirror round2 without importing app internals
function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}