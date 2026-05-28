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
