import type { AuditableBaseModel } from './base';
import type {
  Currency,
  ExpenseFundSource,
  ExpenseType,
  PaymentType,
  SalePaymentMethod,
} from '../enums';
import { DEFAULT_EXPENSE_FUND_SOURCE } from '../enums';

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
  /**
   * Origen del dinero (expense-fund-source, 2026-10-24). Ausente = `Externo`
   * (todo gasto histórico y todo import viejo): solo un gasto marcado `Caja`
   * descuenta el efectivo del POS. Se lee SIEMPRE por `expenseFundSourceOf`.
   */
  fundSource?: ExpenseFundSource;
}

/**
 * Origen resuelto de un gasto: el campo explícito o `Externo` cuando falta
 * (histórico, import sin el campo). Único punto de lectura para el cuadre del
 * día, el cuadre por fechas y el cierre de efectivo — así "ausente" no puede
 * significar cosas distintas en cada pantalla.
 */
export function expenseFundSourceOf(expense: Pick<Expense, 'fundSource'>): ExpenseFundSource {
  return expense.fundSource ?? DEFAULT_EXPENSE_FUND_SOURCE;
}
