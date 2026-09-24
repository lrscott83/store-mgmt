import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';
import {
  Currency,
  DEFAULT_CURRENCY,
  DEFAULT_SALE_PAYMENT_METHOD,
  PaymentType,
  SalePaymentMethod,
  legacyPaymentTypeToSalePaymentMethod,
  salePaymentMethodToLegacyPaymentType,
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

/**
 * T9 (payment-channels-and-multipayment) — normalización de PRESENTACIÓN de una
 * orden ya REGISTRADA. Efectivo se mantiene; Transferencia y Zelle se presentan
 * como Transferencia (CUP): el histórico no distinguía la moneda del canal y el
 * usuario pidió colapsarlas (D2). NO reescribe datos persistidos ni toca
 * `salePaymentMethodLabel`; es resolución de lectura para historial, órdenes de
 * hoy, filtros y modal de edición. Gastos y carrito NO pasan por aquí.
 */
export function normalizedOrderPaymentMethod(
  order: Pick<Order, 'salePaymentMethod' | 'paymentType' | 'currency'>,
): SalePaymentMethod {
  const method = resolvedOrderPaymentMethod(order);
  return method === SalePaymentMethod.Zelle ? SalePaymentMethod.Transferencia : method;
}

export function resolvedExpensePaymentMethod(
  expense: Pick<Expense, 'paymentType' | 'salePaymentMethod' | 'currency'>,
): SalePaymentMethod {
  if (expense.salePaymentMethod !== undefined && expense.salePaymentMethod !== null) {
    return expense.salePaymentMethod;
  }
  if (expense.paymentType === undefined || expense.paymentType === null) {
    return DEFAULT_SALE_PAYMENT_METHOD;
  }
  return legacyPaymentTypeToSalePaymentMethod(
    expense.paymentType,
    expense.currency ?? DEFAULT_CURRENCY,
  ).method;
}

/**
 * payment-methods-percent-tax (plan 2026-09-17): el pago resuelto de una
 * entidad con su TIPO LEGACY espejo (para no perder lecturas viejas):
 * Transferencia → Tarjeta (compat Efectivo en moneda no CUP), Zelle → Zelle,
 * Efectivo → Efectivo. Espejo exacto de `salePaymentMethodToLegacyPaymentType`.
 */
export function legacyPaymentTypeForResolvedMethod(
  method: SalePaymentMethod,
  currency: Currency | number = Currency.CUP,
): PaymentType {
  if (method === SalePaymentMethod.Transferencia && Number(currency) !== Number(Currency.CUP)) {
    return PaymentType.Efectivo;
  }
  return salePaymentMethodToLegacyPaymentType(method);
}

export function resolvedCreditPaidMethod(credit: Pick<SaleCredit, 'paidType'>): SalePaymentMethod {
  if (credit.paidType === undefined || credit.paidType === null) {
    return DEFAULT_SALE_PAYMENT_METHOD;
  }
  return legacyPaymentTypeToSalePaymentMethod(credit.paidType).method;
}
