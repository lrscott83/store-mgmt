import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  toLocalDayKey,
  fromLocalDayKey,
  localDayRange,
  isInLocalDay,
  groupByLocalDay,
  formatLocalDate,
  maskDashedDate,
  parseDashedDate,
  weekdayNameEs,
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
    expect(toLocalDayKey(new Date(2026, 6, 22, 0, 0, 0, 0))).toBe(
      toLocalDayKey(new Date(2026, 6, 22, 23, 59, 59, 999)),
    );
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
    const groups = groupByLocalDay(
      input,
      (i) => i.date,
      (a, b) => b.date.getTime() - a.date.getTime(),
    );

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

describe('DST regression (America/Sao_Paulo — transitions at midnight, historic Brazil)', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Sao_Paulo';
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('DST-01: on a spring-forward day (2017-10-15, 23h), the window ends at the NEXT day true midnight, not 01:00', () => {
    // 00:00 Oct 15 does not exist (clocks jump 00:00 -> 01:00), so startOfDay snaps to
    // 01:00. The end must re-snap from the original instant: Oct 16 00:00 (exists).
    // `addDays(start, 1)` would carry the snapped 01:00 into Oct 16 and stretch the
    // window one real hour into the next day.
    const { start, end } = localDayRange(new Date(2017, 9, 15, 12, 0, 0));

    expect(start.getTime()).toBe(new Date(2017, 9, 15, 1, 0, 0).getTime());
    expect(end.getTime()).toBe(new Date(2017, 9, 16, 0, 0, 0).getTime());
  });

  it('DST-02: a 00:30 order of the NEXT day never falls in the spring-forward day window (no double-count)', () => {
    const day15 = new Date(2017, 9, 15, 12, 0, 0);
    const day16 = new Date(2017, 9, 16, 12, 0, 0);
    const nextDayEarly = new Date(2017, 9, 16, 0, 30, 0);

    expect(isInLocalDay(nextDayEarly, day15)).toBe(false);
    expect(isInLocalDay(nextDayEarly, day16)).toBe(true);

    // control: a late-night order of the queried day still belongs to it
    expect(isInLocalDay(new Date(2017, 9, 15, 23, 30, 0), day15)).toBe(true);
  });

  it('DST-03: on the fall-back transition (2018-02-18), the repeated hour belongs to the PREVIOUS day window', () => {
    // Sao Paulo ended DST at midnight INTO Feb 18 (00:00 -> 23:00 Feb 17), so the
    // repeated hour 23:00-00:00 makes Feb 17 the 25h day; Feb 18 itself is a normal 24h day.
    const feb17 = localDayRange(new Date(2018, 1, 17, 12, 0, 0));
    const feb18 = localDayRange(new Date(2018, 1, 18, 12, 0, 0));

    expect(feb17.end.getTime() - feb17.start.getTime()).toBe(25 * 60 * 60 * 1000);
    expect(feb17.end.getTime()).toBe(new Date(2018, 1, 18, 0, 0, 0).getTime());
    expect(feb18.end.getTime() - feb18.start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(feb18.start.getTime()).toBe(new Date(2018, 1, 18, 0, 0, 0).getTime());
    expect(feb18.end.getTime()).toBe(new Date(2018, 1, 19, 0, 0, 0).getTime());
  });
});

describe('maskDashedDate (dd-mm-yyyy input mask, user request 2026-09-08)', () => {
  it('formats raw digits progressively: day, then day-month, then full date', () => {
    expect(maskDashedDate('0')).toBe('0');
    expect(maskDashedDate('09')).toBe('09');
    expect(maskDashedDate('090')).toBe('09-0');
    expect(maskDashedDate('0901')).toBe('09-01');
    expect(maskDashedDate('09012')).toBe('09-01-2');
    expect(maskDashedDate('0901202')).toBe('09-01-202');
    expect(maskDashedDate('09012026')).toBe('09-01-2026');
  });

  it('keeps dashes the user already typed (edits stay coherent)', () => {
    expect(maskDashedDate('09-01-2026')).toBe('09-01-2026');
    expect(maskDashedDate('09-01')).toBe('09-01');
  });

  it('ignores non-digit, non-dash characters', () => {
    expect(maskDashedDate('09/01/2026')).toBe('09-01-2026');
    expect(maskDashedDate('abc')).toBe('');
  });

  it('caps at 10 characters (dd-mm-yyyy)', () => {
    expect(maskDashedDate('090120269')).toBe('09-01-2026');
  });
});

describe('parseDashedDate (dd-mm-yyyy → local midnight)', () => {
  it('parses a valid date to LOCAL midnight of that day', () => {
    const parsed = parseDashedDate('09-01-2026');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(0); // January
    expect(parsed!.getDate()).toBe(9);
    expect(parsed!.getHours()).toBe(0);
    expect(parsed!.getMinutes()).toBe(0);
  });

  it('accepts both dashed and digit-only input (mask or paste)', () => {
    expect(parseDashedDate('09012026')!.getDate()).toBe(9);
    expect(parseDashedDate('09-01-2026')!.getDate()).toBe(9);
  });

  it('returns null for incomplete input', () => {
    expect(parseDashedDate('09-01')).toBeNull();
    expect(parseDashedDate('')).toBeNull();
    expect(parseDashedDate('0901')).toBeNull();
  });

  it('returns null for impossible dates (day 32, month 13, non-leap Feb 29)', () => {
    expect(parseDashedDate('32-01-2026')).toBeNull();
    expect(parseDashedDate('09-13-2026')).toBeNull();
    expect(parseDashedDate('29-02-2025')).toBeNull(); // 2025 is not a leap year
    expect(parseDashedDate('29-02-2024')).not.toBeNull(); // 2024 IS a leap year
  });
});

describe('weekdayNameEs (día de la semana en español, user request 2026-09-08)', () => {
  it('returns the Spanish weekday name (lowercase, RAE style) of the LOCAL day', () => {
    // 2026-09-08 is a Tuesday; 2026-09-06 a Sunday; 2026-09-07 a Monday.
    expect(weekdayNameEs(new Date(2026, 8, 8))).toBe('martes');
    expect(weekdayNameEs(new Date(2026, 8, 6))).toBe('domingo');
    expect(weekdayNameEs(new Date(2026, 8, 7))).toBe('lunes');
    expect(weekdayNameEs(new Date(2026, 8, 12))).toBe('sábado');
    expect(weekdayNameEs(new Date(2026, 8, 9))).toBe('miércoles');
  });

  it('agrees with parseDashedDate for the same calendar day', () => {
    const parsed = parseDashedDate('08-09-2026');
    expect(parsed).not.toBeNull();
    expect(weekdayNameEs(parsed!)).toBe('martes');
  });
});
