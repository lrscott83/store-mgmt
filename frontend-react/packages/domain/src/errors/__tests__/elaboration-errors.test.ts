import { describe, expect, it } from 'vitest';
import {
  ElaborationErrors,
  elaborationInsufficientStockError,
} from '../elaboration-errors';

describe('ElaborationErrors', () => {
  it('InsufficientStock carries the Elaboration.InsufficientStock code', () => {
    expect(ElaborationErrors.InsufficientStock).toEqual({
      code: 'Elaboration.InsufficientStock',
      description: 'No hay suficiente stock de un insumo para confirmar la elaboración.',
    });
  });

  it('WarehouseNotExists carries the Elaboration.WarehouseNotExists code', () => {
    expect(ElaborationErrors.WarehouseNotExists).toEqual({
      code: 'Elaboration.WarehouseNotExists',
      description: 'El almacén de la elaboración no existe.',
    });
  });

  it('all entries expose code and description', () => {
    for (const [key, error] of Object.entries(ElaborationErrors)) {
      expect(key.length).toBeGreaterThan(0);
      expect(error.code.startsWith('Elaboration.')).toBe(true);
      expect(error.description.length).toBeGreaterThan(0);
    }
  });

  it('elaborationInsufficientStockError names product, available and needed', () => {
    const error = elaborationInsufficientStockError('Harina', 1.5, 3);

    expect(error.code).toBe('Elaboration.InsufficientStock');
    expect(error.description).toContain('Harina');
    expect(error.description).toContain('1.5');
    expect(error.description).toContain('3');
  });
});
