import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryRepository } from '../inventory-repository';
import type { InventoryEntry } from '@store-mgmt/domain';

const makeEntry = (id: string, productId: string, overrides: Partial<InventoryEntry> = {}): InventoryEntry => ({
  id,
  productId,
  categoryId: 'cat-1',
  quantity: 10,
  available: 10,
  costPrice: 2.5,
  date: new Date('2024-01-15T10:00:00.000Z'),
  order: 0,
  isActive: true,
  createdDate: new Date('2024-01-15T10:00:00.000Z'),
  createdByName: 'test',
  ...overrides,
});

describe('InventoryRepository', () => {
  let repo: InventoryRepository;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    repo = new InventoryRepository(storeId);
  });

  describe('INV-REPO-01: Storage key', () => {
    it('uses the correct localStorage key pattern', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [makeEntry('e1', 'prod-1')]);
      repo.saveAll(storeId, map);
      const raw = localStorage.getItem('lizoft.store-inventory-entries-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('INV-REPO-02: Serialization roundtrip', () => {
    it('serializes and deserializes a Map correctly', () => {
      const entry1 = makeEntry('e1', 'prod-1');
      const entry2 = makeEntry('e2', 'prod-2');
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [entry1]);
      map.set('prod-2', [entry2]);

      repo.saveAll(storeId, map);
      const loaded = repo.getAll(storeId);

      expect(loaded.size).toBe(2);
      expect(loaded.get('prod-1')).toHaveLength(1);
      expect(loaded.get('prod-2')).toHaveLength(1);
    });

    it('serializes as Array.from(map.entries()) format', () => {
      const entry = makeEntry('e1', 'prod-1');
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [entry]);
      repo.saveAll(storeId, map);

      const raw = localStorage.getItem('lizoft.store-inventory-entries-s1');
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveLength(2);
      expect(parsed[0][0]).toBe('prod-1');
    });

    it('revives date fields as Date instances on deserialization', () => {
      const entry = makeEntry('e1', 'prod-1', {
        date: new Date('2024-03-10T08:00:00.000Z'),
      });
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [entry]);
      repo.saveAll(storeId, map);

      const loaded = repo.getAll(storeId);
      const loadedEntry = loaded.get('prod-1')![0];
      expect(loadedEntry.date).toBeInstanceOf(Date);
      expect(loadedEntry.date.toISOString()).toBe('2024-03-10T08:00:00.000Z');
    });
  });

  describe('INV-REPO-03: getByProductId', () => {
    it('returns entries for a specific productId', () => {
      const entry1 = makeEntry('e1', 'prod-1', { order: 0 });
      const entry2 = makeEntry('e2', 'prod-1', { order: 1 });
      const entry3 = makeEntry('e3', 'prod-2');
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [entry1, entry2]);
      map.set('prod-2', [entry3]);
      repo.saveAll(storeId, map);

      const result = repo.getByProductId(storeId, 'prod-1');
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toContain('e1');
      expect(result.map((e) => e.id)).toContain('e2');
    });

    it('returns empty array for unknown productId', () => {
      const result = repo.getByProductId(storeId, 'unknown');
      expect(result).toEqual([]);
    });
  });

  describe('INV-REPO-04: save (single product entries)', () => {
    it('overwrites entries for a specific productId', () => {
      const entry1 = makeEntry('e1', 'prod-1');
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [entry1]);
      repo.saveAll(storeId, map);

      const entry2 = makeEntry('e2', 'prod-1');
      repo.save(storeId, 'prod-1', [entry2]);

      const result = repo.getByProductId(storeId, 'prod-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e2');
    });

    it('does not affect other productId entries when saving one product', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [makeEntry('e1', 'prod-1')]);
      map.set('prod-2', [makeEntry('e2', 'prod-2')]);
      repo.saveAll(storeId, map);

      repo.save(storeId, 'prod-1', [makeEntry('e3', 'prod-1')]);

      const prod2Entries = repo.getByProductId(storeId, 'prod-2');
      expect(prod2Entries).toHaveLength(1);
      expect(prod2Entries[0].id).toBe('e2');
    });
  });

  describe('INV-REPO-05: remove', () => {
    it('removes all entries for a specific productId', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [makeEntry('e1', 'prod-1')]);
      map.set('prod-2', [makeEntry('e2', 'prod-2')]);
      repo.saveAll(storeId, map);

      repo.remove(storeId, 'prod-1');

      expect(repo.getByProductId(storeId, 'prod-1')).toEqual([]);
      expect(repo.getByProductId(storeId, 'prod-2')).toHaveLength(1);
    });
  });

  describe('INV-REPO-06: getAll returns full map', () => {
    it('returns empty Map when nothing is stored', () => {
      const result = repo.getAll(storeId);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('returns all products with their entries', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [makeEntry('e1', 'prod-1'), makeEntry('e2', 'prod-1')]);
      map.set('prod-2', [makeEntry('e3', 'prod-2')]);
      repo.saveAll(storeId, map);

      const result = repo.getAll(storeId);
      expect(result.size).toBe(2);
      expect(result.get('prod-1')).toHaveLength(2);
      expect(result.get('prod-2')).toHaveLength(1);
    });
  });

  describe('INV-REPO-07: clear', () => {
    it('removes all inventory data for a store', () => {
      const map = new Map<string, InventoryEntry[]>();
      map.set('prod-1', [makeEntry('e1', 'prod-1')]);
      repo.saveAll(storeId, map);

      repo.clear(storeId);
      expect(repo.getAll(storeId).size).toBe(0);
    });
  });
});
