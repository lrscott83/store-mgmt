/**
 * Shared fixtures for the three chat day-separator suites: the pure builder
 * (`message-day-groups.test.ts`), the OwnerAdmin panel (`message-shell.test.tsx`)
 * and the SuperAdmin inbox (`messages.test.tsx`).
 *
 * They live in ONE module because those suites must agree on the same reference
 * day. Each of them used to anchor its own fixtures to an ambient `new Date()`,
 * so the label a fixture produced depended on when the suite happened to run —
 * two suites running across local midnight could disagree about the same row.
 *
 * Every instant here is derived from the FIXED `TEST_NOW` below, never from an
 * ambient `new Date()`. Nothing here imports production code: the fixtures must
 * not be able to borrow the very helper whose correctness they are pinning.
 *
 * Non-`.test` file on purpose: the Vitest config only collects
 * `app/**\/*.test.{ts,tsx}`, so this module is imported, never run as a suite.
 */

/**
 * Monday 16 November 2026, 12:00 LOCAL time. Mid-day on purpose: a fixture built
 * a whole number of days back or forward stays at 12:00 and can never straddle a
 * local midnight, so a suite's expectations do not depend on the wall clock.
 */
export const TEST_NOW = new Date(2026, 10, 16, 12, 0, 0);

/** Local instant `daysAgo` days before `TEST_NOW`, at the given local hour. */
export function localDay(daysAgo: number, hour = 12): Date {
  const date = new Date(TEST_NOW);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/** `localDay` as an ISO string — the shape message DTOs carry in `sentAt`. */
export function localInstant(daysAgo: number, hour = 12): string {
  return localDay(daysAgo, hour).toISOString();
}

/**
 * A `readAt` that FOLLOWS its own send: one minute after the same `localDay`.
 * Deriving it from the row's `sentAt` keeps every instant anchored to
 * `TEST_NOW` and makes a read-before-send row impossible to write by accident.
 */
export function readInstant(daysAgo: number, hour = 12): string {
  return new Date(localDay(daysAgo, hour).getTime() + 60_000).toISOString();
}

const SEPARATOR_TEST_ID = 'message-day-separator';

/** True when `element` is the chat's centered day separator chip. */
function isDaySeparator(element: Element): boolean {
  return element.getAttribute('data-testid') === SEPARATOR_TEST_ID;
}

/** The thread list's direct children mapped to their render role, in order. */
export function separatorKinds(children: ArrayLike<Element>): Array<'separator' | 'message'> {
  return Array.from(children, (child) => (isDaySeparator(child) ? 'separator' : 'message'));
}

/**
 * The day separators that are DIRECT children of the thread list, in render
 * order. Reading `list.children` (never `querySelectorAll`) is what proves they
 * are siblings of the message rows rather than nested inside one.
 */
export function daySeparatorRows(list: Element): HTMLElement[] {
  return Array.from(list.children).filter(isDaySeparator) as HTMLElement[];
}
