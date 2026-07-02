export type PaymentReturnKind = 'positive' | 'negative' | 'neutral';

/**
 * 1:1 port of Angular's `NavRightComponent.getPaymentReturn()`:
 * `this.payment ? this.payment - total : 0`.
 */
export function getPaymentReturn(payment: number | undefined, total: number): number {
  return payment ? payment - total : 0;
}

/**
 * 1:1 port of Angular's `NavRightComponent.getPaymentReturnClass()`:
 * `payment-return-positive` when > 0, `payment-return-negative` when < 0, neutral (no
 * class, empty string in Angular) otherwise.
 */
export function getPaymentReturnKind(paymentReturn: number): PaymentReturnKind {
  if (paymentReturn > 0) return 'positive';
  if (paymentReturn < 0) return 'negative';
  return 'neutral';
}
