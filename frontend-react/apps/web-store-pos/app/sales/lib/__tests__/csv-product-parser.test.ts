import { describe, expect, it } from 'vitest';
import { parseCsvProducts } from '../csv-product-parser';

describe('parseCsvProducts', () => {
  describe('CSV-01: valid rows are parsed correctly', () => {
    it('parses a simple CSV with header row', () => {
      const csv = ['name,price,category', 'Coca Cola,1.50,Bebidas', 'Pepsi,1.20,Bebidas'].join('\n');

      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.products[0]).toMatchObject({ name: 'Coca Cola', price: 1.5, category: 'Bebidas' });
      expect(result.products[1]).toMatchObject({ name: 'Pepsi', price: 1.2, category: 'Bebidas' });
    });

    it('does not carry a barcode field (Flag #2 RATIFIED: no CSV barcode column)', () => {
      const csv = ['name,price,category', 'Coca Cola,1.50,Bebidas'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0]).not.toHaveProperty('barcode');
    });

    it('parses a quoted field containing an internal comma as a single field (papaparse parity)', () => {
      // Angular gets RFC4180 quote-aware parsing for free from `Papa.parse`
      // (frontend/src/app/_services/csv/csv-product.service.ts:12-15). React's parser must
      // replicate that so `"Coca, Cola"` is ONE field, not split into two by the naive comma.
      const csv = ['name,price,category', '"Coca, Cola",1.50,Bebidas'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.products[0]).toMatchObject({ name: 'Coca, Cola', price: 1.5, category: 'Bebidas' });
    });
  });

  describe('CSV-04: category is required (Angular parity)', () => {
    // frontend/src/app/_services/csv/csv-product.service.ts:26-34 `validateProducts`:
    // `item['category'] && item['name'] && typeof item['price'] === 'number'` — category is a
    // REQUIRED field, exactly like `name` and `price`, not an optional one.
    it('rejects a row with an empty category value', () => {
      const csv = ['name,price,category', 'Coca Cola,1.50,'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(1);
      expect(result.errors[0].errorCode).toBe('MISSING_CATEGORY');
    });

    it('rejects every row when the CSV has no category column at all', () => {
      const csv = ['name,price', 'Fanta,2.00'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('MISSING_CATEGORY');
    });

    it('still prioritizes MISSING_NAME over MISSING_CATEGORY when both are absent', () => {
      const csv = ['name,price', ',1.50'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('MISSING_NAME');
    });

    it('still prioritizes price errors over MISSING_CATEGORY when both are absent', () => {
      const csv = ['name,price', 'Fanta,abc'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('INVALID_PRICE');
    });
  });

  describe('CSV-02: missing price generates an error', () => {
    it('marks a row as error when price is empty', () => {
      const csv = ['name,price,category', 'Coca Cola,,Bebidas'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(1);
      // errorCode (not a hardcoded English message) — the component maps this to the
      // existing PRODUCTS.CSV.ERROR.MISSING_PRICE Spanish i18n key.
      expect(result.errors[0].errorCode).toBe('MISSING_PRICE');
    });

    it('marks a row as error when price is not a number', () => {
      const csv = ['name,price', 'Fanta,abc'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('INVALID_PRICE');
    });
  });

  describe('CSV-03: missing name generates an error', () => {
    it('marks a row as error when name is empty', () => {
      const csv = ['name,price', ',1.50'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('MISSING_NAME');
    });
  });

  describe('CSV-05: empty rows are skipped', () => {
    it('skips blank lines in the CSV', () => {
      const csv = ['name,price,category', 'Coca Cola,1.50,Bebidas', '', 'Pepsi,1.20,Bebidas'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('returns empty when only blank rows (no header)', () => {
      const result = parseCsvProducts('\n\n\n');
      expect(result.products).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('CSV-06: price parsing edge cases', () => {
    it('parses integer prices correctly', () => {
      const csv = ['name,price,category', 'Product,2,Varios'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].price).toBe(2);
    });

    it('handles leading/trailing whitespace in fields', () => {
      const csv = ['name,price,category', ' Coca Cola , 1.50 , Bebidas '].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].name).toBe('Coca Cola');
      expect(result.products[0].price).toBe(1.5);
    });
  });
});
