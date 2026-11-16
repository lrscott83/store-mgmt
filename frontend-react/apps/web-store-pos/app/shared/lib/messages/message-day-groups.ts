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
 */
export function buildMessageDayItems<T>(
  items: readonly T[],
  getDate: (item: T) => Date,
): ChatDayRenderItem<T>[] {
  const result: ChatDayRenderItem<T>[] = [];
  let currentDayKey: string | null = null;

  for (const item of items) {
    const date = new Date(getDate(item));
    const dayKey = toLocalDayKey(date);
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      result.push({ kind: 'separator', dayKey, label: formatChatDayLabel(date) });
    }
    result.push({ kind: 'message', item });
  }

  return result;
}
