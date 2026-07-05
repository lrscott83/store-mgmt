import { beforeEach, describe, expect, it } from 'vitest';
import type { UserModel } from '@store-mgmt/domain';
import { ProductCategoryOfflineService } from '../product-category-offline-service';
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

describe('ProductCategoryOfflineService', () => {
  let service: ProductCategoryOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true, isLoading: false, error: null });
    service = new ProductCategoryOfflineService(storeId);
  });

  describe('CAT-01: addByName creates a category and returns its id', () => {
    it('returns a non-empty string id', () => {
      const id = service.addByName('Bebidas');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('creates a category that can be retrieved by name', () => {
      service.addByName('Bebidas');
      const cat = service.getByName('Bebidas');
      expect(cat).not.toBeUndefined();
      expect(cat?.name).toBe('Bebidas');
    });

    it('creates a category with isActive=true', () => {
      service.addByName('Bebidas');
      const cat = service.getByName('Bebidas');
      expect(cat?.isActive).toBe(true);
    });

    it('creates two categories with different ids', () => {
      const id1 = service.addByName('Bebidas');
      const id2 = service.addByName('Snacks');
      expect(id1).not.toBe(id2);
    });

    it('assigns incrementing order values to new categories', () => {
      service.addByName('Bebidas');
      service.addByName('Snacks');
      const a = service.getByName('Bebidas');
      const b = service.getByName('Snacks');
      expect(b!.order).toBeGreaterThan(a!.order);
    });
  });

  describe('CAT-02: getByName', () => {
    it('returns undefined for unknown name', () => {
      const cat = service.getByName('Unknown');
      expect(cat).toBeUndefined();
    });

    it('returns the correct category by name', () => {
      service.addByName('Galletas');
      const cat = service.getByName('Galletas');
      expect(cat?.name).toBe('Galletas');
    });
  });

  describe('CAT-03: getAll returns list of categories', () => {
    it('returns empty array when no categories', () => {
      const all = service.getAll();
      expect(all).toEqual([]);
    });

    it('returns all created categories', () => {
      service.addByName('Bebidas');
      service.addByName('Snacks');
      const all = service.getAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('CAT-04: save (upsert)', () => {
    it('creates a new category via save', () => {
      const id = service.addByName('Test');
      const cat = service.getById(id);
      expect(cat).not.toBeUndefined();
      cat!.name = 'Updated';
      service.save(cat!);
      const updated = service.getById(id);
      expect(updated?.name).toBe('Updated');
    });
  });

  describe('CAT-05: delete', () => {
    it('removes a category by id', () => {
      const id = service.addByName('ToDelete');
      service.delete(id);
      const cat = service.getById(id);
      expect(cat).toBeUndefined();
    });
  });

  describe('CAT-06: storage key', () => {
    it('uses the correct localStorage key pattern', () => {
      service.addByName('Test');
      const raw = localStorage.getItem('lizoft.store-product-categories-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('CAT-07: hasAnyCategory', () => {
    it('returns false when no categories exist', () => {
      expect(service.hasAnyCategory()).toBe(false);
    });

    it('returns true when at least one category exists, active or not', () => {
      const id = service.addByName('Bebidas');
      const cat = service.getById(id)!;
      service.save({ ...cat, isActive: false });
      expect(service.hasAnyCategory()).toBe(true);
    });
  });

  describe('CAT-08: hasAnyAvailableCategory', () => {
    it('returns false when no active categories exist', () => {
      const id = service.addByName('Bebidas');
      const cat = service.getById(id)!;
      service.save({ ...cat, isActive: false });
      expect(service.hasAnyAvailableCategory()).toBe(false);
    });

    it('returns true when at least one active category exists', () => {
      service.addByName('Bebidas');
      expect(service.hasAnyAvailableCategory()).toBe(true);
    });
  });

  describe('CAT-09: getMaxOrder (global, distinct from Product per-category getMaxOrder)', () => {
    it('returns 0 when there are no categories', () => {
      expect(service.getMaxOrder()).toBe(0);
    });

    it('returns the global max order across all categories', () => {
      service.addByName('Bebidas');
      service.addByName('Snacks');
      service.addByName('Galletas');
      expect(service.getMaxOrder()).toBe(3);
    });
  });

  describe('CAT-10: getAvailableProductCategories', () => {
    it('returns only active categories, sorted ascending by order', () => {
      const id1 = service.addByName('Bebidas');
      const id2 = service.addByName('Snacks');
      service.addByName('Galletas');
      const cat2 = service.getById(id2)!;
      service.save({ ...cat2, isActive: false });

      const results = service.getAvailableProductCategories();
      expect(results.map((c) => c.name)).toEqual(['Bebidas', 'Galletas']);
      expect(results.every((c) => c.isActive)).toBe(true);
      void id1;
    });
  });

  describe('CAT-11: getAll sort fix — sorted ascending by order (parity fix, not Angular bug)', () => {
    it('returns categories sorted ascending by order regardless of insertion order', () => {
      const idA = service.addByName('C');
      const catA = service.getById(idA)!;
      service.save({ ...catA, order: 3 });

      const idB = service.addByName('A');
      const catB = service.getById(idB)!;
      service.save({ ...catB, order: 1 });

      const idC = service.addByName('B');
      const catC = service.getById(idC)!;
      service.save({ ...catC, order: 2 });

      const all = service.getAll();
      expect(all.map((c) => c.order)).toEqual([1, 2, 3]);
      expect(all.map((c) => c.name)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('CAT-12: getProductCategoriesView', () => {
    it('projects active categories with productsCount using isActive && availableToSale (STRICTER than getAvailableProductsByCategoryId)', () => {
      const catId1 = service.addByName('Bebidas');
      const catId2 = service.addByName('Snacks');
      const catId3 = service.addByName('Inactive');
      const inactiveCat = service.getById(catId3)!;
      service.save({ ...inactiveCat, isActive: false });

      const productService = new ProductOfflineService(storeId);
      // isActive && availableToSale -> counted
      productService.create({
        name: 'Coca Cola',
        barcode: '1',
        categoryId: catId1,
        categoryName: 'Bebidas',
        price: 1,
        order: 1,
        availableToSale: true,
        discountFromInvantory: false,
        businessId: '',
        isActive: true,
      });
      // isActive but NOT availableToSale -> excluded from view count, but INCLUDED
      // by getAvailableProductsByCategoryId (isActive-only) — the trap this test guards.
      const p2 = productService.create({
        name: 'Fanta',
        barcode: '2',
        categoryId: catId1,
        categoryName: 'Bebidas',
        price: 1,
        order: 2,
        availableToSale: false,
        discountFromInvantory: false,
        businessId: '',
        isActive: true,
      });
      // Not active at all -> excluded from both
      productService.create({
        name: 'Sprite',
        barcode: '3',
        categoryId: catId1,
        categoryName: 'Bebidas',
        price: 1,
        order: 3,
        availableToSale: true,
        discountFromInvantory: false,
        businessId: '',
        isActive: false,
      });
      // Category 2 has no products
      void catId2;

      const view = service.getProductCategoriesView();

      expect(view.map((v) => v.name)).toEqual(['Bebidas', 'Snacks']);
      const bebidasView = view.find((v) => v.id === catId1)!;
      expect(bebidasView.productsCount).toBe(1);

      const snacksView = view.find((v) => v.id === catId2)!;
      expect(snacksView.productsCount).toBe(0);

      // The excluded-from-view product IS included by getAvailableProductsByCategoryId
      // (isActive-only predicate) — proving the two predicates are intentionally distinct.
      const availableProducts = productService.getAvailableProductsByCategoryId(catId1);
      expect(availableProducts.map((p) => p.id)).toContain(p2.id);
      expect(availableProducts).toHaveLength(2);
    });

    it('excludes inactive categories entirely from the view result', () => {
      const catId = service.addByName('ActiveCat');
      const inactiveId = service.addByName('InactiveCat');
      const inactiveCat = service.getById(inactiveId)!;
      service.save({ ...inactiveCat, isActive: false });

      const view = service.getProductCategoriesView();
      expect(view.map((v) => v.id)).toEqual([catId]);
    });

    it('returns empty array when there are no active categories', () => {
      expect(service.getProductCategoriesView()).toEqual([]);
    });
  });
});
