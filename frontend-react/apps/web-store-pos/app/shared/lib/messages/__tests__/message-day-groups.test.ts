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
  it('interleaves one separator per day change, oldest day first', () => {
    const items = [row('a', localDay(1)), row('b', localDay(1)), row('c', localDay(0))];

    const result = buildMessageDayItems(items, getDate);

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

    const result = buildMessageDayItems(items, getDate);

    expect(result.filter((entry) => entry.kind === 'separator')).toHaveLength(1);
    expect(result.filter((entry) => entry.kind === 'message')).toHaveLength(3);
  });

  it('keeps the incoming order instead of re-sorting it', () => {
    const items = [row('a', localDay(2)), row('b', localDay(1)), row('c', localDay(0))];

    const ids = buildMessageDayItems(items, getDate)
      .filter((entry) => entry.kind === 'message')
      .map((entry) => (entry.kind === 'message' ? entry.item.id : ''));

    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for an empty list', () => {
    expect(buildMessageDayItems([], getDate)).toEqual([]);
  });

  it('labels a day older than a week with the local dd/mm/yyyy date', () => {
    const [separator] = buildMessageDayItems([row('a', localDay(9))], getDate);

    expect(separator.kind).toBe('separator');
    expect(separator.kind === 'separator' ? separator.label : '').toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('groups by the LOCAL calendar day, not the UTC one', () => {
    const lateNight = localDay(1, 23);
    const earlySameNight = new Date(lateNight);
    earlySameNight.setHours(23, 45, 0, 0);

    const result = buildMessageDayItems([row('a', lateNight), row('b', earlySameNight)], getDate);

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
});

describe('buildMessageDayItems — reference day', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels EVERY separator against the single reference it was given', () => {
    // The wall clock is deliberately years away from the reference: a builder
    // that re-sampled "now" per separator, or ignored the reference, would label
    // these rows as a plain date instead.
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
});
