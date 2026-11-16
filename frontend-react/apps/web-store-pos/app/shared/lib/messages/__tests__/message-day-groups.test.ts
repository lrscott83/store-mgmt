import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatDayRenderItem } from '../message-day-groups';
import { buildMessageDayItems } from '../message-day-groups';
import { TEST_NOW, localDay } from './message-day-fixtures';

interface Row {
  id: string;
  at: Date;
}

function row(id: string, at: Date): Row {
  return { id, at };
}

function getDate(item: Row): Date {
  return item.at;
}

function separatorLabels(result: ChatDayRenderItem<Row>[]): string[] {
  return result.flatMap((entry) => (entry.kind === 'separator' ? [entry.label] : []));
}

describe('buildMessageDayItems', () => {
  // EVERY call below passes `TEST_NOW` explicitly. Omitting it would fall back
  // to an ambient `new Date()`, so the label a fixture produced would depend on
  // the calendar date the suite happened to run on.
  it('interleaves one separator per day change, oldest day first', () => {
    const items = [row('a', localDay(1)), row('b', localDay(1)), row('c', localDay(0))];

    const result = buildMessageDayItems(items, getDate, TEST_NOW);

    expect(result.map((entry) => entry.kind)).toEqual([
      'separator',
      'message',
      'message',
      'separator',
      'message',
    ]);
    expect(result[0]).toMatchObject({ kind: 'separator', label: 'ayer' });
    expect(result[3]).toMatchObject({ kind: 'separator', label: 'hoy' });
  });

  it('gives a day with several messages exactly one separator', () => {
    const items = [row('a', localDay(0, 8)), row('b', localDay(0, 12)), row('c', localDay(0, 20))];

    const result = buildMessageDayItems(items, getDate, TEST_NOW);

    expect(result.filter((entry) => entry.kind === 'separator')).toHaveLength(1);
    expect(result.filter((entry) => entry.kind === 'message')).toHaveLength(3);
  });

  it('keeps the incoming order instead of re-sorting it', () => {
    const items = [row('a', localDay(2)), row('b', localDay(1)), row('c', localDay(0))];

    const ids = buildMessageDayItems(items, getDate, TEST_NOW)
      .filter((entry) => entry.kind === 'message')
      .map((entry) => (entry.kind === 'message' ? entry.item.id : ''));

    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for an empty list', () => {
    expect(buildMessageDayItems([], getDate, TEST_NOW)).toEqual([]);
  });

  it('labels a day older than a week with the local dd/mm/yyyy date', () => {
    const [separator] = buildMessageDayItems([row('a', localDay(9))], getDate, TEST_NOW);

    expect(separator.kind).toBe('separator');
    expect(separator.kind === 'separator' ? separator.label : '').toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('groups by the LOCAL calendar day, not the UTC one', () => {
    const lateNight = localDay(1, 23);
    const earlySameNight = new Date(lateNight);
    earlySameNight.setHours(23, 45, 0, 0);

    const result = buildMessageDayItems(
      [row('a', lateNight), row('b', earlySameNight)],
      getDate,
      TEST_NOW,
    );

    expect(result.filter((entry) => entry.kind === 'separator')).toHaveLength(1);
  });

  it('skips the separator for an unparsable row instead of emitting a NaN day', () => {
    const invalid = new Date('not-a-date');

    const result = buildMessageDayItems(
      [row('a', localDay(1)), row('bad', invalid), row('c', localDay(1, 13))],
      getDate,
      TEST_NOW,
    );

    // The bad row inherits the day context it was rendered in: no separator of
    // its own, and the surrounding day key is left untouched.
    expect(result.map((entry) => entry.kind)).toEqual([
      'separator',
      'message',
      'message',
      'message',
    ]);
    expect(result[0]).toMatchObject({ kind: 'separator', label: 'ayer' });
    expect(result.map((entry) => (entry.kind === 'message' ? entry.item.id : ''))).toEqual([
      '',
      'a',
      'bad',
      'c',
    ]);
    for (const entry of result) {
      if (entry.kind !== 'separator') continue;
      expect(entry.label).not.toContain('NaN');
      expect(entry.dayKey).not.toContain('NaN');
    }
  });

  it('skips the separator for an unparsable row in FIRST position too', () => {
    // Position 0 is a different state from a mid-thread bad row: there
    // `currentDayKey` is already set, here it is still `null`. A guard that only
    // holds mid-thread would emit a `NaN` day before a leading bad row.
    const invalid = new Date('not-a-date');

    const result = buildMessageDayItems(
      [row('bad', invalid), row('a', localDay(1)), row('b', localDay(0))],
      getDate,
      TEST_NOW,
    );

    expect(result.map((entry) => entry.kind)).toEqual([
      'message',
      'separator',
      'message',
      'separator',
      'message',
    ]);
    // The bad row is still rendered — dropping it would hide a real message.
    expect(result[0]).toMatchObject({ kind: 'message' });
    expect(result[0]).toMatchObject({ item: { id: 'bad' } });
    // The following rows group from their OWN day, not from the bad row.
    expect(separatorLabels(result)).toEqual(['ayer', 'hoy']);
    for (const entry of result) {
      if (entry.kind !== 'separator') continue;
      expect(entry.label).not.toContain('NaN');
      expect(entry.dayKey).not.toContain('NaN');
    }
  });
});

describe('buildMessageDayItems — reference day', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels EVERY separator against the single reference it was given', () => {
    // The wall clock is deliberately years AHEAD of the reference. A builder
    // that re-sampled "now" per separator, or ignored the reference, would make
    // every delta negative — and `daysAgo <= 0` yields 'hoy', so the failure
    // mode is 'hoy' for EVERY separator, never a plain date.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 0, 1, 12, 0, 0));

    const result = buildMessageDayItems(
      [
        row('a', localDay(8)),
        row('b', localDay(7)),
        row('c', localDay(1)),
        row('d', localDay(0)),
      ],
      getDate,
      TEST_NOW,
    );

    // Exactly 7 days ago is still the weekday, 8 days ago is the local date.
    expect(separatorLabels(result)).toEqual(['08/11/2026', 'lunes', 'ayer', 'hoy']);
  });

  it('shifts the labels when ONLY the reference advances past midnight', () => {
    // A crossing of local midnight changes the labels with the message array
    // untouched. This is the property a `[messages]`-keyed memo would silently
    // break: the REFERENCE drives the label, not the data.
    const rows = [row('a', localDay(1)), row('b', localDay(0))];
    const nextDay = new Date(TEST_NOW);
    nextDay.setDate(nextDay.getDate() + 1);

    expect(separatorLabels(buildMessageDayItems(rows, getDate, TEST_NOW))).toEqual([
      'ayer',
      'hoy',
    ]);
    // Sunday 15 Nov 2026 becomes 2 days back once the reference is Monday 17th;
    // the previously "ayer" day becomes "domingo" and "hoy" becomes "ayer".
    expect(separatorLabels(buildMessageDayItems(rows, getDate, nextDay))).toEqual([
      'domingo',
      'ayer',
    ]);
  });
});
