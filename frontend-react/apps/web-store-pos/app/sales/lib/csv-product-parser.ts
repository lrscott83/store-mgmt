export interface ParsedProductRow {
  name: string;
  price: number;
  // Required — mirrors Angular's `CsvProduct` model (byte-identical shape:
  // frontend/src/app/_services/csv/models/csv-product.model.ts) and its `validateProducts`
  // check (frontend/src/app/_services/csv/csv-product.service.ts:26-34), which treats
  // `category` as mandatory, exactly like `name` and `price`.
  category: string;
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
    // 'number'`) ---
    const category = categoryIdx >= 0 ? (fields[categoryIdx] ?? '') : '';
    if (!category) {
      errors.push({ row: dataRowNum, errorCode: 'MISSING_CATEGORY' });
      continue;
    }

    products.push({ name, price, category });
  }

  return { products, errors };
}
