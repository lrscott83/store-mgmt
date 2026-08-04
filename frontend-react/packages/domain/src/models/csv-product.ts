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

/** A row that `createCsvProducts` actually persisted, plus the id it generated for it. */
export interface CsvProductCreated extends CsvProduct {
  id: string;
}

/** Per-row outcome of a CSV import. `failed.length > 0` replaces the old `hasError` flag. */
export interface CsvImportResult {
  created: CsvProductCreated[];
  failed: CsvProduct[];
}
