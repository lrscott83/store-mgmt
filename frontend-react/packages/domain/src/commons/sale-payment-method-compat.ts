import { Currency, PaymentType, SalePaymentMethod } from '../enums';

/**
 * payment-methods-percent-tax (plan 2026-09-17) — adaptadores de compatibilidad
 * con el enum PaymentType { Efectivo=1, Tarjeta=2, Zelle=3 }.
 *
 * El enum legacy NO se borra (datos históricos en localStorage y backend), pero
 * la UI deja de ofrecerlo. Toda LECTURA de datos pasa por aquí:
 *
 *   Efectivo → Efectivo
 *   Tarjeta  → Transferencia  (la venta era CUP: "Transferencia (CUP)")
 *   Zelle    → Zelle
 *   ausente  → Efectivo (default histórico)
 */
export function legacyPaymentTypeToSalePaymentMethod(
  paymentType: PaymentType | undefined | null,
  currency: Currency | number = Currency.CUP,
): { method: SalePaymentMethod; currency: Currency } {
  switch (paymentType) {
    case PaymentType.Zelle:
      return { method: SalePaymentMethod.Zelle, currency: currency as Currency };
    case PaymentType.Tarjeta:
      // Histórico: toda venta con Tarjeta fue en CUP → Transferencia (CUP).
      return { method: SalePaymentMethod.Transferencia, currency: Currency.CUP };
    case PaymentType.Efectivo:
      return { method: SalePaymentMethod.Efectivo, currency: currency as Currency };
    default:
      return { method: SalePaymentMethod.Efectivo, currency: currency as Currency };
  }
}

/**
 * Mapeo inverso, solo para escribir el campo legacy `paymentType` al persistir
 * una orden nueva (compatibilidad con lectores viejos). Transferencia se
 * escribe como Tarjeta cuando la moneda es CUP (su reemplazo natural); en
 * otras monedas no hay equivalente legacy y se cae a Efectivo — el método real
 * vive en `salePaymentMethod`.
 */
export function salePaymentMethodToLegacyPaymentType(
  method: SalePaymentMethod,
  currency: Currency | number = Currency.CUP,
): PaymentType {
  switch (method) {
    case SalePaymentMethod.Zelle:
      return PaymentType.Zelle;
    case SalePaymentMethod.Transferencia:
      return Number(currency) === Number(Currency.CUP) ? PaymentType.Tarjeta : PaymentType.Efectivo;
    default:
      return PaymentType.Efectivo;
  }
}

/** Etiqueta visible del método con su moneda: "Transferencia (CUP)", "Efectivo"… */
export function salePaymentMethodLabel(
  method: SalePaymentMethod,
  currency: Currency | number,
): string {
  switch (method) {
    case SalePaymentMethod.Zelle:
      return 'Zelle';
    case SalePaymentMethod.Transferencia:
      return `Transferencia (${currencyLabelEs(currency)})`;
    default:
      return 'Efectivo';
  }
}

function currencyLabelEs(currency: Currency | number): string {
  switch (Number(currency)) {
    case Currency.USD:
      return 'USD';
    case Currency.EUR:
      return 'EUR';
    case Currency.CLA:
      return 'CLA';
    case Currency.MLC:
      return 'MLC';
    case Currency.CAD:
      return 'CAD';
    case Currency.MXN:
      return 'MXN';
    default:
      return 'CUP';
  }
}
