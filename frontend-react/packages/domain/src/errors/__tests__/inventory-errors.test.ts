import { describe, expect, it } from 'vitest';
import { InventoryErrors } from '../inventory-errors';

// 1:1 port of Angular's frontend/src/app/domain/entities/entries/inventory.errors.ts —
// hardcoded Spanish literals there (not i18n keys), byte-identical here.
describe('InventoryErrors — 1:1 port of Angular inventory.errors.ts', () => {
  it('EntryNotExists', () => {
    expect(InventoryErrors.EntryNotExists).toEqual({
      code: 'Inventory.EntryNotExists',
      description: 'La entrada no existe.',
    });
  });

  it('SaleExistsWithThisEntry', () => {
    expect(InventoryErrors.SaleExistsWithThisEntry).toEqual({
      code: 'Inventory.SaleExistsWithThisEntry',
      description: 'Existe una venta que corresponde con esta entrada.',
    });
  });

  it('SaleNotExistsWithThisEntry', () => {
    expect(InventoryErrors.SaleNotExistsWithThisEntry).toEqual({
      code: 'Inventory.SaleNotExistsWithThisEntry',
      description: 'No Existe una venta que corresponde con esta entrada.',
    });
  });

  it('ProductNotAvailable', () => {
    expect(InventoryErrors.ProductNotAvailable).toEqual({
      code: 'Inventory.ProductNotAvailable',
      description: 'El producto no está disponible',
    });
  });
});
