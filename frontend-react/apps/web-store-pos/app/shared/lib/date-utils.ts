/**
 * Shared date utility functions.
 * Canonical implementations — imported by all services that need date arithmetic.
 * DO NOT duplicate these helpers elsewhere.
 */

/** Returns a new Date with the time zeroed to midnight (00:00:00.000) local time. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns a new Date shifted by `days` days forward (positive) or backward (negative). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a date-only string (`YYYY-MM-DD`, as returned by the backend for
 * `DateOnly?` fields such as `paymentDueDate`) as `dd/mm/yyyy`.
 *
 * Pure string manipulation — deliberately no `Date`, `Intl`, or timezone
 * anywhere in this function. A date-only value has no time component;
 * routing it through `new Date(...)` parses a bare `YYYY-MM-DD` string as
 * UTC midnight (per the ECMAScript spec), turning a calendar date into an
 * instant. Rendering that instant in any timezone west of UTC (e.g.
 * America/Bogota, UTC-5) then displays the previous day. Never construct a
 * `Date` from a date-only string — split the string and re-join it instead,
 * so correctness does not depend on the process timezone.
 *
 * Malformed input (anything not shaped like `YYYY-MM-DD`) is returned
 * unchanged, verbatim. This is a deliberate "fail visibly, don't guess"
 * choice: an unexpected string surfacing as-is in the UI is easier to
 * notice and diagnose than a silently wrong date or a thrown exception
 * during render.
 */
export function formatDateOnly(dateOnly: string | null | undefined): string {
  if (!dateOnly) return '';
  const match = DATE_ONLY_PATTERN.exec(dateOnly);
  if (!match) return dateOnly;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * Formats a `Date` INSTANT (already-parsed, e.g. `Order.date`, `InventoryEntry.date`,
 * `Expense.date`, `SaleCredit.date`/`paidDate`) as `dd/mm/yyyy` using LOCAL calendar-day
 * parts (`getDate`/`getMonth`/`getFullYear`) — NOT UTC (`getUTCDate`/...).
 *
 * Do not confuse this with `formatDateOnly` above: that one formats a `DateOnly`
 * (`YYYY-MM-DD`) STRING with no time component. This one formats a genuine instant that
 * already carries a time-of-day and must be projected onto a calendar day using the
 * VIEWER's local timezone.
 *
 * Local parts are used deliberately, for consistency with `startOfDay` (above), which the
 * app already uses to filter "today" by LOCAL midnight (`setHours(0,0,0,0)`). Reading UTC
 * parts here would disagree with that filtering criterion: an evening transaction (e.g.
 * 20:00 local) passes the "today" filter (its LOCAL day) but, formatted with UTC getters,
 * would render as tomorrow's date for any timezone west of UTC — this genuinely happened
 * for every user at a negative UTC offset (all of Latin America, e.g. America/Bogota).
 * Do NOT "fix" this back to UTC getters; that reintroduces the bug.
 */
export function formatLocalDate(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
