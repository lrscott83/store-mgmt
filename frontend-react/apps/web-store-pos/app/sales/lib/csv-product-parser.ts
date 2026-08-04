export interface ParsedProductRow {
  name: string;
  price: number;
  // Required — mirrors Angular's `CsvProduct` model (byte-identical shape:
  // frontend/src/app/_services/csv/models/csv-product.model.ts) and its `validateProducts`
  // check (frontend/src/app/_services/csv/csv-product.service.ts:26-34), which treats
  // `category` as mandatory, exactly like `name` and `price`.
  //
  // `cost`/`quantity` are React-only OPTIONAL fields, normalized to `undefined` here; they
  // never produce an error and never drop a row (decisions #7/#8, csv-import-cost-quantity-
  // entries, 2026-08-04).
  category: string;
  cost?: number;
  quantity?: number;
}

export type CsvRowErrorCode = 'MISSING_NAME' | 'MISSING_PRICE' | 'INVALID_PRICE' | 'MISSING_CATEGORY';

export interface CsvRowError {
  row: number;
  /**
   * Error code, not a hardcoded message — this is a plain lib function (no `useIntl` access),
   * so the consuming component (`csv-product-importer-modal.tsx`) maps each code to its
   * existing Spanish i18n key (`PRODUCTS.CSV.ERROR.*`), same pattern as
   * `app/sales/lib/product-availability.ts`'s error-code -> i18n-key mapping.
   */
  errorCode: CsvRowErrorCode;
}

export interface CsvParseResult {
  products: ParsedProductRow[];
  errors: CsvRowError[];
}

/**
 * Quote-aware CSV tokenizer mirroring papaparse's default parsing behavior for the shape Angular
 * relies on (frontend/src/app/_services/csv/csv-product.service.ts:12-15 —
 * `Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true })`). papaparse is
 * NOT a React dependency (verified: no `papaparse` entry in any package.json/lockfile in
 * frontend-react) and rule 12 (migration invents nothing new) forbids adding one just to
 * hand-roll this — so this replicates RFC4180-style quoting (quoted fields, embedded commas,
 * embedded newlines, `""` as an escaped quote) without a new dependency. React's naive
 * `line.split(',')` broke on quoted fields containing commas; this does not.
 */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += char;
        i++;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
    } else if (char === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (char === '\r') {
      i++;
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else {
      field += char;
      i++;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isBlankRow(row: string[]): boolean {
  return row.length === 0 || (row.length === 1 && row[0].trim() === '');
}

/**
 * Decision #7: absent, non-numeric or negative -> undefined (caller falls back to price). 0 is
 * legal. Validated with `Number(raw)` (not bare `parseFloat`) because `parseFloat`/`parseInt`
 * stop at the first invalid character instead of rejecting the whole string — `parseFloat("15O")`
 * is `15`, not `NaN` — which would silently accept a malformed cell (REQ-1 scenario 8).
 */
function parseOptionalCost(raw: string): number | undefined {
  if (!raw) return undefined;
  if (isNaN(Number(raw))) return undefined;
  const value = parseFloat(raw);
  return isNaN(value) || value < 0 ? undefined : value;
}

/**
 * Decision #9: parseInt truncates (2.5 -> 2); absent or non-numeric -> undefined. Same
 * full-string validation caveat as `parseOptionalCost` applies (REQ-1 scenario 9).
 *
 * NOTE (REQ-1 scenarios 6/7, spec #1871): zero and negative values are intentionally
 * PRESERVED here, not collapsed to `undefined` — the parser only reports "could this cell be
 * read as a number at all", it does not decide whether the row qualifies for an entry. That
 * gating (`quantity > 0`) is REQ-3's job, downstream, at entry-creation time.
 */
function parseOptionalQuantity(raw: string): number | undefined {
  if (!raw) return undefined;
  if (isNaN(Number(raw))) return undefined;
  const value = parseInt(raw, 10);
  return isNaN(value) ? undefined : value;
}

export function parseCsvProducts(csvText: string): CsvParseResult {
  const products: ParsedProductRow[] = [];
  const errors: CsvRowError[] = [];

  const rows = tokenizeCsv(csvText);
  if (rows.length === 0) return { products, errors };

  // Find header row — first non-blank row
  let headerIndex = 0;
  while (headerIndex < rows.length && isBlankRow(rows[headerIndex])) {
    headerIndex++;
  }
  if (headerIndex >= rows.length) return { products, errors };

  const headers = rows[headerIndex].map((h) => h.trim().toLowerCase());

  const nameIdx = headers.indexOf('name');
  const priceIdx = headers.indexOf('price');
  const categoryIdx = headers.indexOf('category');
  const costIdx = headers.indexOf('cost');
  const quantityIdx = headers.indexOf('quantity');

  let dataRowNum = 0;
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;

    dataRowNum++;
    const fields = row.map((f) => f.trim());

    // --- Validate name ---
    const name = nameIdx >= 0 ? (fields[nameIdx] ?? '') : (fields[0] ?? '');
    if (!name) {
      errors.push({ row: dataRowNum, errorCode: 'MISSING_NAME' });
      continue;
    }

    // --- Validate price ---
    const rawPrice = priceIdx >= 0 ? (fields[priceIdx] ?? '') : (fields[1] ?? '');
    if (!rawPrice) {
      errors.push({ row: dataRowNum, errorCode: 'MISSING_PRICE' });
      continue;
    }
    const price = parseFloat(rawPrice);
    if (isNaN(price)) {
      errors.push({ row: dataRowNum, errorCode: 'INVALID_PRICE' });
      continue;
    }

    // --- Validate category (Angular parity — required, not optional:
    // csv-product.service.ts:26-34 `item['category'] && item['name'] && typeof item['price'] ===
    // 'number'`. This "required, not optional" claim scopes to `category` ONLY — the
    // React-only `cost`/`quantity` columns below are optional and never fail a row
    // (decisions #7/#8, csv-import-cost-quantity-entries, 2026-08-04). ---
    const category = categoryIdx >= 0 ? (fields[categoryIdx] ?? '') : '';
    if (!category) {
      errors.push({ row: dataRowNum, errorCode: 'MISSING_CATEGORY' });
      continue;
    }

    // --- Optional cost/quantity (React-only, REQ-1) ---
    const cost = parseOptionalCost(costIdx >= 0 ? (fields[costIdx] ?? '') : '');
    const quantity = parseOptionalQuantity(quantityIdx >= 0 ? (fields[quantityIdx] ?? '') : '');

    products.push({ name, price, category, cost, quantity });
  }

  return { products, errors };
}
