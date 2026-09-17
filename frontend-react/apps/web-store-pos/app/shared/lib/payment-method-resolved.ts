import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';
import {
  DEFAULT_CURRENCY,
  DEFAULT_SALE_PAYMENT_METHOD,
  SalePaymentMethod,
  legacyPaymentTypeToSalePaymentMethod,
} from '@store-mgmt/domain';

/**
 * payment-methods-percent-tax (plan 2026-09-17) — método de pago RESUELTO de una
 * entidad para lecturas/agregaciones:
 *
 * - Ordenes nuevas traen `salePaymentMethod` (autoritativo).
 * - Datos históricos solo traen el legacy `paymentType`/`paidType`: el adaptador
 *   los traduce (Tarjeta → Transferencia-CUP, Zelle → Zelle, ausente → Efectivo),
 *   de modo que Tarjeta histórico se muestra y agrupa como Transferencia.
 */
export function resolvedOrderPaymentMethod(
  order: Pick<Order, 'salePaymentMethod' | 'paymentType' | 'currency'>,
): SalePaymentMethod {
  if (order.salePaymentMethod !== undefined && order.salePaymentMethod !== null) {
    return order.salePaymentMethod;
  }
  return legacyPaymentTypeToSalePaymentMethod(order.paymentType, order.currency ?? DEFAULT_CURRENCY)
    .method;
}

export function resolvedExpensePaymentMethod(expense: Pick<Expense, 'paymentType'>): SalePaymentMethod {
  if (expense.paymentType === undefined || expense.paymentType === null) {
    return DEFAULT_SALE_PAYMENT_METHOD;
  }
  return legacyPaymentTypeToSalePaymentMethod(expense.paymentType).method;
}

export function resolvedCreditPaidMethod(credit: Pick<SaleCredit, 'paidType'>): SalePaymentMethod {
  if (credit.paidType === undefined || credit.paidType === null) {
    return DEFAULT_SALE_PAYMENT_METHOD;
  }
  return legacyPaymentTypeToSalePaymentMethod(credit.paidType).method;
}
