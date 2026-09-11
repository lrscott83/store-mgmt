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
  // ─── Plan 2026-09-09: reversa de movimientos (D1-D12) ─────────────────────
  MovementNotFound: {
    code: 'Warehouse.MovementNotFound',
    description: 'El movimiento no existe.',
  },
  ReversalNotReversible: {
    code: 'Warehouse.ReversalNotReversible',
    description: 'No se puede revertir un movimiento de reversa.',
  },
  ReversalAlreadyExists: {
    code: 'Warehouse.ReversalAlreadyExists',
    description: 'El movimiento ya tiene una reversa.',
  },
  TransferInNotReversible: {
    code: 'Warehouse.TransferInNotReversible',
    description: 'Los movimientos de entrada por transferencia no se pueden revertir.',
  },
  SaleOutAlreadyConsumed: {
    code: 'Warehouse.SaleOutAlreadyConsumed',
    description:
      'La salida ya fue consumida por ventas — no se puede revertir la entrada de tienda.',
  },
  SaleOutEntryNotFound: {
    code: 'Warehouse.SaleOutEntryNotFound',
    description: 'No se encontró la entrada de tienda asociada a la salida.',
  },
  SaleOutAmbiguousEntry: {
    code: 'Warehouse.SaleOutAmbiguousEntry',
    description:
      'Hay varias entradas de tienda que coinciden con la salida — no se puede revertir automáticamente.',
  },
  PurchaseLotConsumed: {
    code: 'Warehouse.PurchaseLotConsumed',
    description:
      'El lote de la compra ya fue consumido — no quedan unidades que revertir.',
  },
  WarehouseNotActive: {
    code: 'Warehouse.WarehouseNotActive',
    description: 'El almacén involucrado no está activo.',
  },
} as const satisfies Record<string, BaseError>;
