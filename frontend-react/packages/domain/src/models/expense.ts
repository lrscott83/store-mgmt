import type { AuditableBaseModel } from './base';
import type { Currency, ExpenseType, PaymentType, SalePaymentMethod } from '../enums';

export interface Expense extends AuditableBaseModel {
  id: string;
  type: ExpenseType;
  total: number;
  date: Date;
  paymentType: PaymentType;
  /**
   * Forma de pago autoritativa (2026-09-21) — presente en gastos nuevos;
   * resolve con el legacy `paymentType` cuando falta (compat: gastos
   * históricos solo traen `paymentType`).
   */
  salePaymentMethod?: SalePaymentMethod;
  note: string;
  /** Moneda de `total` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
}
