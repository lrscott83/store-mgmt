export interface ParsedProductRow {
  name: string;
  price: number;
  barcode?: string;
  category?: string;
}

export type CsvRowErrorCode = 'MISSING_NAME' | 'MISSING_PRICE' | 'INVALID_PRICE' | 'DUPLICATE_BARCODE';

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

export function parseCsvProducts(csvText: string, existingBarcodes: string[]): CsvParseResult {
  const products: ParsedProductRow[] = [];
  const errors: CsvRowError[] = [];

  const lines = csvText.split('\n');
  if (lines.length === 0) return { products, errors };

  // Find header row — first non-empty line
  let headerIndex = 0;
  while (headerIndex < lines.length && lines[headerIndex].trim() === '') {
    headerIndex++;
  }
  if (headerIndex >= lines.length) return { products, errors };

  const headerLine = lines[headerIndex];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  const nameIdx = headers.indexOf('name');
  const priceIdx = headers.indexOf('price');
  const barcodeIdx = headers.indexOf('barcode');
  const categoryIdx = headers.indexOf('category');

  // Track barcodes seen in this CSV to detect intra-file duplicates
  const seenBarcodes = new Set<string>(existingBarcodes);

  let dataRowNum = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    dataRowNum++;
    const fields = line.split(',').map((f) => f.trim());

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

    // --- Validate barcode uniqueness ---
    const rawBarcode = barcodeIdx >= 0 ? (fields[barcodeIdx] ?? '') : '';
    const barcode = rawBarcode || undefined;
    if (barcode) {
      if (seenBarcodes.has(barcode)) {
        errors.push({ row: dataRowNum, errorCode: 'DUPLICATE_BARCODE' });
        continue;
      }
      seenBarcodes.add(barcode);
    }

    // --- Optional category ---
    const category = categoryIdx >= 0 ? (fields[categoryIdx] ?? '') || undefined : undefined;

    products.push({ name, price, barcode, category });
  }

  return { products, errors };
}
