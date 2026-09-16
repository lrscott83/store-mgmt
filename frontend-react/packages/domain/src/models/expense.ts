import type { AuditableBaseModel } from './base';
import type { Currency, ExpenseType, PaymentType } from '../enums';

export interface Expense extends AuditableBaseModel {
  id: string;
  type: ExpenseType;
  total: number;
  date: Date;
  paymentType: PaymentType;
  note: string;
  /** Moneda de `total` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
}
