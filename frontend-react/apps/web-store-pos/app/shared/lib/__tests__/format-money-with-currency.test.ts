import { describe, expect, it } from 'vitest';
import { formatMoneyWithCurrency } from '../format-money-with-currency';
import { Currency } from '@store-mgmt/domain';

describe('formatMoneyWithCurrency', () => {
  it('formats integers with NBSP grouping and the CUP suffix', () => {
    expect(formatMoneyWithCurrency(2000, Currency.CUP)).toBe('2\u00A0000\u00A0CUP');
  });

  it('formats large amounts', () => {
    expect(formatMoneyWithCurrency(12345678, Currency.CUP)).toBe('12\u00A0345\u00A0678\u00A0CUP');
  });

  it('keeps two decimals for cents', () => {
    expect(formatMoneyWithCurrency(7.5, Currency.USD)).toBe('7.50\u00A0USD');
  });

  it('suffixes each currency code', () => {
    expect(formatMoneyWithCurrency(10, Currency.USD)).toBe('10\u00A0USD');
    expect(formatMoneyWithCurrency(10, Currency.EUR)).toBe('10\u00A0EUR');
    expect(formatMoneyWithCurrency(10, Currency.CLA)).toBe('10\u00A0CLA');
    expect(formatMoneyWithCurrency(10, Currency.MLC)).toBe('10\u00A0MLC');
    expect(formatMoneyWithCurrency(10, Currency.CAD)).toBe('10\u00A0CAD');
    expect(formatMoneyWithCurrency(10, Currency.MXN)).toBe('10\u00A0MXN');
  });

  it('absent currency falls back to CUP', () => {
    expect(formatMoneyWithCurrency(5)).toBe('5\u00A0CUP');
  });

  it('never emits the $ sign', () => {
    expect(formatMoneyWithCurrency(42, Currency.EUR)).not.toContain('$');
  });

  it('handles negatives and zero', () => {
    expect(formatMoneyWithCurrency(-3, Currency.USD)).toBe('-3\u00A0USD');
    expect(formatMoneyWithCurrency(0, Currency.CUP)).toBe('0\u00A0CUP');
  });

  it('amount never splits across lines (single unbreakable unit)', () => {
    const s = formatMoneyWithCurrency(16840, Currency.CUP);
    expect(s).not.toMatch(/\u00A0 (?=[\dC])/); // no breakable space inside
    expect(s.split(' ').filter((p) => /^[\d-]/.test(p) && p !== s).length).toBe(0);
  });
});
