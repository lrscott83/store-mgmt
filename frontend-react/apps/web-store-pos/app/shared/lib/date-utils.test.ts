import { describe, expect, it } from 'vitest';
import { startOfDay, addDays } from './date-utils';

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
