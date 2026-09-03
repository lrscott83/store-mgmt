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

  describe('CSV-07: cost/quantity optional columns (REQ-1)', () => {
    it('parses cost and quantity when both columns are present with valid values', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120,10'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBe(120);
      expect(result.products[0].quantity).toBe(10);
    });

    it('resolves cost and quantity to undefined when the columns are absent entirely', () => {
      const csv = ['category,name,price', 'Pizzas,Pizza de Queso,150'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBeUndefined();
      expect(result.products[0].quantity).toBeUndefined();
      expect(result.errors).toHaveLength(0);
    });

    it('resolves cost to undefined when the cost cell is empty', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,,10'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBeUndefined();
      expect(result.products[0].quantity).toBe(10);
    });

    it('resolves quantity to undefined when the quantity cell is empty', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120,'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBe(120);
      expect(result.products[0].quantity).toBeUndefined();
    });

    it('treats cost="0" as a valid explicit zero, not absent', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,0,10'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBe(0);
    });

    it('parses quantity="0" successfully at the parse level (REQ-3 governs entry creation)', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120,0'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].quantity).toBe(0);
    });

    it('parses quantity="-3" as a negative number at the parse level', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120,-3'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].quantity).toBe(-3);
    });

    it('resolves cost to undefined for a non-numeric value ("15O")', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,15O,10'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBeUndefined();
    });

    it('resolves quantity to undefined for a non-numeric value ("15O")', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120,15O'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].quantity).toBeUndefined();
    });

    it('truncates a decimal quantity via parseInt semantics (2.5 -> 2)', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120,2.5'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].quantity).toBe(2);
    });

    it('truncates a decimal quantity below 1 to 0 (0.4 -> 0)', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120,0.4'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].quantity).toBe(0);
    });

    it('trims leading/trailing whitespace from cost', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150, 120 ,10'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBe(120);
    });

    it('trims leading/trailing whitespace from quantity', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,120, 10 '].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].quantity).toBe(10);
    });

    it('supports decimal cost without truncation (119.99)', () => {
      const csv = ['category,name,price,cost,quantity', 'Pizzas,Pizza de Queso,150,119.99,10'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0].cost).toBe(119.99);
    });

    it('is observably identical for a legacy 3-column CSV (no cost/quantity columns)', () => {
      const csv = [
        'category,name,price',
        'Bebidas,Coca Cola,1.50',
        'Bebidas,Pepsi,1.20',
        'Snacks,Chips,10',
      ].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.products[0]).toMatchObject({ name: 'Coca Cola', price: 1.5, category: 'Bebidas' });
      expect(result.products[0].cost).toBeUndefined();
      expect(result.products[0].quantity).toBeUndefined();
    });

    it('matches cost/quantity by header name regardless of column order', () => {
      const csv = ['quantity,cost,category,name,price', '10,120,Pizzas,Pizza de Queso,150'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0]).toMatchObject({
        name: 'Pizza de Queso',
        price: 150,
        category: 'Pizzas',
        cost: 120,
        quantity: 10,
      });
    });
  });

  describe('CSV-08: Spanish headers are canonical (categoria,nombre,precio,costo,cantidad)', () => {
    it('parses the exact 5-column sample template shown in the importer', () => {
      const csv = [
        'categoria,nombre,precio,costo,cantidad',
        'Pizzas,Pizza de Queso,150,100,10',
        'Pizzas,Pizza Especial,200,140,5',
        'Confituras,Caramelo,20,12,50',
      ].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.products[0]).toMatchObject({
        category: 'Pizzas',
        name: 'Pizza de Queso',
        price: 150,
        cost: 100,
        quantity: 10,
      });
    });

    it('is case-insensitive for Spanish headers', () => {
      const csv = ['CATEGORIA,NOMBRE,PRECIO,COSTO,CANTIDAD', 'Bebidas,Coca Cola,1.50,1,2'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.products[0]).toMatchObject({
        category: 'Bebidas',
        name: 'Coca Cola',
        price: 1.5,
        cost: 1,
        quantity: 2,
      });
    });

    it('matches Spanish headers by name regardless of column order', () => {
      const csv = ['cantidad,costo,categoria,nombre,precio', '10,120,Pizzas,Pizza de Queso,150'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products[0]).toMatchObject({
        name: 'Pizza de Queso',
        price: 150,
        category: 'Pizzas',
        cost: 120,
        quantity: 10,
      });
    });

    it('falls back to the required-field validations identically for Spanish headers', () => {
      const csv = ['categoria,nombre,precio,costo,cantidad', 'Pizzas,Pizza de Queso,,100,10'].join('\n');
      const result = parseCsvProducts(csv);
      expect(result.products).toHaveLength(0);
      expect(result.errors[0].errorCode).toBe('MISSING_PRICE');
    });
  });
});
