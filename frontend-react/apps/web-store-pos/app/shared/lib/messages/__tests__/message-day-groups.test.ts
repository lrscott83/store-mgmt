import { describe, expect, it } from 'vitest';
import { buildMessageDayItems } from '../message-day-groups';

interface Row {
  id: string;
  at: Date;
}

function row(id: string, at: Date): Row {
  return { id, at };
}

function at(daysAgo: number, hour = 12): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function getDate(item: Row): Date {
  return item.at;
}

describe('buildMessageDayItems', () => {
  it('interleaves one separator per day change, oldest day first', () => {
    const items = [row('a', at(1)), row('b', at(1)), row('c', at(0))];

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
    const items = [row('a', at(0, 8)), row('b', at(0, 12)), row('c', at(0, 20))];

    const result = buildMessageDayItems(items, getDate);

    expect(result.filter((entry) => entry.kind === 'separator')).toHaveLength(1);
    expect(result.filter((entry) => entry.kind === 'message')).toHaveLength(3);
  });

  it('keeps the incoming order instead of re-sorting it', () => {
    const items = [row('a', at(2)), row('b', at(1)), row('c', at(0))];

    const ids = buildMessageDayItems(items, getDate)
      .filter((entry) => entry.kind === 'message')
      .map((entry) => (entry.kind === 'message' ? entry.item.id : ''));

    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for an empty list', () => {
    expect(buildMessageDayItems([], getDate)).toEqual([]);
  });

  it('labels a day older than a week with the local dd/mm/yyyy date', () => {
    const [separator] = buildMessageDayItems([row('a', at(9))], getDate);

    expect(separator.kind).toBe('separator');
    expect(separator.kind === 'separator' ? separator.label : '').toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('groups by the LOCAL calendar day, not the UTC one', () => {
    const lateNight = new Date();
    lateNight.setDate(lateNight.getDate() - 1);
    lateNight.setHours(23, 30, 0, 0);
    const earlySameNight = new Date(lateNight);
    earlySameNight.setHours(23, 45, 0, 0);

    const result = buildMessageDayItems([row('a', lateNight), row('b', earlySameNight)], getDate);

    expect(result.filter((entry) => entry.kind === 'separator')).toHaveLength(1);
  });
});
