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

    it('handles CSV without the optional category column', () => {
      const csv = ['name,price', 'Fanta,2.00'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(1);
      expect(result.products[0].name).toBe('Fanta');
      expect(result.products[0].price).toBe(2.0);
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
      const csv = ['name,price', 'Coca Cola,1.50', '', 'Pepsi,1.20'].join('\n');
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
      const csv = ['name,price', 'Product,2'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].price).toBe(2);
    });

    it('handles leading/trailing whitespace in fields', () => {
      const csv = ['name,price', ' Coca Cola , 1.50 '].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].name).toBe('Coca Cola');
      expect(result.products[0].price).toBe(1.5);
    });
  });
});
