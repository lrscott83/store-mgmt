import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format-currency';

describe('formatCurrency — en-US USD, thousands separator, 2 decimals (Angular currency-pipe parity)', () => {
  it('formats a whole number with thousands separator and 2 decimals', () => {
    expect(formatCurrency(2000)).toBe('$2,000.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats a negative amount', () => {
    expect(formatCurrency(-5)).toBe('-$5.00');
  });

  it('formats a decimal amount rounded to 2 places', () => {
    expect(formatCurrency(15.5)).toBe('$15.50');
  });
});
