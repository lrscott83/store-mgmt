import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startOfDay, addDays, formatDateOnly } from './date-utils';

describe('startOfDay', () => {
  it('S-DATE-1: zeroes time to midnight keeping same calendar date', () => {
    const d = new Date('2024-03-15T14:30:45.123Z');
    const result = startOfDay(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('S-DATE-2: does not mutate the input date', () => {
    const d = new Date('2024-06-01T10:00:00.000Z');
    const before = d.getTime();
    startOfDay(d);
    expect(d.getTime()).toBe(before);
  });
});

describe('addDays', () => {
  it('S-DATE-3: adds positive days', () => {
    const d = new Date('2024-01-10T00:00:00.000');
    const result = addDays(d, 5);
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(0); // January
  });

  it('S-DATE-4: subtracts days when negative delta', () => {
    const d = new Date('2024-01-10T00:00:00.000');
    const result = addDays(d, -3);
    expect(result.getDate()).toBe(7);
  });

  it('S-DATE-5: zero delta returns same day', () => {
    const d = new Date('2024-01-10T00:00:00.000');
    const result = addDays(d, 0);
    expect(result.getDate()).toBe(10);
  });

  it('does not mutate the input date', () => {
    const d = new Date('2024-01-10T00:00:00.000');
    const before = d.getTime();
    addDays(d, 7);
    expect(d.getTime()).toBe(before);
  });

  it('handles month boundary correctly', () => {
    const d = new Date('2024-01-31T00:00:00.000');
    const result = addDays(d, 1);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(1); // February
  });
});

describe('formatDateOnly', () => {
  it('S-DATE-6: formats a date-only string as dd/mm/yyyy', () => {
    expect(formatDateOnly('2026-03-10')).toBe('10/03/2026');
  });

  it('S-DATE-7: preserves zero-padded single-digit day and month', () => {
    expect(formatDateOnly('2026-01-05')).toBe('05/01/2026');
  });

  it('S-DATE-8: returns empty string for null', () => {
    expect(formatDateOnly(null)).toBe('');
  });

  it('S-DATE-9: returns empty string for undefined', () => {
    expect(formatDateOnly(undefined)).toBe('');
  });

  it('S-DATE-10: returns empty string for empty string', () => {
    expect(formatDateOnly('')).toBe('');
  });

  it('S-DATE-11: returns malformed input unchanged instead of guessing or throwing', () => {
    expect(formatDateOnly('not-a-date')).toBe('not-a-date');
    expect(formatDateOnly('2026-3-10')).toBe('2026-3-10');
  });

  describe('timezone independence', () => {
    const ORIGINAL_TZ = process.env.TZ;

    beforeAll(() => {
      // America/Bogota is UTC-5, year-round (no DST). This is the exact
      // condition that exposed the original bug: `new Date('2026-03-10')`
      // is parsed as a UTC instant, which renders as 09/03/2026 (a day
      // early) west of the prime meridian. formatDateOnly must not shift.
      process.env.TZ = 'America/Bogota';
    });

    afterAll(() => {
      if (ORIGINAL_TZ === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = ORIGINAL_TZ;
      }
    });

    it('S-DATE-12: formats the same dd/mm/yyyy under a non-UTC process timezone', () => {
      expect(formatDateOnly('2026-03-10')).toBe('10/03/2026');
    });
  });
});
