import { describe, it, expect } from 'vitest';
import { toDigits, formatCellPhone } from '../cell-phone-mask';

describe('toDigits — strips non-digit characters and caps at 8 (Req: Cell-Phone Mask and Field Copy Match Angular)', () => {
  it('strips spaces and dashes from an already-masked value down to raw digits', () => {
    expect(toDigits('5 123-4567')).toBe('51234567');
  });

  it('caps the result at 8 digits even when more digits are typed', () => {
    expect(toDigits('512345678999')).toBe('51234567');
  });

  it('returns an empty string when no digits are present', () => {
    expect(toDigits('+ -')).toBe('');
  });
});

describe('formatCellPhone — renders the +53 X XXX-XXXX mask (Req: Cell-Phone Mask and Field Copy Match Angular)', () => {
  it('formats a full 8-digit number as +53 X XXX-XXXX', () => {
    expect(formatCellPhone('51234567')).toBe('+53 5 123-4567');
  });

  it('progressively formats a partial 3-digit number as +53 X XX', () => {
    expect(formatCellPhone('512')).toBe('+53 5 12');
  });

  it('returns an empty string for empty input', () => {
    expect(formatCellPhone('')).toBe('');
  });
});
