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

/**
 * dd-mm-yyyy input mask (user request 2026-09-08, Cuadre por fechas).
 *
 * Formats typed characters into `dd-mm-yyyy` as the user types: digits are
 * kept, separators (`-`, `/`, `.`) become the canonical dash, and everything
 * else is dropped. Inserted dashes appear after 2 digits (day) and after 4
 * (day-month). Output is capped at 10 characters. Pure — no Date involved.
 */
export function maskDashedDate(raw: string): string {
  const cleaned = raw.replace(/[^\d-]/g, '').slice(0, 10);
  const digits = cleaned.replace(/-/g, '');
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join('-');
}

/**
 * Inverse of `maskDashedDate`: parses `dd-mm-yyyy` (dashes optional — digits
 * alone work too, e.g. pasted) into the LOCAL midnight of that calendar day.
 * Returns `null` for anything incomplete or impossible (day 32, month 13,
 * Feb 29 in a non-leap year) — the caller decides how to surface the error.
 */
export function parseDashedDate(raw: string): Date | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Reject roll-overs (Feb 30, Feb 29 in a non-leap year, day 31 in a 30-day
  // month): `new Date(y, m, d)` silently normalizes them to the next month.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return startOfDay(date);
}

/**
 * Converts a native `<input type="date">` value (`YYYY-MM-DD`) to the
 * dd-mm-yyyy display form. Empty or malformed input returns `''` — the native
 * control only ever emits complete dates or an empty string.
 */
export function isoToDashedDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}-${month}-${year}`;
}

/**
 * Converts a dd-mm-yyyy value (dashes optional) to the native date input's
 * `YYYY-MM-DD`, or `''` when the value is incomplete or impossible. The native
 * control is the single source of truth in Cuadre por fechas; this bridges its
 * ISO value to the display mask.
 */
export function dashedToIsoDate(raw: string): string {
  const parsed = parseDashedDate(raw);
  return parsed ? toLocalDayKey(parsed) : '';
}

/**
 * Spanish weekday name (lowercase, RAE style) of a `Date`'s LOCAL calendar day.
 * The app is Spanish-only (i18n-provider resolves 'es'), so this is a fixed
 * table rather than an `Intl` call — deterministic in every environment.
 */
export function weekdayNameEs(date: Date): string {
  const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return WEEKDAYS_ES[new Date(date).getDay()];
}

/**
 * Calendar-day key of an instant in the VIEWER's LOCAL timezone; agrees by
 * construction with startOfDay and formatLocalDate. Do NOT use
 * toISOString().split('T')[0] — it projects onto the UTC calendar day, so a
 * 23:00 transaction under a negative offset keys to the NEXT day while being
 * filtered and displayed as the current one.
 */
export function toLocalDayKey(date: Date): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Inverse of `toLocalDayKey`: the LOCAL midnight that opens the given day key. */
export function fromLocalDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The half-open local-day window `[midnight, next midnight)` used by every day filter.
 *
 * The end re-snaps with `startOfDay(addDays(date, 1))` instead of `addDays(start, 1)`:
 * on a day whose local midnight does not exist (DST spring-forward at midnight, e.g.
 * historic Brazil/Cuba), `startOfDay` snaps the start to 01:00, and adding a day to
 * that snapped instant would carry the 01:00 into the next day — stretching the window
 * one real hour into the next day and double-counting its first hour of sales. Re-snapping
 * from the original instant anchors the end to the next day's true local midnight.
 */
export function localDayRange(date: Date): { start: Date; end: Date } {
  return { start: startOfDay(date), end: startOfDay(addDays(date, 1)) };
}

/** True when `instant` falls on the same LOCAL calendar day as `day`. */
export function isInLocalDay(instant: Date, day: Date): boolean {
  const { start, end } = localDayRange(day);
  return instant >= start && instant < end;
}

export interface LocalDayGroup<T> {
  /** `YYYY-MM-DD` in local time — stable, sortable, and safe as a DOM id. */
  dayKey: string;
  /** Local midnight of the group's day. NOT the first item's instant: the day itself. */
  date: Date;
  items: T[];
}

/**
 * Groups items by their LOCAL calendar day, newest day first.
 * `dayKey` sorts lexicographically in chronological order (that is the point of
 * `YYYY-MM-DD`), so no date arithmetic is needed to order the groups.
 */
export function groupByLocalDay<T>(
  items: T[],
  getDate: (item: T) => Date,
  compareItems?: (a: T, b: T) => number,
): LocalDayGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = toLocalDayKey(new Date(getDate(item)));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return [...buckets.entries()]
    .map(([dayKey, groupItems]) => ({
      dayKey,
      date: fromLocalDayKey(dayKey),
      items: compareItems ? [...groupItems].sort(compareItems) : groupItems,
    }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}
