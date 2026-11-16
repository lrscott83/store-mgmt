import { formatChatDayLabel, toLocalDayKey } from '../date-utils';

export interface ChatDaySeparator {
  kind: 'separator';
  /** `YYYY-MM-DD` of the LOCAL day this separator opens. */
  dayKey: string;
  label: string;
}

export interface ChatDayMessage<T> {
  kind: 'message';
  item: T;
}

export type ChatDayRenderItem<T> = ChatDaySeparator | ChatDayMessage<T>;

/**
 * Interleaves the already-ordered chat rows with ONE day separator per change
 * of the LOCAL calendar day, oldest day first.
 *
 * Deliberately not built on `groupByLocalDay`: that one buckets into day groups
 * and sorts the days NEWEST first, while a chat thread must stay in the order
 * the API returned it (ascending `sentAt`, and pending rows by `queuedAt`).
 * Here the incoming order is preserved untouched — a separator is inserted the
 * moment the day key differs from the previous row's.
 *
 * `today` (default: now) is the reference day the labels are computed against.
 * It is sampled ONCE per call and handed to every `formatChatDayLabel`, so a
 * render that straddles local midnight cannot label two separators of the same
 * list against two different references (`hoy` for one, `ayer` for the next).
 *
 * A row whose instant does not parse (an `Invalid Date`) gets NO separator of
 * its own and leaves the current day key untouched: the message row is pushed
 * into the day context around it, exactly as the baseline rendered it. Emitting
 * a separator for it would print a `NaN` day and split the thread on a
 * non-existent day.
 */
export function buildMessageDayItems<T>(
  items: readonly T[],
  getDate: (item: T) => Date,
  today: Date = new Date(),
): ChatDayRenderItem<T>[] {
  const result: ChatDayRenderItem<T>[] = [];
  let currentDayKey: string | null = null;

  for (const item of items) {
    const date = new Date(getDate(item));
    if (Number.isNaN(date.getTime())) {
      result.push({ kind: 'message', item });
      continue;
    }
    const dayKey = toLocalDayKey(date);
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      result.push({ kind: 'separator', dayKey, label: formatChatDayLabel(date, today) });
    }
    result.push({ kind: 'message', item });
  }

  return result;
}
