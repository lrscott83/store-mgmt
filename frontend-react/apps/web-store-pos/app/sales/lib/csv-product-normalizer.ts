/**
 * Product import normalization (2026-09-02 row-level import rule).
 *
 * Product uniqueness during CSV import is by category + name, compared CASE-INSENSITIVELY, and
 * names/categories are persisted with the FIRST letter capitalized (trim + first-letter upper,
 * rest as-is). These helpers are import-only: the normal UI's case-sensitive uniqueness in
 * `ProductRepository.addProductData`/`updateProduct` is untouched.
 */

/** Collapses spaces, then lowercases — the canonical comparison key for case-insensitive lookup. */
export function normalizeLookup(value: string): string {
  return value.trim().toLowerCase();
}

/** Normalizes a display name/category for persistence: trim + first char upper, rest as-is. */
export function normalizeDisplayName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
