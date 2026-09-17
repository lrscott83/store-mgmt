import type { AuditableBaseModel } from './base';
import type { Currency, PaymentType } from '../enums';

export interface SaleCredit extends AuditableBaseModel {
  id: string;
  orderId: string;
  client: string;
  total: number;
  date: Date;
  paid: number;
  isPaid: boolean;
  paidDate: Date;
  paidType: PaymentType;
  note: string;
  /** Moneda de `total`/`paid` (plan 2026-09-16). Ausente = CUP (DEFAULT_CURRENCY). */
  currency?: Currency;
}
