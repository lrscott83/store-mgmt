import type { BaseError } from '../models/base';

/**
 * Errores del módulo de Almacenes. Portados del modelo de referencia
 * (`InvalidWarehouseError`, `NegativeStockError`) con la convención del repo:
 * descripción en español hardcodeada, `code` en inglés.
 */
export const WarehouseErrors = {
  InvalidName: {
    code: 'Warehouse.InvalidName',
    description: 'El nombre del almacén no puede estar vacío.',
  },
  NotExists: {
    code: 'Warehouse.NotExists',
    description: 'El almacén no existe.',
  },
  Inactive: {
    code: 'Warehouse.Inactive',
    description: 'El almacén no está activo.',
  },
  ProductNotExists: {
    code: 'Warehouse.ProductNotExists',
    description: 'El producto no existe.',
  },
  ProductNotActive: {
    code: 'Warehouse.ProductNotActive',
    description: 'El producto no está activo.',
  },
  QuantityInvalid: {
    code: 'Warehouse.QuantityInvalid',
    description: 'La cantidad debe ser mayor que cero.',
  },
  InsufficientStock: {
    code: 'Warehouse.InsufficientStock',
    description: 'No hay suficiente stock en el almacén.',
  },
  CannotDeactivate: {
    code: 'Warehouse.CannotDeactivate',
    description: 'No se puede desactivar un almacén con stock o movimientos.',
  },
  SameWarehouseTransfer: {
    code: 'Warehouse.SameWarehouseTransfer',
    description: 'No se puede transferir stock al mismo almacén.',
  },
} as const satisfies Record<string, BaseError>;