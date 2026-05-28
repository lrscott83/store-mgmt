import { beforeEach, describe, expect, it } from 'vitest';
import { ProductCategoryOfflineService } from '../product-category-offline-service';

describe('ProductCategoryOfflineService', () => {
  let service: ProductCategoryOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
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
});
