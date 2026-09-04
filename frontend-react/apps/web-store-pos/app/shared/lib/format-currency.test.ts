import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format-currency';

describe('formatCurrency — space-separated thousands, dot decimals, .00 dropped (space-saving format)', () => {
  it('groups integer digits with a space every three digits', () => {
    expect(formatCurrency(12345678)).toBe('$12 345 678');
  });

  it('drops .00 when the rounded cents are zero', () => {
    expect(formatCurrency(2000)).toBe('$2 000');
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(150)).toBe('$150');
  });

  it('keeps two decimals when cents are non-zero', () => {
    expect(formatCurrency(23456.7)).toBe('$23 456.70');
    expect(formatCurrency(15.5)).toBe('$15.50');
  });

  it('groups the integer part of a decimal amount too', () => {
    expect(formatCurrency(1234567.89)).toBe('$1 234 567.89');
  });

  it('formats a negative amount with the sign before the $', () => {
    expect(formatCurrency(-5)).toBe('-$5');
    expect(formatCurrency(-1234.5)).toBe('-$1 234.50');
  });
});
