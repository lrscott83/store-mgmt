import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductCategory } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '../product-category-repository';
import { EntityUnreadableError } from '~/shared/lib/storage/read-entity-or-throw';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

const storeId = 's1';
const STORAGE_KEY = `lizoft.store-product-categories-${storeId}`;

function makeCategory(id: string, overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id,
    name: `Category ${id}`,
    order: 0,
    isActive: true,
    ...overrides,
  };
}

function seedCategories(categories: ProductCategory[]): void {
  const entries = categories.map((c) => [c.id, c] as [string, ProductCategory]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function readStoredCategories(): ProductCategory[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const entries: [string, ProductCategory][] = JSON.parse(raw);
  return entries.map(([, c]) => c);
}

describe('ProductCategoryRepository — 1:1 port of Angular product-category.repository.ts', () => {
  let repo: ProductCategoryRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new ProductCategoryRepository(storeId);
  });

  // ─── Persistence — Map-entries wire-format, cache, auto-init (inlined, no BaseRepository; product-category.repository.ts:40-45) ─
  describe('Persistence — Map-entries wire-format, cache, auto-init (product-category.repository.ts:40-45)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('persists categories on-disk as Map-entries ([[id, category], ...]), never a plain array of category objects', () => {
      const categories = new Map<string, ProductCategory>([
        ['c1', makeCategory('c1', { name: 'Bebidas' })],
        ['c2', makeCategory('c2', { name: 'Snacks' })],
      ]);
      repo.updateCategories(categories);

      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed.every((entry: unknown) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string')).toBe(
        true,
      );
    });

    it('auto-writes an empty Map-entries array on the first empty read, without throwing', () => {
      expect(() => repo.getStorageCategoriesMap()).not.toThrow();
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBe('[]');
    });

    it('reuses the in-memory cache across two reads without an intervening write (localStorage.getItem hit once)', () => {
      seedCategories([makeCategory('c1')]);
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      repo.getStorageCategoriesMap();
      repo.getStorageCategoriesMap();

      const callsForKey = getItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEY);
      expect(callsForKey).toHaveLength(1);
    });

    it('throws instead of returning an empty map when the stored categories cannot be read', () => {
      localStorage.setItem('lizoft.store-product-categories-s1', 'enc:v1:AAAA');
      const freshRepo = new ProductCategoryRepository('s1');
      expect(() => freshRepo.getProductCategories()).toThrow(MissingDataKeyError);
    });

    it('leaves the unreadable bytes byte-for-byte intact', () => {
      const bytes = 'enc:v1:AAAA';
      localStorage.setItem('lizoft.store-product-categories-s1', bytes);
      const freshRepo = new ProductCategoryRepository('s1');
      expect(() => freshRepo.getProductCategories()).toThrow();
      expect(localStorage.getItem('lizoft.store-product-categories-s1')).toBe(bytes);
    });
  });

  // ─── 1.1 getProductCategoryById ──────────────────────────────────────────
  describe('getProductCategoryById (repo.ts:51-53)', () => {
    it('returns the category when it exists', () => {
      seedCategories([makeCategory('c1', { name: 'Bebidas' })]);
      expect(repo.getProductCategoryById('c1')?.name).toBe('Bebidas');
    });

    it('returns undefined when the category does not exist', () => {
      seedCategories([makeCategory('c1')]);
      expect(repo.getProductCategoryById('nope')).toBeUndefined();
    });
  });

  // ─── 1.2 getProductCategoryByName ────────────────────────────────────────
  describe('getProductCategoryByName (repo.ts:55-57)', () => {
    it('returns the category when a name match exists', () => {
      seedCategories([makeCategory('c1', { name: 'Bebidas' })]);
      expect(repo.getProductCategoryByName('Bebidas')?.id).toBe('c1');
    });

    it('returns undefined when no name match exists', () => {
      seedCategories([makeCategory('c1', { name: 'Bebidas' })]);
      expect(repo.getProductCategoryByName('Snacks')).toBeUndefined();
    });
  });

  // ─── 1.3 getProductCategories ────────────────────────────────────────────
  describe('getProductCategories — ALL, sorted ascending by order (repo.ts:59-61)', () => {
    it('returns every category regardless of isActive', () => {
      seedCategories([
        makeCategory('c1', { isActive: true }),
        makeCategory('c2', { isActive: false }),
      ]);
      expect(repo.getProductCategories()).toHaveLength(2);
    });

    it('sorts ascending by order', () => {
      seedCategories([
        makeCategory('c2', { order: 2 }),
        makeCategory('c1', { order: 1 }),
      ]);
      expect(repo.getProductCategories().map((c) => c.id)).toEqual(['c1', 'c2']);
    });
  });

  // ─── 1.4 getAvailableProductCategories ───────────────────────────────────
  describe('getAvailableProductCategories — isActive-only, sorted (repo.ts:63-65)', () => {
    it('excludes inactive categories', () => {
      seedCategories([
        makeCategory('c1', { isActive: true, order: 2 }),
        makeCategory('c2', { isActive: false, order: 1 }),
      ]);
      const result = repo.getAvailableProductCategories();
      expect(result.map((c) => c.id)).toEqual(['c1']);
    });

    it('sorts ascending by order', () => {
      seedCategories([
        makeCategory('c1', { isActive: true, order: 2 }),
        makeCategory('c2', { isActive: true, order: 1 }),
      ]);
      expect(repo.getAvailableProductCategories().map((c) => c.id)).toEqual(['c2', 'c1']);
    });
  });

  // ─── 1.5 hasAnyCategory / hasAnyAvailableCategory ────────────────────────
  describe('hasAnyCategory (repo.ts:67-69)', () => {
    it('returns false when no categories are stored', () => {
      expect(repo.hasAnyCategory()).toBe(false);
    });

    it('returns true when at least one category is stored (regardless of isActive)', () => {
      seedCategories([makeCategory('c1', { isActive: false })]);
      expect(repo.hasAnyCategory()).toBe(true);
    });
  });

  describe('hasAnyAvailableCategory (repo.ts:25-27)', () => {
    it('returns false when no category is active', () => {
      seedCategories([makeCategory('c1', { isActive: false })]);
      expect(repo.hasAnyAvailableCategory()).toBe(false);
    });

    it('returns true when at least one category is active', () => {
      seedCategories([makeCategory('c1', { isActive: false }), makeCategory('c2', { isActive: true })]);
      expect(repo.hasAnyAvailableCategory()).toBe(true);
    });
  });

  // ─── 1.6 addProductCategory ──────────────────────────────────────────────
  describe('addProductCategory (repo.ts:71-88,109-115) — name-collision, order-shift, no persistence on failure', () => {
    it('fails with NameExists when a category with the same name already exists, without persisting', () => {
      seedCategories([makeCategory('c1', { name: 'Bebidas' })]);
      const result = repo.addProductCategory('Bebidas', 1, true);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NameExists', description: 'El nombre de la categoría ya existe.' }]);
      expect(readStoredCategories()).toHaveLength(1);
    });

    it('creates a new category and returns Success', () => {
      const result = repo.addProductCategory('Snacks', 1, true);
      expect(result.succeeded).toBe(true);
      const stored = readStoredCategories();
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Snacks');
      expect(stored[0].order).toBe(1);
    });

    it('shifts siblings with order >= new order by +1, and the new category lands exactly at the requested order', () => {
      seedCategories([
        makeCategory('c1', { order: 1 }),
        makeCategory('c2', { order: 2 }),
        makeCategory('c3', { order: 3 }),
      ]);
      const result = repo.addProductCategory('New', 2, true);
      expect(result.succeeded).toBe(true);
      const stored = readStoredCategories();
      const byId = new Map(stored.map((c) => [c.id, c]));
      expect(byId.get('c1')?.order).toBe(1);
      expect(byId.get('c2')?.order).toBe(3);
      expect(byId.get('c3')?.order).toBe(4);
      const newCat = stored.find((c) => c.name === 'New');
      expect(newCat?.order).toBe(2);
    });
  });

  // ─── 1.7 addProductCategoryByName ────────────────────────────────────────
  describe('addProductCategoryByName (repo.ts:94-103) — generated id, next order, isActive always true', () => {
    it('creates the category with the next order and isActive true, returning the new id', () => {
      seedCategories([makeCategory('c1', { order: 3 })]);
      const id = repo.addProductCategoryByName('Postres');
      expect(id).not.toBeNull();
      const created = repo.getProductCategoryById(id as string);
      expect(created?.name).toBe('Postres');
      expect(created?.order).toBe(4);
      expect(created?.isActive).toBe(true);
    });

    it('uses order 1 as the next order when no categories exist', () => {
      const id = repo.addProductCategoryByName('First');
      const created = repo.getProductCategoryById(id as string);
      expect(created?.order).toBe(1);
    });

    it('still returns a string id even when the name already exists (ratified literal parity with Angular product-category.repository.ts:94-98 — the internal collision failure is silent to the caller)', () => {
      seedCategories([makeCategory('c1', { name: 'Bebidas' })]);
      const id = repo.addProductCategoryByName('Bebidas');
      expect(id).toEqual(expect.any(String));
      expect(repo.getProductCategoryById(id)).toBeUndefined();
    });
  });

  // ─── 1.8 updateProductCategory ───────────────────────────────────────────
  describe('updateProductCategory (repo.ts:122-136) — not-found, name-collision excluding self, order-shift', () => {
    it('fails with NotExists when the id does not exist', () => {
      const result = repo.updateProductCategory('missing', 'Name', 1, true);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NotExists', description: 'La categoría no existe.' }]);
    });

    it('fails with NameExists when another category already has that name (excluding self)', () => {
      seedCategories([
        makeCategory('c1', { name: 'Bebidas' }),
        makeCategory('c2', { name: 'Snacks' }),
      ]);
      const result = repo.updateProductCategory('c2', 'Bebidas', 1, true);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NameExists', description: 'El nombre de la categoría ya existe.' }]);
    });

    it('succeeds when renaming to its own unchanged name', () => {
      seedCategories([makeCategory('c1', { name: 'Bebidas', order: 1 })]);
      const result = repo.updateProductCategory('c1', 'Bebidas', 1, false);
      expect(result.succeeded).toBe(true);
      expect(repo.getProductCategoryById('c1')?.isActive).toBe(false);
    });

    it('updates fields and shifts siblings order, landing the updated category exactly at the requested order', () => {
      seedCategories([
        makeCategory('c1', { name: 'A', order: 1 }),
        makeCategory('c2', { name: 'B', order: 2 }),
        makeCategory('c3', { name: 'C', order: 3 }),
      ]);
      const result = repo.updateProductCategory('c1', 'A2', 3, true);
      expect(result.succeeded).toBe(true);
      const byId = new Map(readStoredCategories().map((c) => [c.id, c]));
      expect(byId.get('c1')?.order).toBe(3);
      expect(byId.get('c1')?.name).toBe('A2');
      expect(byId.get('c2')?.order).toBe(2);
      expect(byId.get('c3')?.order).toBe(4);
    });
  });

  // ─── 1.9 activateProductCategory / deactivateProductCategory ────────────
  // parity-audit-remediation Slice 2: restored to Angular's literal 2-param signature
  // (repo.ts:150,154) — the 2nd `isActive` argument is inert (method body hardcodes true/false
  // regardless of the passed value), a deliberate literal mirror per MAXIMAL-parity decision.
  describe('activateProductCategory / deactivateProductCategory (repo.ts:150,154) — 2-param, Angular-exact (inert isActive)', () => {
    it('activateProductCategory(id, isActive) toggles ONLY isActive to true', () => {
      seedCategories([makeCategory('c1', { isActive: false, name: 'X', order: 5 })]);
      const result = repo.activateProductCategory('c1', true);
      expect(result.succeeded).toBe(true);
      const updated = repo.getProductCategoryById('c1');
      expect(updated?.isActive).toBe(true);
      expect(updated?.name).toBe('X');
      expect(updated?.order).toBe(5);
    });

    it('deactivateProductCategory(id, isActive) toggles ONLY isActive to false', () => {
      seedCategories([makeCategory('c1', { isActive: true })]);
      const result = repo.deactivateProductCategory('c1', false);
      expect(result.succeeded).toBe(true);
      expect(repo.getProductCategoryById('c1')?.isActive).toBe(false);
    });

    it('activateProductCategory fails with NotExists when the id does not exist', () => {
      const result = repo.activateProductCategory('missing', true);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NotExists', description: 'La categoría no existe.' }]);
    });

    it('the 2nd isActive argument is inert — passing false to activateProductCategory still sets isActive=true (Angular hardcodes it)', () => {
      seedCategories([makeCategory('c1', { isActive: false })]);
      repo.activateProductCategory('c1', false);
      expect(repo.getProductCategoryById('c1')?.isActive).toBe(true);
    });

    it('the 2nd isActive argument is inert — passing true to deactivateProductCategory still sets isActive=false (Angular hardcodes it)', () => {
      seedCategories([makeCategory('c1', { isActive: true })]);
      repo.deactivateProductCategory('c1', true);
      expect(repo.getProductCategoryById('c1')?.isActive).toBe(false);
    });
  });

  // ─── 1.10 getCategoriesJson / import / sync helpers ──────────────────────
  describe('getCategoriesJson (repo.ts:172-174)', () => {
    it('returns the raw JSON string from localStorage', () => {
      seedCategories([makeCategory('c1')]);
      const json = repo.getCategoriesJson();
      expect(json).toBe(localStorage.getItem(STORAGE_KEY));
    });

    it('returns null when nothing is stored', () => {
      expect(repo.getCategoriesJson()).toBeNull();
    });
  });

  describe('addImportedProductCategory / updateImportedProductCategory (repo.ts:105-107,117-119)', () => {
    it('addImportedProductCategory creates the category preserving its own id', () => {
      const imported = makeCategory('imported-1', { name: 'Imported', order: 5, isActive: false });
      const result = repo.addImportedProductCategory(imported);
      expect(result.succeeded).toBe(true);
      expect(repo.getProductCategoryById('imported-1')?.name).toBe('Imported');
    });

    it('updateImportedProductCategory delegates to updateProductCategory by id', () => {
      seedCategories([makeCategory('c1', { name: 'Old', order: 1 })]);
      const updated = makeCategory('c1', { name: 'New', order: 2, isActive: false });
      const result = repo.updateImportedProductCategory(updated);
      expect(result.succeeded).toBe(true);
      expect(repo.getProductCategoryById('c1')?.name).toBe('New');
    });
  });

  describe('updateCategories / setInitCategories / getStorageCategoriesMap (repo.ts:29-44)', () => {
    it('updateCategories overwrites the whole storage map', () => {
      seedCategories([makeCategory('c1')]);
      const newMap = new Map<string, ProductCategory>([['c2', makeCategory('c2')]]);
      repo.updateCategories(newMap);
      const stored = repo.getStorageCategoriesMap();
      expect(stored.has('c1')).toBe(false);
      expect(stored.has('c2')).toBe(true);
    });

    it('setInitCategories only seeds when storage is currently empty', () => {
      const seedMap = new Map<string, ProductCategory>([['c1', makeCategory('c1')]]);
      repo.setInitCategories(seedMap);
      expect(repo.getStorageCategoriesMap().has('c1')).toBe(true);

      const secondSeed = new Map<string, ProductCategory>([['c2', makeCategory('c2')]]);
      repo.setInitCategories(secondSeed);
      expect(repo.getStorageCategoriesMap().has('c2')).toBe(false);
    });

    it('getStorageCategoriesMap returns an empty Map when nothing is stored', () => {
      expect(repo.getStorageCategoriesMap().size).toBe(0);
    });
  });

  // ─── 1.11 Exact-Surface Rule ──────────────────────────────────────────────
  describe('Exact-Surface Rule (repo.ts has NO upsert/remove)', () => {
    it('does not declare upsert or remove', () => {
      expect((repo as unknown as Record<string, unknown>).upsert).toBeUndefined();
      expect((repo as unknown as Record<string, unknown>).remove).toBeUndefined();
    });
  });

  // ─── 1.12 addProductCategoryData is PUBLIC (Angular repo.ts:71-88, public by default) ────
  describe('addProductCategoryData (repo.ts:71-88) — PUBLIC, matches Angular + spec.md:77 authoritative surface', () => {
    it('is callable directly as a public method and persists the new category', () => {
      const result = repo.addProductCategoryData('c1', 'Category c1', 0, true);
      expect(result.succeeded).toBe(true);
      expect(repo.getProductCategoryById('c1')).toEqual(makeCategory('c1', { order: 0 }));
    });

    it('fails without persisting when the name already exists', () => {
      repo.addProductCategoryData('c1', 'Duplicate', 0, true);
      const result = repo.addProductCategoryData('c2', 'Duplicate', 1, true);
      expect(result.succeeded).toBe(false);
      expect(repo.getProductCategoryById('c2')).toBeUndefined();
    });
  });

  describe('insertion order and the sibling shift', () => {
    it('inserting at order 1 shifts EVERY existing category down by one', () => {
      seedCategories([
        makeCategory('c1', { name: 'Bebidas', order: 1 }),
        makeCategory('c2', { name: 'Snacks', order: 2 }),
      ]);
      const repository = new ProductCategoryRepository(storeId);

      repository.addProductCategory('Galletas', 1, true);

      const stored = readStoredCategories();
      expect(stored.find((c) => c.name === 'Bebidas')?.order).toBe(2);
      expect(stored.find((c) => c.name === 'Snacks')?.order).toBe(3);
      expect(stored.find((c) => c.name === 'Galletas')?.order).toBe(1);
    });

    it('inserting at max+1 leaves every existing category order untouched', () => {
      seedCategories([
        makeCategory('c1', { name: 'Bebidas', order: 1 }),
        makeCategory('c2', { name: 'Snacks', order: 2 }),
      ]);
      const repository = new ProductCategoryRepository(storeId);

      repository.addProductCategory('Galletas', 3, true);

      const stored = readStoredCategories();
      expect(stored.find((c) => c.name === 'Bebidas')?.order).toBe(1);
      expect(stored.find((c) => c.name === 'Snacks')?.order).toBe(2);
      expect(stored.find((c) => c.name === 'Galletas')?.order).toBe(3);
    });
  });
});
