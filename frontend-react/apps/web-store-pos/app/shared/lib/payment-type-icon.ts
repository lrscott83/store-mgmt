import { PaymentType } from '@store-mgmt/domain';

export type PaymentTypeIconKind = 'cash' | 'card' | 'phone' | 'dollar';

/**
 * 1:1 semantic port of Angular's `PaymentTypeUtils.getPaymentTypeIcon`
 * (domain/commons/payment-type.ts): Efectivo -> bi-cash-stack, Tarjeta -> bi-credit-card,
 * Zelle -> bi-phone, default -> bi-currency-dollar. React has no bootstrap-icons
 * dependency, so this returns a discriminant key the component maps to an inline SVG.
 */
export function getPaymentTypeIconKind(paymentType: PaymentType): PaymentTypeIconKind {
  switch (paymentType) {
    case PaymentType.Efectivo:
      return 'cash';
    case PaymentType.Tarjeta:
      return 'card';
    case PaymentType.Zelle:
      return 'phone';
    default:
      return 'dollar';
  }
}
