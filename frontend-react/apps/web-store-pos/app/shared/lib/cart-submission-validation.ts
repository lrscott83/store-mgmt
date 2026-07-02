export type CartSubmissionError =
  | 'EMPTY_CART'
  | 'PAYMENT_LESS_THAN_TOTAL'
  | 'CREDIT_WITHOUT_CLIENT';

export interface CartSubmissionInput {
  itemCount: number;
  payment: number | undefined;
  total: number;
  isCredit: boolean;
  client: string;
}

/**
 * 1:1 port of Angular's `NavRightComponent.createOrder()` validation sequence
 * (nav-right.component.ts), preserving check ORDER: empty cart first, then
 * payment-vs-total (only when `payment` is truthy, matching Angular's
 * `if (this.payment && this.payment < total)`), then credit-without-client.
 * Returns the first failing check as a discriminant key, or `null` when valid.
 */
export function validateCartSubmission(input: CartSubmissionInput): CartSubmissionError | null {
  const { itemCount, payment, total, isCredit, client } = input;

  if (itemCount === 0) {
    return 'EMPTY_CART';
  }

  if (payment && payment < total) {
    return 'PAYMENT_LESS_THAN_TOTAL';
  }

  if (isCredit && !client) {
    return 'CREDIT_WITHOUT_CLIENT';
  }

  return null;
}
