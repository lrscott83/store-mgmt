/**
 * Was a 1:1 port of Angular's `CsvProduct`
 * (frontend/src/app/_services/csv/models/csv-product.model.ts) — byte-identical shape.
 * DIVERGES DELIBERATELY as of csv-import-cost-quantity-entries (2026-08-04, decision #15):
 * `cost?`/`quantity?` are React-only OPTIONAL columns feeding inventory-entry creation on
 * import. The 2026-07-08 Flag #2 ratification is SUPERSEDED for these two fields ONLY —
 * `barcode` remains forbidden. A parity audit must NOT restore the 3-field shape.
 */
export interface CsvProduct {
  category: string;
  name: string;
  price: number;
  /** React-only, OPTIONAL. Entry cost. Absent/invalid/negative -> undefined -> falls back to price. */
  cost?: number;
  /** React-only, OPTIONAL. Integer > 0 expected; absent/invalid -> undefined -> no entry (REQ-3 gates it). */
  quantity?: number;
}

/**
 * A CSV row that `createCsvProducts` processed, plus the id of the product it resolved to.
 *
 * With the 2026-09-02 row-level import rule, a row ALWAYS lands here (created or reused):
 * a product that already exists (same normalized category + name, case-insensitive) is reused
 * — its id is NOT a new one. `existing` distinguishes "this row created a brand-new product"
 * (`false`) from "this row reused an already-present product and only updated its price"
 * (`true`). Together with `failed` (always empty — the parser validates rows), the handler can
 * report created-vs-updated without a separate outcome type.
 */
export interface CsvProductCreated extends CsvProduct {
  id: string;
  /** `false` when this row created a new product, `true` when it reused an existing one. */
  existing: boolean;
}

/** Per-row outcome of a CSV import. `failed.length > 0` replaces the old `hasError` flag. */
export interface CsvImportResult {
  created: CsvProductCreated[];
  failed: CsvProduct[];
}
