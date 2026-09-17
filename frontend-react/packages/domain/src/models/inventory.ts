import type { AuditableBaseModel } from './base';

export interface InventoryEntryCost {
  inventoryId: string;
  quantity: number;
  costPrice: number;
}

export interface InventoryEntry extends AuditableBaseModel {
  id: string;
  productId: string;
  categoryId: string;
  quantity: number;
  available: number;
  costPrice: number;
  date: Date;
  order: number;
  /**
   * Salida de almacén que originó esta entrada (plan 2026-09-16, A8).
   * Opcional y solo presente en entradas creadas por `sale_out` — esas
   * entradas NO se pueden editar por CRUD (la salida sí se edita en almacén).
   */
  warehouseSaleOutMovementId?: string;
}

export interface InventoryEntryView {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  date: Date;
  isActive: boolean;
}
