import { beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import { ProductOfflineService } from '../product-offline-service';

const makeProduct = (overrides: Partial<Product> = {}): Omit<Product, 'id'> & { id?: string } => ({
  name: 'Coca Cola',
  barcode: '123456',
  categoryId: 'cat-1',
  categoryName: 'Bebidas',
  price: 1.5,
  order: 1,
  availableToSale: true,
  discountFromInvantory: false,
  businessId: '',
  isActive: true,
  createdDate: new Date('2024-01-01T00:00:00.000Z'),
  createdByName: 'test',
  ...overrides,
});

describe('ProductOfflineService', () => {
  let service: ProductOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    service = new ProductOfflineService(storeId);
  });

  describe('PROD-01: create persists product to localStorage', () => {
    it('returns the created product with a generated id', () => {
      const product = service.create(makeProduct());
      expect(product.id).toBeTruthy();
      expect(product.name).toBe('Coca Cola');
    });

    it('persists the product to localStorage', () => {
      service.create(makeProduct());
      const raw = localStorage.getItem('lizoft.store-products-s1');
      expect(raw).not.toBeNull();
    });

    it('can retrieve the created product by id', () => {
      const created = service.create(makeProduct());
      const found = service.getById(created.id);
      expect(found?.name).toBe('Coca Cola');
    });

    it('creates two products with distinct ids', () => {
      const p1 = service.create(makeProduct({ name: 'Fanta' }));
      const p2 = service.create(makeProduct({ name: 'Sprite' }));
      expect(p1.id).not.toBe(p2.id);
    });
  });

  describe('PROD-02: getByBarcode returns the correct product', () => {
    it('returns the product with matching barcode', () => {
      service.create(makeProduct({ barcode: 'ABC123' }));
      const found = service.getByBarcode('ABC123');
      expect(found).not.toBeUndefined();
      expect(found?.barcode).toBe('ABC123');
    });

    it('returns undefined for unknown barcode', () => {
      service.create(makeProduct({ barcode: 'ABC123' }));
      const found = service.getByBarcode('UNKNOWN');
      expect(found).toBeUndefined();
    });

    it('returns undefined when barcode is empty', () => {
      const found = service.getByBarcode('');
      expect(found).toBeUndefined();
    });
  });

  describe('PROD-03: updateMany updates multiple products', () => {
    it('updates all provided products in a single batch', () => {
      const p1 = service.create(makeProduct({ name: 'Fanta', price: 1.0 }));
      const p2 = service.create(makeProduct({ name: 'Sprite', price: 1.5 }));

      service.updateMany([
        { ...p1, price: 2.0 },
        { ...p2, price: 3.0 },
      ]);

      expect(service.getById(p1.id)?.price).toBe(2.0);
      expect(service.getById(p2.id)?.price).toBe(3.0);
    });

    it('does not delete other products when calling updateMany', () => {
      const p1 = service.create(makeProduct({ name: 'Fanta' }));
      const p2 = service.create(makeProduct({ name: 'Sprite' }));
      const p3 = service.create(makeProduct({ name: 'Pepsi' }));

      service.updateMany([{ ...p1, price: 9.9 }]);

      expect(service.getById(p2.id)).not.toBeUndefined();
      expect(service.getById(p3.id)).not.toBeUndefined();
    });
  });

  describe('PROD-04: getAll returns all products', () => {
    it('returns empty array when no products', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('returns all created products', () => {
      service.create(makeProduct({ name: 'Fanta' }));
      service.create(makeProduct({ name: 'Sprite' }));
      expect(service.getAll()).toHaveLength(2);
    });
  });

  describe('PROD-05: update', () => {
    it('updates a product field', () => {
      const created = service.create(makeProduct({ price: 1.0 }));
      service.update({ ...created, price: 5.0 });
      expect(service.getById(created.id)?.price).toBe(5.0);
    });
  });

  describe('PROD-06: delete', () => {
    it('removes a product by id', () => {
      const created = service.create(makeProduct());
      service.delete(created.id);
      expect(service.getById(created.id)).toBeUndefined();
    });
  });

  describe('PROD-07: search', () => {
    it('returns products matching name query', () => {
      service.create(makeProduct({ name: 'Coca Cola' }));
      service.create(makeProduct({ name: 'Pepsi' }));
      const results = service.search('coca');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Coca Cola');
    });

    it('returns all active products for empty query', () => {
      service.create(makeProduct({ name: 'Coca Cola' }));
      service.create(makeProduct({ name: 'Pepsi' }));
      const results = service.search('');
      expect(results).toHaveLength(2);
    });
  });

  describe('PROD-08: storage key', () => {
    it('uses the correct localStorage key pattern', () => {
      service.create(makeProduct());
      const raw = localStorage.getItem('lizoft.store-products-s1');
      expect(raw).not.toBeNull();
    });
  });
});
