/**
 * Daily USD → MN (CUP) exchange-rate register entry.
 *
 * One record per LOCAL calendar day per store. The record id IS the local
 * day key (`YYYY-MM-DD`, see `toLocalDayKey` in the app's date-utils), so a
 * store can never hold two records for the same day — backfill/import upsert
 * by that id and the register stays contiguous from the owner's first login.
 *
 * `value` means "how many MN equals 1 USD" on that day (e.g. 120 → 1 USD =
 * 120 MN). The default is 1. Records are never created nor deleted from the
 * UI — the daily rows are auto-added by backfill (each new day copies the
 * previous day's value) and the only allowed operation is editing `value`.
 */
export interface ExchangeRate {
  /** Local day key (`YYYY-MM-DD`) — unique per store, also the sync/import id. */
  id: string;
  /** Local midnight of the record's day. */
  date: Date;
  /** 1 USD = `value` MN. Defaults to 1; must be > 0. */
  value: number;
  /** Stamped when the owner edits the value. */
  updatedDate?: Date;
  updatedByName?: string;
}