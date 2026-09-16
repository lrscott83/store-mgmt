import type { AuditableBaseModel } from './base';
import type { Currency } from '../enums';

export interface InventoryEntryCost {
  inventoryId: string;
  quantity: number;
  costPrice: number;
  /** Moneda de `costPrice` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
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
  /** Moneda de `costPrice` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
}

export interface InventoryEntryView {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  date: Date;
  isActive: boolean;
  /** Moneda de `costPrice` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
}
