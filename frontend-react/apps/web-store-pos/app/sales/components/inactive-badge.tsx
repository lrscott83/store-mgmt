/**
 * The "Inactivo" marker used by the product catalog, on both category headers
 * and product rows (`openspec/changes/catalog-show-all-and-clear-data/
 * superpowers-design.md` §D4).
 *
 * The catalog lists inactive categories and products; the sale screen does not.
 * Without a marker the user sees a row in the catalog, does not see it in
 * Ventas, and has no way to tell why. It carries TEXT, not just the reduced
 * opacity its container applies — colour and opacity say nothing to a screen
 * reader and little on a dim display.
 *
 * Copy stays hardcoded Spanish, matching the other hardcoded-Spanish strings
 * already in `products.tsx` (e.g. the CSV-import success toast and duplicate-
 * rows dialog in its `handleCsvImport`).
 */
export function InactiveBadge() {
  return (
    <span
      data-testid="inactive-badge"
      className="shrink-0 rounded-full border border-danger px-2 py-0.5 text-xs font-medium text-danger"
    >
      Inactivo
    </span>
  );
}
