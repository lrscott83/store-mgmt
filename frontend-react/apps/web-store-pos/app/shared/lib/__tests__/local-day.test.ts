import { describe, it, expect } from 'vitest';
import {
  toLocalDayKey, fromLocalDayKey, localDayRange, isInLocalDay,
  groupByLocalDay, formatLocalDate,
} from '../date-utils';

describe('toLocalDayKey', () => {
  it('DAYKEY-01: an 11pm transaction stays on ITS day — never rolls over to tomorrow', () => {
    expect(toLocalDayKey(new Date(2026, 6, 22, 23, 0, 0))).toBe('2026-07-22');
  });

  it('DAYKEY-02: agrees with formatLocalDate at EVERY hour of the day', () => {
    // The master invariant. `toISOString().split('T')[0]` breaks this at some hour
    // in every timezone other than UTC — which is the bug this helper replaces.
    for (let hour = 0; hour < 24; hour++) {
      const instant = new Date(2026, 6, 22, hour, 30, 0);
      const [year, month, day] = toLocalDayKey(instant).split('-');
      expect(`${day}/${month}/${year}`).toBe(formatLocalDate(instant));
    }
  });

  it('DAYKEY-03: local midnight and the last millisecond of the day share one key', () => {
    expect(toLocalDayKey(new Date(2026, 6, 22, 0, 0, 0, 0)))
      .toBe(toLocalDayKey(new Date(2026, 6, 22, 23, 59, 59, 999)));
  });

  it('DAYKEY-04: the next local midnight starts a new key', () => {
    expect(toLocalDayKey(new Date(2026, 6, 23, 0, 0, 0, 0))).toBe('2026-07-23');
  });

  it('DAYKEY-05: pads single-digit months and days', () => {
    expect(toLocalDayKey(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05');
  });
});

describe('fromLocalDayKey', () => {
  it('DAYKEY-06: round-trips any instant to its own day at local midnight', () => {
    const instant = new Date(2026, 6, 22, 23, 45, 0);
    const midnight = fromLocalDayKey(toLocalDayKey(instant));

    expect(midnight.getFullYear()).toBe(2026);
    expect(midnight.getMonth()).toBe(6);
    expect(midnight.getDate()).toBe(22);
    expect(midnight.getHours()).toBe(0);
    expect(toLocalDayKey(midnight)).toBe(toLocalDayKey(instant));
  });
});

describe('localDayRange / isInLocalDay', () => {
  it('DAYKEY-07: the window is half-open — [midnight, next midnight)', () => {
    const { start, end } = localDayRange(new Date(2026, 6, 22, 15, 0, 0));

    expect(isInLocalDay(start, start)).toBe(true);
    expect(isInLocalDay(new Date(2026, 6, 22, 23, 59, 59, 999), start)).toBe(true);
    expect(isInLocalDay(end, start)).toBe(false);
  });

  it('DAYKEY-08: an 11pm instant belongs to its own day and not to the next', () => {
    const lateNight = new Date(2026, 6, 22, 23, 0, 0);

    expect(isInLocalDay(lateNight, new Date(2026, 6, 22, 8, 0, 0))).toBe(true);
    expect(isInLocalDay(lateNight, new Date(2026, 6, 23, 8, 0, 0))).toBe(false);
  });
});

describe('groupByLocalDay', () => {
  const at = (h: number, d = 22) => ({ date: new Date(2026, 6, d, h, 0, 0) });

  it('GROUP-01: instants on the same local day land in ONE group, even across UTC midnight', () => {
    const groups = groupByLocalDay([at(9), at(23)], (i) => i.date);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].dayKey).toBe('2026-07-22');
  });

  it('GROUP-02: the group date is local MIDNIGHT, not the first item instant', () => {
    const groups = groupByLocalDay([at(23), at(9)], (i) => i.date);

    expect(groups[0].date.getHours()).toBe(0);
    expect(formatLocalDate(groups[0].date)).toBe('22/07/2026');
  });

  it('GROUP-03: groups come back newest day first', () => {
    const groups = groupByLocalDay([at(10, 20), at(10, 23), at(10, 21)], (i) => i.date);

    expect(groups.map((g) => g.dayKey)).toEqual(['2026-07-23', '2026-07-21', '2026-07-20']);
  });

  it('GROUP-04: items are ordered by the supplied comparator, leaving the input untouched', () => {
    const input = [at(9), at(23), at(15)];
    const groups = groupByLocalDay(input, (i) => i.date, (a, b) => b.date.getTime() - a.date.getTime());

    expect(groups[0].items.map((i) => i.date.getHours())).toEqual([23, 15, 9]);
    expect(input.map((i) => i.date.getHours())).toEqual([9, 23, 15]);
  });

  it('GROUP-05: no items, no groups', () => {
    expect(groupByLocalDay([], (i: { date: Date }) => i.date)).toEqual([]);
  });

  it('GROUP-06: revives a date arriving as a raw string, as storage sometimes yields', () => {
    const groups = groupByLocalDay(
      [{ date: '2026-07-22T23:00:00' as unknown as Date }],
      (i) => i.date,
    );

    expect(groups[0].dayKey).toBe('2026-07-22');
  });
});