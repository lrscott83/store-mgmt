import { describe, it, expect } from 'vitest';
import { getPaymentReturn, getPaymentReturnKind } from './payment-return';

// 1:1 port of Angular's NavRightComponent.getPaymentReturn()/getPaymentReturnClass():
// getPaymentReturn = payment ? payment - total : 0; class = positive/negative/neutral.
describe('getPaymentReturn', () => {
  it('returns 0 when payment is falsy (undefined)', () => {
    expect(getPaymentReturn(undefined, 50)).toBe(0);
  });

  it('returns payment - total when payment is truthy', () => {
    expect(getPaymentReturn(60, 50)).toBe(10);
  });

  it('returns a negative value when payment is less than total', () => {
    expect(getPaymentReturn(30, 50)).toBe(-20);
  });
});

describe('getPaymentReturnKind', () => {
  it('returns "positive" when the return is greater than 0', () => {
    expect(getPaymentReturnKind(10)).toBe('positive');
  });

  it('returns "negative" when the return is less than 0', () => {
    expect(getPaymentReturnKind(-5)).toBe('negative');
  });

  it('returns "neutral" when the return is exactly 0', () => {
    expect(getPaymentReturnKind(0)).toBe('neutral');
  });
});
