/**
 * 1:1 port of Angular's `CsvProduct`
 * (frontend/src/app/_services/csv/models/csv-product.model.ts) — byte-identical
 * shape, no `barcode` field (ratified 2026-07-08, Flag #2: React's CSV importer
 * MUST NOT carry a React-only optional barcode column past this slice).
 */
export interface CsvProduct {
  category: string;
  name: string;
  price: number;
}
