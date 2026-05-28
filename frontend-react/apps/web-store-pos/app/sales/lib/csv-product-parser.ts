export interface ParsedProductRow {
  name: string;
  price: number;
  barcode?: string;
  category?: string;
}

export interface CsvRowError {
  row: number;
  message: string;
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
      errors.push({ row: dataRowNum, message: 'Missing name: name is required' });
      continue;
    }

    // --- Validate price ---
    const rawPrice = priceIdx >= 0 ? (fields[priceIdx] ?? '') : (fields[1] ?? '');
    if (!rawPrice) {
      errors.push({ row: dataRowNum, message: 'Missing price: price is required' });
      continue;
    }
    const price = parseFloat(rawPrice);
    if (isNaN(price)) {
      errors.push({ row: dataRowNum, message: 'Invalid price: price must be a number' });
      continue;
    }

    // --- Validate barcode uniqueness ---
    const rawBarcode = barcodeIdx >= 0 ? (fields[barcodeIdx] ?? '') : '';
    const barcode = rawBarcode || undefined;
    if (barcode) {
      if (seenBarcodes.has(barcode)) {
        errors.push({ row: dataRowNum, message: 'Duplicate barcode: barcode already exists' });
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
