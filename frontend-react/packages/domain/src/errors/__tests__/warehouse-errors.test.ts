import { describe, expect, it } from 'vitest';
import { WarehouseErrors } from '../warehouse-errors';

describe('WarehouseErrors', () => {
  it('InvalidName carries the Warehouse.InvalidName code', () => {
    expect(WarehouseErrors.InvalidName).toEqual({
      code: 'Warehouse.InvalidName',
      description: 'El nombre del almacén no puede estar vacío.',
    });
  });

  it('InsufficientStock carries the Warehouse.InsufficientStock code', () => {
    expect(WarehouseErrors.InsufficientStock).toEqual({
      code: 'Warehouse.InsufficientStock',
      description: 'No hay suficiente stock en el almacén.',
    });
  });

  it('CannotDeactivate carries the Warehouse.CannotDeactivate code', () => {
    expect(WarehouseErrors.CannotDeactivate).toEqual({
      code: 'Warehouse.CannotDeactivate',
      description: 'No se puede desactivar un almacén con stock o movimientos.',
    });
  });

  it('all entries expose code and description', () => {
    for (const [key, error] of Object.entries(WarehouseErrors)) {
      expect(key.length).toBeGreaterThan(0);
      expect(error.code.startsWith('Warehouse.')).toBe(true);
      expect(error.description.length).toBeGreaterThan(0);
    }
  });
});