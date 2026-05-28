import { beforeEach, describe, expect, it } from 'vitest';
import { BaseRepository } from '../base-repository';

interface TestEntity {
  id: string;
  name: string;
  createdAt?: Date;
}

describe('BaseRepository', () => {
  let repo: BaseRepository<TestEntity>;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    repo = new BaseRepository<TestEntity>('products');
  });

  describe('OFFL-01: Save and retrieve an entity', () => {
    it('saves an entity and retrieves it by id', () => {
      repo.upsert(storeId, { id: 'p1', name: 'Milk' });
      const result = repo.getById(storeId, 'p1');
      expect(result).toEqual({ id: 'p1', name: 'Milk' });
    });

    it('uses the correct localStorage key pattern', () => {
      repo.upsert(storeId, { id: 'p1', name: 'Milk' });
      const raw = localStorage.getItem('lizoft.store-products-s1');
      expect(raw).not.toBeNull();
    });

    it('getAll returns all saved entities as a Map', () => {
      repo.upsert(storeId, { id: 'p1', name: 'Milk' });
      repo.upsert(storeId, { id: 'p2', name: 'Bread' });
      const all = repo.getAll(storeId);
      expect(all.size).toBe(2);
      expect(all.get('p1')).toEqual({ id: 'p1', name: 'Milk' });
      expect(all.get('p2')).toEqual({ id: 'p2', name: 'Bread' });
    });

    it('save (bulk) replaces all entities', () => {
      const map = new Map<string, TestEntity>();
      map.set('p1', { id: 'p1', name: 'Milk' });
      map.set('p2', { id: 'p2', name: 'Bread' });
      repo.save(storeId, map);
      const all = repo.getAll(storeId);
      expect(all.size).toBe(2);
    });
  });

  describe('OFFL-01: Date field revival', () => {
    it('revives date fields as Date instances on deserialization', () => {
      const dateRepo = new BaseRepository<TestEntity>('products', ['createdAt']);
      const now = new Date('2024-01-15T10:00:00.000Z');
      dateRepo.upsert(storeId, { id: 'p1', name: 'Milk', createdAt: now });

      const result = dateRepo.getById(storeId, 'p1');
      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.createdAt?.toISOString()).toBe(now.toISOString());
    });
  });

  describe('OFFL-01: Delete entity', () => {
    it('removes an entity by id', () => {
      repo.upsert(storeId, { id: 'p1', name: 'Milk' });
      repo.remove(storeId, 'p1');
      expect(repo.getById(storeId, 'p1')).toBeUndefined();
    });

    it('localStorage no longer contains the entry after remove', () => {
      repo.upsert(storeId, { id: 'p1', name: 'Milk' });
      repo.upsert(storeId, { id: 'p2', name: 'Bread' });
      repo.remove(storeId, 'p1');
      const raw = localStorage.getItem('lizoft.store-products-s1');
      const parsed = JSON.parse(raw!);
      const map = new Map<string, TestEntity>(parsed);
      expect(map.has('p1')).toBe(false);
      expect(map.has('p2')).toBe(true);
    });

    it('clear removes all entities for a store', () => {
      repo.upsert(storeId, { id: 'p1', name: 'Milk' });
      repo.clear(storeId);
      expect(repo.getAll(storeId).size).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('returns empty Map when localStorage key does not exist', () => {
      const all = repo.getAll('unknown-store');
      expect(all).toBeInstanceOf(Map);
      expect(all.size).toBe(0);
    });

    it('returns undefined for missing id', () => {
      expect(repo.getById(storeId, 'nonexistent')).toBeUndefined();
    });
  });
});
