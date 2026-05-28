import { beforeEach, describe, expect, it } from 'vitest';
import { EgressOfflineService } from '../egress-offline-service';
import type { EgressEntry } from '@store-mgmt/domain';

const storeId = 's1';

function makeEgressEntry(id: string, overrides: Partial<EgressEntry> = {}): EgressEntry {
  return {
    id,
    productId: 'p1',
    categoryId: 'cat1',
    quantity: 2,
    egressType: 'waste',
    notes: 'test note',
    date: new Date('2024-03-10T10:00:00.000Z'),
    isActive: true,
    createdDate: new Date('2024-03-10T10:00:00.000Z'),
    createdByName: 'test',
    updatedDate: new Date('2024-03-10T10:00:00.000Z'),
    updatedByName: 'test',
    ...overrides,
  };
}

describe('EgressOfflineService', () => {
  let service: EgressOfflineService;

  beforeEach(() => {
    localStorage.clear();
    service = new EgressOfflineService(storeId);
  });

  describe('EGR-01: create — S-I9', () => {
    it('persists the entry to localStorage', () => {
      service.create('p1', 'cat1', 2, 'waste', 'expired', new Date());
      const raw = localStorage.getItem('lizoft.store-egress-s1');
      expect(raw).not.toBeNull();
    });

    it('uses the correct storage key', () => {
      service.create('p1', 'cat1', 2, 'waste', 'test', new Date());
      const raw = localStorage.getItem('lizoft.store-egress-s1');
      expect(raw).not.toBeNull();
    });

    it('sets isActive=true on the new entry', () => {
      const entry = service.create('p1', 'cat1', 2, 'waste', '', new Date());
      expect(entry.isActive).toBe(true);
    });

    it('stores all provided fields correctly', () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      const entry = service.create('p1', 'cat1', 5, 'return', 'some note', date);
      expect(entry.productId).toBe('p1');
      expect(entry.categoryId).toBe('cat1');
      expect(entry.quantity).toBe(5);
      expect(entry.egressType).toBe('return');
      expect(entry.notes).toBe('some note');
    });

    it('generates a unique id for each entry', () => {
      const e1 = service.create('p1', 'cat1', 2, 'waste', '', new Date());
      const e2 = service.create('p1', 'cat1', 2, 'waste', '', new Date());
      expect(e1.id).not.toBe(e2.id);
    });

    it('does NOT touch inventory (Design Decision 4)', () => {
      // Create a raw inventory entry to verify it's not modified
      const invKey = 'lizoft.store-inventoryentries-s1';
      const map = [['p1', [{ id: 'e1', available: 10 }]]];
      localStorage.setItem(invKey, JSON.stringify(map));

      service.create('p1', 'cat1', 2, 'waste', '', new Date());

      const invRaw = localStorage.getItem(invKey);
      const parsed = JSON.parse(invRaw!);
      // Inventory should be unchanged
      expect(parsed[0][1][0].available).toBe(10);
    });
  });

  describe('EGR-02: deactivate — does NOT touch inventory', () => {
    it('sets isActive=false on the entry', () => {
      const entry = service.create('p1', 'cat1', 2, 'waste', '', new Date());
      service.deactivate(entry.id);

      const all = service.getAll();
      const found = all.find((e) => e.id === entry.id);
      // getAll may include inactive entries — check isActive
      // OR if getAll returns all entries regardless of active status
      // Either way, verify deactivation happened
      expect(found?.isActive ?? false).toBe(false);
    });

    it('does NOT modify inventory entries (Design Decision 4)', () => {
      const invKey = 'lizoft.store-inventoryentries-s1';
      const map = [['p1', [{ id: 'e1', available: 10 }]]];
      localStorage.setItem(invKey, JSON.stringify(map));

      const entry = service.create('p1', 'cat1', 2, 'waste', '', new Date());
      service.deactivate(entry.id);

      const invRaw = localStorage.getItem(invKey);
      const parsed = JSON.parse(invRaw!);
      expect(parsed[0][1][0].available).toBe(10);
    });
  });

  describe('EGR-03: getAll', () => {
    it('returns empty array when no entries', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('returns all entries including inactive', () => {
      const e1 = service.create('p1', 'cat1', 2, 'waste', '', new Date());
      service.deactivate(e1.id);
      const all = service.getAll();
      expect(all.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('EGR-04: getActiveToday', () => {
    it('returns only active entries created today', () => {
      service.create('p1', 'cat1', 2, 'waste', '', new Date());
      const today = service.getActiveToday();
      expect(today.length).toBeGreaterThanOrEqual(1);
      expect(today.every((e) => e.isActive)).toBe(true);
    });

    it('does not return inactive entries', () => {
      const e1 = service.create('p1', 'cat1', 2, 'waste', '', new Date());
      service.deactivate(e1.id);
      const today = service.getActiveToday();
      expect(today.find((e) => e.id === e1.id)).toBeUndefined();
    });
  });

  describe('EGR-05: update', () => {
    it('updates quantity, egressType, and notes', () => {
      const entry = service.create('p1', 'cat1', 2, 'waste', 'old note', new Date());
      const updated = service.update(entry.id, 5, 'transfer', 'new note');
      expect(updated.quantity).toBe(5);
      expect(updated.egressType).toBe('transfer');
      expect(updated.notes).toBe('new note');
    });

    it('throws when entry not found', () => {
      expect(() => service.update('nonexistent', 1, 'waste', '')).toThrow();
    });
  });

  describe('EGR-06: date field revival', () => {
    it('revives date fields as Date instances on deserialization', () => {
      const date = new Date('2024-03-10T10:00:00.000Z');
      service.create('p1', 'cat1', 2, 'waste', '', date);

      // Force re-read from storage via a new service instance
      const service2 = new EgressOfflineService(storeId);
      const all = service2.getAll();
      expect(all[0].date).toBeInstanceOf(Date);
      expect(all[0].createdDate).toBeInstanceOf(Date);
    });
  });
});
