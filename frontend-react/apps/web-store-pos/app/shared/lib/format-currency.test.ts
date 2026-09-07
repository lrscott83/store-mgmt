import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format-currency';

// The thousands separator is U+00A0 (NO-BREAK SPACE). These tests write it
// as '\u00A0' escapes so the byte difference vs a regular space is visible
// and no editor/PR view can silently collapse it.
const NBSP = '\u00A0';

describe('formatCurrency — NBSP-separated thousands, dot decimals, .00 dropped (space-saving format)', () => {
  it('groups integer digits with a non-breaking space every three digits', () => {
    expect(formatCurrency(12345678)).toBe(`$12${NBSP}345${NBSP}678`);
  });

  it('drops .00 when the rounded cents are zero', () => {
    expect(formatCurrency(2000)).toBe(`$2${NBSP}000`);
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(150)).toBe('$150');
  });

  it('keeps two decimals when cents are non-zero', () => {
    expect(formatCurrency(23456.7)).toBe(`$23${NBSP}456.70`);
    expect(formatCurrency(15.5)).toBe('$15.50');
  });

  it('groups the integer part of a decimal amount too', () => {
    expect(formatCurrency(1234567.89)).toBe(`$1${NBSP}234${NBSP}567.89`);
  });

  it('formats a negative amount with the sign before the $', () => {
    expect(formatCurrency(-5)).toBe('-$5');
    expect(formatCurrency(-1234.5)).toBe(`-$1${NBSP}234.50`);
  });
});

describe('formatCurrency — a formatted amount never wraps across lines (no-break invariant)', () => {
  it('contains NO regular spaces anywhere in the output', () => {
    const amounts = [0, 150, 2000, 23456.7, 1234567.89, -1234.5, 99999999999];
    for (const amount of amounts) {
      expect(formatCurrency(amount)).not.toContain(' ');
    }
  });

  it('uses U+00A0 (NO-BREAK SPACE) as the thousands separator', () => {
    const out = formatCurrency(12345678);
    expect(out).toContain(NBSP);
    // Byte-level check: exactly 2 NBSPs, and they sit where a regular space
    // used to be — the string is otherwise unchanged.
    expect(out.split(NBSP)).toEqual(['$12', '345', '678']);
  });

  it('renders the same visible shape as before (NBSP displays as a space)', () => {
    // Unicode NFKC-equivalence sanity: a NBSP is not normalized to a space
    // by toLocaleLowerCase/trim, but it IS whitespace for trimming. The
    // important property for rendering is that CSS treats NBSP as
    // non-collapsible and non-breakable, which is a browser behavior this
    // unit layer cannot assert — covered by the no-regular-space invariant
    // above plus the component-level whitespace-nowrap classes.
    expect(formatCurrency(2000).trim()).toBe(`$2${NBSP}000`);
  });
});
