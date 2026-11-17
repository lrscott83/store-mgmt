import { describe, expect, it } from 'vitest';
import { formatCurrency, formatMoneyWithCurrency } from '../format-currency';

// The thousands separator is U+00A0 (NO-BREAK SPACE). Written as the escape so the byte
// difference against a regular space stays visible in review — a breakable space would let
// a single amount wrap across two lines.
const NBSP = '\u00A0';

/**
 * Direct contract tests for BOTH exported formatters of `format-currency.ts`.
 *
 * `formatCurrency` is the app-wide money shape (`$` prefix); `formatMoneyWithCurrency` is the
 * explicit-suffix shape used where a bare `$` would lie (the payment history renders USD and CUP
 * side by side). Both share the private `groupAmount`, so the grouping rows below pin the shared
 * behaviour and the symbol rows pin what differs.
 */
describe('formatCurrency — app-wide `$` money shape', () => {
  it.each([
    // amount, expected
    [0, '$0'],
    [999, '$999'],
    // Grouping boundary: the first value that earns a separator.
    [1000, `$1${NBSP}000`],
    [999999, `$999${NBSP}999`],
    [1000000, `$1${NBSP}000${NBSP}000`],
    // Non-zero decimals keep exactly two digits, grouped integer part.
    [23456.7, `$23${NBSP}456.70`],
    [1234567.89, `$1${NBSP}234${NBSP}567.89`],
    // Negative sign goes before the `$`.
    [-5, '-$5'],
    [-1234.5, `-$1${NBSP}234.50`],
  ])('formatCurrency(%s) === %s', (amount, expected) => {
    expect(formatCurrency(amount)).toBe(expected);
  });

  it('always emits the `$` prefix', () => {
    for (const amount of [0, 1, 1000, -1234.5, 999999.99]) {
      expect(formatCurrency(amount).startsWith('$') || formatCurrency(amount).startsWith('-$')).toBe(
        true,
      );
    }
  });

  it('marks thousands with U+00A0, never a regular space', () => {
    const out = formatCurrency(12345678);
    expect(out).toBe(`$12${NBSP}345${NBSP}678`);
    expect(out).not.toContain(' ');
    expect(out.split(NBSP)).toEqual(['$12', '345', '678']);
  });
});

describe('formatMoneyWithCurrency — explicit currency suffix, never a `$`', () => {
  it.each([
    // amount, currency, expected
    [0, 'USD', '0 USD'],
    [25, 'USD', '25 USD'],
    [999, 'CUP', '999 CUP'],
    // Grouping boundary, same rule as formatCurrency.
    [1000, 'CUP', `1${NBSP}000 CUP`],
    [1000000, 'CUP', `1${NBSP}000${NBSP}000 CUP`],
    // Non-zero decimals keep exactly two digits.
    [23456.7, 'USD', `23${NBSP}456.70 USD`],
    [12500, 'CUP', `12${NBSP}500 CUP`],
    // Negative sign leads the amount, the currency still trails it.
    [-1234.5, 'CUP', `-1${NBSP}234.50 CUP`],
  ] as const)('formatMoneyWithCurrency(%s, %s) === %s', (amount, currency, expected) => {
    expect(formatMoneyWithCurrency(amount, currency)).toBe(expected);
  });

  it('never emits the app-wide `$` for either currency', () => {
    for (const amount of [0, 25, 12500, -1234.5, 23456.7]) {
      expect(formatMoneyWithCurrency(amount, 'USD')).not.toContain('$');
      expect(formatMoneyWithCurrency(amount, 'CUP')).not.toContain('$');
    }
  });

  it('suffixes the currency code and keeps the U+00A0 thousands grouping raw', () => {
    expect(formatMoneyWithCurrency(12345678, 'CUP')).toBe(
      `12${NBSP}345${NBSP}678 CUP`,
    );
    expect(formatMoneyWithCurrency(12345678, 'USD')).toBe(
      `12${NBSP}345${NBSP}678 USD`,
    );
    // The announced currency decides the suffix: the two formatters never converge.
    expect(formatCurrency(1000)).not.toBe(formatMoneyWithCurrency(1000, 'USD'));
  });
});
