import { beforeEach, describe, expect, it } from 'vitest';
import type { Product, UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '../product-offline-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

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
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
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

    // Angular parity (audit-user-threading-followup): create stamps createdByName
    // from the authenticated user's login, mirroring ExpenseOfflineService.create.
    it('stamps createdByName with the authenticated user login on create', () => {
      const created = service.create(makeProduct());
      expect(created.createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on create', () => {
      const created = service.create(makeProduct());
      expect(created.updatedByName).toBeUndefined();
      expect(created.updatedDate).toBeUndefined();
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

    // Angular parity (audit-user-threading-followup): updateMany stamps
    // updatedByName on every product in the batch, mirroring update().
    it('stamps updatedByName on every product in the batch', () => {
      const p1 = service.create(makeProduct({ name: 'Fanta' }));
      const p2 = service.create(makeProduct({ name: 'Sprite' }));

      service.updateMany([
        { ...p1, price: 2.0 },
        { ...p2, price: 3.0 },
      ]);

      expect(service.getById(p1.id)?.updatedByName).toBe('jdoe');
      expect(service.getById(p2.id)?.updatedByName).toBe('jdoe');
    });

    it('stamps the same updatedDate on every product in the batch', () => {
      const p1 = service.create(makeProduct({ name: 'Fanta' }));
      const p2 = service.create(makeProduct({ name: 'Sprite' }));

      service.updateMany([
        { ...p1, price: 2.0 },
        { ...p2, price: 3.0 },
      ]);

      const d1 = service.getById(p1.id)?.updatedDate;
      const d2 = service.getById(p2.id)?.updatedDate;
      expect(d1).toBeInstanceOf(Date);
      expect(d1?.getTime()).toBe(d2?.getTime());
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

    // Angular parity (audit-user-threading-followup): update stamps updatedByName
    // from the authenticated user's login, mirroring ExpenseOfflineService.update.
    it('stamps updatedByName with the authenticated user login on update', () => {
      const created = service.create(makeProduct());
      const updated = service.update({ ...created, price: 9.0 });
      expect(updated.updatedByName).toBe('jdoe');
    });

    it('sets updatedDate to a Date instance on update', () => {
      const created = service.create(makeProduct());
      const updated = service.update({ ...created, price: 9.0 });
      expect(updated.updatedDate).toBeInstanceOf(Date);
    });

    it('does not change createdByName/createdDate on update', () => {
      const created = service.create(makeProduct());
      const updated = service.update({ ...created, price: 9.0 });
      expect(updated.createdByName).toBe(created.createdByName);
      expect(updated.createdDate).toEqual(created.createdDate);
    });
  });

  describe('PROD-06: delete', () => {
    // Angular parity (audit-user-threading-followup, ADR-3): deleteProduct
    // soft-deletes (isActive=false), it does NOT remove the record — required
    // for sync propagation, mirrors ExpenseOfflineService.delete.
    it('soft-deletes a product (isActive=false, record retained)', () => {
      const created = service.create(makeProduct());
      service.delete(created.id);
      const all = service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(created.id);
      expect(service.getById(created.id)?.isActive).toBe(false);
    });

    it('stamps updatedByName with the authenticated user login on delete', () => {
      const created = service.create(makeProduct());
      service.delete(created.id);
      expect(service.getById(created.id)?.updatedByName).toBe('jdoe');
    });

    it('sets updatedDate to a Date instance on delete', () => {
      const created = service.create(makeProduct());
      service.delete(created.id);
      expect(service.getById(created.id)?.updatedDate).toBeInstanceOf(Date);
    });

    it('is a no-op for a missing id (no throw)', () => {
      service.create(makeProduct());
      expect(() => service.delete('nonexistent-id')).not.toThrow();
      expect(service.getAll()).toHaveLength(1);
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

  describe('PROD-09: getByName', () => {
    it('returns the product with an exact name match, including inactive products', () => {
      service.create(makeProduct({ name: 'Coca Cola', isActive: false }));
      const found = service.getByName('Coca Cola');
      expect(found).not.toBeUndefined();
      expect(found?.name).toBe('Coca Cola');
    });

    it('returns the first match when duplicate names exist', () => {
      const p1 = service.create(makeProduct({ name: 'Dup' }));
      service.create(makeProduct({ name: 'Dup' }));
      const found = service.getByName('Dup');
      expect(found?.id).toBe(p1.id);
    });

    it('returns undefined for unknown name', () => {
      service.create(makeProduct({ name: 'Coca Cola' }));
      expect(service.getByName('Unknown')).toBeUndefined();
    });
  });

  describe('PROD-10: getMaxOrder', () => {
    it('returns 0 when the category has no products', () => {
      expect(service.getMaxOrder('empty-cat')).toBe(0);
    });

    it('returns the max order among all products (active+inactive) in the category', () => {
      service.create(makeProduct({ categoryId: 'cat-a', order: 1 }));
      service.create(makeProduct({ categoryId: 'cat-a', order: 5, isActive: false }));
      service.create(makeProduct({ categoryId: 'cat-b', order: 9 }));
      expect(service.getMaxOrder('cat-a')).toBe(5);
    });
  });

  describe('PROD-11: getAvailableProductsByCategoryId', () => {
    it('returns only isActive products for the given category, regardless of availableToSale', () => {
      service.create(makeProduct({ categoryId: 'cat-a', order: 2, isActive: true, availableToSale: false }));
      service.create(makeProduct({ categoryId: 'cat-a', order: 1, isActive: true, availableToSale: true }));
      service.create(makeProduct({ categoryId: 'cat-a', order: 0, isActive: false }));
      service.create(makeProduct({ categoryId: 'cat-b', order: 0, isActive: true }));

      const results = service.getAvailableProductsByCategoryId('cat-a');
      expect(results).toHaveLength(2);
      expect(results.map((p) => p.order)).toEqual([1, 2]);
    });

    it('returns empty array when no products match', () => {
      expect(service.getAvailableProductsByCategoryId('none')).toEqual([]);
    });
  });

  describe('PROD-12: activate/deactivate', () => {
    it('deactivate sets isActive=false without stamping updatedDate/updatedByName', () => {
      const created = service.create(makeProduct({ isActive: true }));
      service.deactivate(created.id);
      const found = service.getById(created.id);
      expect(found?.isActive).toBe(false);
      expect(found?.updatedDate).toBeUndefined();
      expect(found?.updatedByName).toBeUndefined();
    });

    it('activate sets isActive=true without stamping updatedDate/updatedByName', () => {
      const created = service.create(makeProduct({ isActive: false }));
      service.activate(created.id);
      const found = service.getById(created.id);
      expect(found?.isActive).toBe(true);
      expect(found?.updatedDate).toBeUndefined();
      expect(found?.updatedByName).toBeUndefined();
    });

    it('is a no-op for a missing id (no throw)', () => {
      expect(() => service.activate('missing')).not.toThrow();
      expect(() => service.deactivate('missing')).not.toThrow();
    });
  });
});
