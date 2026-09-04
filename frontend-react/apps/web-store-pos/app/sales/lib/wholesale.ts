import type { BaseError, Product, WholesaleConfig, WholesaleTier } from '@store-mgmt/domain';
import { Result } from '@store-mgmt/domain';
import { round2 } from '~/shared/lib/money';

/**
 * Ventas Mayoristas — helpers puros (sin I/O ni estado):
 * - `wholesaleUnits(packs, packSize)`: unidades reales a descontar/venta (packs × packSize).
 * - `getWholesaleConfig(product)`: normaliza los 3 campos opcionales del Product a un WholesaleConfig.
 * - `resolveWholesalePrice(product, packs)`: elige el escalón con mayor `minPacks <= packs` y
 *   calcula `total = packs × packSize × unitPrice`. Sin config → precio retail (fallback).
 * - `validateWholesaleConfig(config, retailPrice)`: reglas de negocio del formulario de producto.
 * - `normalizeWholesaleConfig(config)`: ordena tiers, minimos a entero, precios a 2 decimales.
 */

export interface ResolvedWholesalePrice {
  /** Precio de UNA unidad dentro del paquete, tras aplicar el escalón. */
  unitPrice: number;
  /** total = packs × packSize × unitPrice (2 decimales). */
  total: number;
}

export function wholesaleUnits(packs: number, packSize: number): number {
  return packs * packSize;
}

export function getWholesaleConfig(
  product: Pick<Product, 'wholesaleEnabled' | 'wholesalePackSize' | 'wholesaleTiers'>,
): WholesaleConfig | undefined {
  if (
    !product.wholesaleEnabled ||
    !product.wholesalePackSize ||
    product.wholesalePackSize <= 0 ||
    !product.wholesaleTiers ||
    product.wholesaleTiers.length === 0
  ) {
    return undefined;
  }
  return { packSize: product.wholesalePackSize, tiers: product.wholesaleTiers };
}

export function resolveWholesalePrice(
  product: Pick<Product, 'price' | 'wholesaleEnabled' | 'wholesalePackSize' | 'wholesaleTiers'>,
  packs: number,
): ResolvedWholesalePrice {
  const config = getWholesaleConfig(product);
  if (!config || !(packs > 0)) {
    return { unitPrice: product.price, total: round2(product.price * Math.max(packs, 0)) };
  }
  const applicable = [...config.tiers]
    .filter((tier) => tier.minPacks <= packs)
    .sort((a, b) => b.minPacks - a.minPacks)[0];
  const unitPrice = applicable?.pricePerUnit ?? product.price;
  return { unitPrice, total: round2(wholesaleUnits(packs, config.packSize) * unitPrice) };
}

const WholesaleErrors = {
  PackSizeInvalid: {
    code: 'Product.WholesalePackSizeInvalid',
    description: 'Las unidades por paquete deben ser un número entero mayor que 0.',
  },
  TiersEmpty: {
    code: 'Product.WholesaleTiersEmpty',
    description: 'Debe definir al menos un rango de precio mayorista.',
  },
  FirstTierMustStartAtOne: {
    code: 'Product.WholesaleFirstTierMustStartAtOne',
    description: 'El primer rango mayorista debe comenzar en 1 paquete.',
  },
  DuplicateMinPacks: {
    code: 'Product.WholesaleDuplicateMinPacks',
    description: 'Los rangos mayoristas no pueden repetir el mínimo de paquetes.',
  },
  InvalidMinPacks: {
    code: 'Product.WholesaleInvalidMinPacks',
    description: 'El mínimo de paquetes debe ser un número entero mayor que 0.',
  },
  InvalidPricePerUnit: {
    code: 'Product.WholesaleInvalidPricePerUnit',
    description: 'El precio por unidad mayorista debe ser mayor que 0.',
  },
  PriceAboveRetail: {
    code: 'Product.WholesalePriceAboveRetail',
    description: 'El precio por unidad mayorista no puede ser mayor que el precio de venta.',
  },
} as const satisfies Record<string, BaseError>;

export function validateWholesaleConfig(config: WholesaleConfig | undefined, retailPrice: number): Result {
  if (!config) return Result.Success();

  const errors: BaseError[] = [];

  if (!Number.isInteger(config.packSize) || config.packSize <= 0) {
    errors.push(WholesaleErrors.PackSizeInvalid);
  }

  if (!Array.isArray(config.tiers) || config.tiers.length === 0) {
    errors.push(WholesaleErrors.TiersEmpty);
  } else {
    if (config.tiers[0].minPacks !== 1) {
      errors.push(WholesaleErrors.FirstTierMustStartAtOne);
    }

    const minPacksSet = new Set<number>();
    for (const tier of config.tiers) {
      if (minPacksSet.has(tier.minPacks)) {
        errors.push(WholesaleErrors.DuplicateMinPacks);
      }
      minPacksSet.add(tier.minPacks);

      if (!Number.isInteger(tier.minPacks) || tier.minPacks <= 0) {
        errors.push(WholesaleErrors.InvalidMinPacks);
      }
      if (!(tier.pricePerUnit > 0)) {
        errors.push(WholesaleErrors.InvalidPricePerUnit);
      } else if (tier.pricePerUnit > retailPrice) {
        errors.push(WholesaleErrors.PriceAboveRetail);
      }
    }
  }

  return errors.length > 0 ? Result.Failure(errors) : Result.Success();
}

export function normalizeWholesaleConfig(config: WholesaleConfig, _retailPrice?: number): WholesaleConfig {
  const normalizedTiers = [...config.tiers]
    .map<WholesaleTier>((tier) => ({
      minPacks: Math.round(tier.minPacks),
      pricePerUnit: round2(tier.pricePerUnit),
    }))
    .sort((a, b) => a.minPacks - b.minPacks);
  return {
    packSize: Math.round(config.packSize),
    tiers: normalizedTiers,
  };
}