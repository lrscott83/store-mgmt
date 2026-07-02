import { describe, it, expect } from 'vitest';
import { validateCartSubmission } from './cart-submission-validation';

// 1:1 port of Angular's NavRightComponent.createOrder() validation order:
// (1) empty cart, (2) payment < total, (3) credit sale without client.
describe('validateCartSubmission', () => {
  it('returns EMPTY_CART when itemCount is 0', () => {
    expect(
      validateCartSubmission({ itemCount: 0, payment: undefined, total: 0, isCredit: false, client: '' }),
    ).toBe('EMPTY_CART');
  });

  it('returns PAYMENT_LESS_THAN_TOTAL when payment is provided and less than total', () => {
    expect(
      validateCartSubmission({ itemCount: 2, payment: 5, total: 10, isCredit: false, client: '' }),
    ).toBe('PAYMENT_LESS_THAN_TOTAL');
  });

  it('returns CREDIT_WITHOUT_CLIENT when isCredit is true and client is empty', () => {
    expect(
      validateCartSubmission({ itemCount: 1, payment: undefined, total: 10, isCredit: true, client: '' }),
    ).toBe('CREDIT_WITHOUT_CLIENT');
  });

  it('returns null when cart has items, payment is sufficient (or absent), and credit has a client', () => {
    expect(
      validateCartSubmission({ itemCount: 1, payment: 10, total: 10, isCredit: true, client: 'Juan' }),
    ).toBeNull();
  });

  it('returns null when payment is falsy (0/undefined) — Angular only blocks when payment is truthy AND less than total', () => {
    expect(
      validateCartSubmission({ itemCount: 1, payment: 0, total: 10, isCredit: false, client: '' }),
    ).toBeNull();
  });
});
