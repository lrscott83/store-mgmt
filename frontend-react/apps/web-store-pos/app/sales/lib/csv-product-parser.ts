import { Currency } from '@store-mgmt/domain';

export interface ParsedProductRow {
  name: string;
  price: number;
  // currency-in-costs-and-prices (plan 2026-09-16): optional `moneda`/`currency` column,
  // normalized to `undefined` by `parseOptionalCurrency` — never an error, never drops a row.
  currency?: Currency;
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
  /**
   * MultiMonedas CSV (2026-09-22): moneda del COSTO (columna `precio_costo`),
   * parseada case-insensitivamente por NOMBRE vía `parseCurrencyByName`.
   * Desconocida/ausente -> undefined -> CUP (dominio default).
   */
  costCurrency?: Currency;
}

export type CsvRowErrorCode =
  | 'MISSING_NAME'
  | 'MISSING_PRICE'
  | 'INVALID_PRICE'
  | 'MISSING_CATEGORY';

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
 * First header matching any alias, or -1. Headers arrive trimmed + lowercased. Spanish is the
 * canonical header language of the importer template (categoria,nombre,precio,costo,cantidad,
 * 2026-09-03); the English aliases are kept so legacy files written against the Angular-era
 * template (category,name,price[,cost,quantity]) still import unchanged (decision #4 — headers
 * are matched by name, never by position).
 */
function indexOfHeader(headers: string[], ...aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
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

/**
 * currency-in-costs-and-prices (plan 2026-09-16): absent, non-numeric, non-integer or
 * out-of-range (0–6, enum congelado) -> undefined. Full-string `Number()` validation,
 * same caveat as `parseOptionalCost` — `parseFloat('2CUP')` would be `2`, so the bare
 * `Number(raw)` gate rejects malformed cells instead of silently accepting them. The
 * value is cast to `Currency` only AFTER range validation, keeping unknown values at
 * `undefined` (the consuming sites fall back to `DEFAULT_CURRENCY`).
 */
function parseOptionalCurrency(raw: string): Currency | undefined {
  if (!raw) return undefined;
  if (isNaN(Number(raw))) return undefined;
  const value = parseFloat(raw);
  if (!Number.isInteger(value)) return undefined;
  if (value < 0 || value > 6) return undefined;
  return value as Currency;
}

/**
 * MultiMonedas CSV (2026-09-22): columnas de moneda por NOMBRE
 * (`precio_moneda`/`precio_costo`), validadas SIN distinción de mayúsculas:
 * "usd" -> Currency.USD. Acepta el código exacto (usd/Usd/USD) o el nombre
 * del miembro del enum ("Currency.USD"). Desconocida -> undefined -> CUP
 * (dominio default) — nunca un error, nunca descarta la fila, igual que la
 * columna numérica previa.
 */
export function parseCurrencyByName(raw: string): Currency | undefined {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return undefined;
  const direct = (Currency as unknown as Record<string, Currency | undefined>)[normalized];
  if (direct !== undefined) return direct;
  const dotted = normalized.split('.');
  if (dotted.length === 2) {
    const member = (Currency as unknown as Record<string, Currency | undefined>)[dotted[1]!];
    if (member !== undefined) return member;
  }
  return undefined;
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

  const nameIdx = indexOfHeader(headers, 'nombre', 'name');
  const priceIdx = indexOfHeader(headers, 'precio', 'price');
  const categoryIdx = indexOfHeader(headers, 'categoria', 'category');
  const costIdx = indexOfHeader(headers, 'costo', 'cost');
  const quantityIdx = indexOfHeader(headers, 'cantidad', 'quantity');
  const currencyIdx = indexOfHeader(headers, 'moneda', 'currency');
  // MultiMonedas CSV (2026-09-22): las DOS columnas nuevas viven "al lado de
  // cantidad" — `precio_moneda` (moneda del precio) y `precio_costo` (moneda
  // del costo). El alias `moneda` legacy sigue resolviendo `currency` (compat
  // con el plan 2026-09-16) y NO matchea `precio_moneda` porque indexOfHeader
  // compara la celda completa.
  const priceCurrencyIdx = indexOfHeader(headers, 'precio_moneda', 'price_currency');
  const costCurrencyIdx = indexOfHeader(headers, 'precio_costo', 'cost_currency');

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

    // --- Optional currency (React-only, currency-in-costs-and-prices plan 2026-09-16) ---
    const currency = parseOptionalCurrency(currencyIdx >= 0 ? (fields[currencyIdx] ?? '') : '');

    // --- MultiMonedas CSV (2026-09-22): monedas por NOMBRE, case-insensitive ---
    const priceCurrency = parseCurrencyByName(priceCurrencyIdx >= 0 ? (fields[priceCurrencyIdx] ?? '') : '');
    const costCurrency = parseCurrencyByName(costCurrencyIdx >= 0 ? (fields[costCurrencyIdx] ?? '') : '');
    // La columna legacy `moneda` alimenta el precio SOLO si la nueva
    // `precio_moneda` no vino — ambas describen el precio.
    const resolvedCurrency = priceCurrency ?? currency;

    products.push({ name, price, category, cost, quantity, currency: resolvedCurrency, costCurrency });
  }

  return { products, errors };
}
