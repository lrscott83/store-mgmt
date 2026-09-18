import { describe, expect, it } from 'vitest';
import { applyPayment, summarizePayments } from '../payment-tally';

describe('applyPayment', () => {
  it('applies the whole incoming amount when it fits under the remaining', () => {
    expect(applyPayment(1000, 600)).toEqual({ appliedAmount: 600, changeAmount: 0 });
  });

  it('returns the overflow as change when it exceeds the remaining', () => {
    expect(applyPayment(300, 500)).toEqual({ appliedAmount: 300, changeAmount: 200 });
  });

  it('rejects non-positive incoming amounts', () => {
    expect(() => applyPayment(100, 0)).toThrow();
    expect(() => applyPayment(100, -5)).toThrow();
  });
});

describe('summarizePayments', () => {
  it('single payment exactly covering the total', () => {
    const tally = summarizePayments(1000, [{ amountInOrderCurrency: 1000 }]);
    expect(tally).toEqual({ paid: 1000, remaining: 0, change: 0 });
  });

  it('multiple payments exactly covering the total', () => {
    const tally = summarizePayments(1000, [
      { amountInOrderCurrency: 600 },
      { amountInOrderCurrency: 400 },
    ]);
    expect(tally).toEqual({ paid: 1000, remaining: 0, change: 0 });
  });

  it('overpayment accumulates as change and never closes below the total', () => {
    const tally = summarizePayments(1000, [
      { amountInOrderCurrency: 900 },
      { amountInOrderCurrency: 300 },
    ]);
    expect(tally).toEqual({ paid: 1000, remaining: 0, change: 200 });
  });

  it('exposes the remaining amount when payments do not cover the total', () => {
    const tally = summarizePayments(1000, [{ amountInOrderCurrency: 250 }]);
    expect(tally).toEqual({ paid: 250, remaining: 750, change: 0 });
  });
});
