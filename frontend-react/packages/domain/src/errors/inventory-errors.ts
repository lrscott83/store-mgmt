import type { BaseError } from '../models/base';

/**
 * 1:1 port of Angular's `InventoryErrors`
 * (frontend/src/app/domain/entities/entries/inventory.errors.ts). Angular hardcodes
 * the Spanish description literals directly in this class (not routed through i18n) —
 * ported verbatim, byte-identical.
 */
export const InventoryErrors = {
  EntryNotExists: {
    code: 'Inventory.EntryNotExists',
    description: 'La entrada no existe.',
  },
  SaleExistsWithThisEntry: {
    code: 'Inventory.SaleExistsWithThisEntry',
    description: 'Existe una venta que corresponde con esta entrada.',
  },
  SaleNotExistsWithThisEntry: {
    code: 'Inventory.SaleNotExistsWithThisEntry',
    description: 'No Existe una venta que corresponde con esta entrada.',
  },
  ProductNotAvailable: {
    code: 'Inventory.ProductNotAvailable',
    description: 'El producto no está disponible',
  },
} as const satisfies Record<string, BaseError>;
