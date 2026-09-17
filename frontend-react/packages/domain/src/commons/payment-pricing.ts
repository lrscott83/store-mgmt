import { Currency, SalePaymentMethod } from '../enums';

/**
 * payment-methods-percent-tax (plan 2026-09-17) — pricing por
 * (moneda, forma de pago) y catálogo de formas de pago por moneda.
 *
 * Todos los valores parten en { percent: 0, tax: 0 } → el total calculado con
 * defaults es IDÉNTICO a la suma simple de las líneas (no-regresión). La
 * edición de estos valores será otra tarea: la constante ya está modelada
 * como tabla para que el editor solo tenga que escribir aquí.
 */

export interface PaymentPricing {
  /** Porcentaje aplicado sobre el total base (0–100+, puede ser decimal). */
  percent: number;
  /** Monto fijo sumado al total, en la moneda de la venta. */
  tax: number;
}

/** Clave `${currency}|${method}`. Incluye la moneda: Transferencia (CUP) y (USD) tendrán pricing independiente. */
export type PaymentPricingKey = string;

const DEFAULTS: PaymentPricing = { percent: 0, tax: 0 };

/**
 * Tabla de pricing por (moneda, forma de pago). Claves presentes sobrescriben
 * el default; la función de acceso SIEMPRE devuelve un valor (default 0/0),
 * así que ninguna combinación nueva puede romper el cálculo.
 */
export const DEFAULT_PAYMENT_PRICING: Record<PaymentPricingKey, PaymentPricing> = {
  // Todas las combinaciones arrancan en 0/0 — el total no cambia con defaults.
};

export function paymentPricingFor(
  currency: Currency | number,
  method: SalePaymentMethod,
): PaymentPricing {
  return DEFAULT_PAYMENT_PRICING[`${Number(currency)}|${method}`] ?? DEFAULTS;
}

/** Fórmula acordada: base + base·percent/100 + tax, redondeada a 2 decimales. Ej: 100, 1%, 10 → 111. */
export function applyPaymentPricing(baseTotal: number, pricing: PaymentPricing): number {
  const raw = baseTotal + (baseTotal * pricing.percent) / 100 + pricing.tax;
  return Math.round(raw * 100) / 100;
}

/**
 * Catálogo de formas de pago mostradas en el carrito, por moneda de la venta:
 *
 *   CUP → Efectivo · Transferencia (CUP)
 *   USD → Efectivo · Zelle · Transferencia (USD)
 *   EUR/CAD/MXN → Efectivo
 *   MLC/CLA → Transferencia (moneda)
 *
 * Efectivo es siempre en la MISMA moneda de la venta (no hay cambio de
 * efectivo en esta iteración).
 */
export function paymentMethodOptionsForCurrency(
  currency: Currency | number,
): SalePaymentMethod[] {
  switch (Number(currency)) {
    case Currency.CUP:
      return [SalePaymentMethod.Efectivo, SalePaymentMethod.Transferencia];
    case Currency.USD:
      return [
        SalePaymentMethod.Efectivo,
        SalePaymentMethod.Zelle,
        SalePaymentMethod.Transferencia,
      ];
    case Currency.MLC:
    case Currency.CLA:
      return [SalePaymentMethod.Transferencia];
    case Currency.EUR:
    case Currency.CAD:
    case Currency.MXN:
    default:
      return [SalePaymentMethod.Efectivo];
  }
}

/** Primer método del catálogo de la moneda (para re-pin al cambiar de moneda). */
export function defaultPaymentMethodForCurrency(currency: Currency | number): SalePaymentMethod {
  const options = paymentMethodOptionsForCurrency(currency);
  return options[0] ?? SalePaymentMethod.Efectivo;
}

/**
 * Los pagos NO en efectivo no participan del vuelto: "con cuánto paga" aplica
 * solo cuando el cliente entrega efectivo (en la misma moneda de la venta).
 */
export function isCashMethod(method: SalePaymentMethod): boolean {
  return method === SalePaymentMethod.Efectivo;
}
