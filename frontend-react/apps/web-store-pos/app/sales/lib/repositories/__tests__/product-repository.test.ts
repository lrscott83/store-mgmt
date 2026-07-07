import { beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import { ProductRepository } from '../product-repository';

const storeId = 's1';

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 10,
    order: 0,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: '',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

function seedProducts(storeId: string, products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));
}

describe('ProductRepository (React mirror of Angular product.repository.ts lookup surface)', () => {
  let repo: ProductRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new ProductRepository(storeId);
  });

  describe('getProductById — 1:1 port of Angular getProductById (may be undefined)', () => {
    it('returns the product when it exists', () => {
      seedProducts(storeId, [makeProduct('p1', { name: 'Ron' })]);
      expect(repo.getProductById('p1')?.name).toBe('Ron');
    });

    it('returns undefined when the product does not exist', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      expect(repo.getProductById('nope')).toBeUndefined();
    });

    it('returns an inactive product too (no isActive filter — matches Angular)', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: false })]);
      expect(repo.getProductById('p1')).toBeDefined();
    });
  });

  describe('getAvailableProductById — 1:1 port of Angular getAvailableProductById (active-only)', () => {
    it('returns the product when it exists AND isActive', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: true })]);
      expect(repo.getAvailableProductById('p1')?.id).toBe('p1');
    });

    it('returns undefined when the product is inactive', () => {
      seedProducts(storeId, [makeProduct('p1', { isActive: false })]);
      expect(repo.getAvailableProductById('p1')).toBeUndefined();
    });

    it('returns undefined when the product does not exist', () => {
      seedProducts(storeId, [makeProduct('p1')]);
      expect(repo.getAvailableProductById('nope')).toBeUndefined();
    });
  });

  describe('getStorageProductsMap — 1:1 port of Angular getStorageProductsMap', () => {
    it('returns a Map keyed by product id', () => {
      seedProducts(storeId, [makeProduct('p1'), makeProduct('p2')]);
      const map = repo.getStorageProductsMap();
      expect(map.get('p1')?.id).toBe('p1');
      expect(map.get('p2')?.id).toBe('p2');
      expect(map.size).toBe(2);
    });

    it('returns an empty Map when no products are stored', () => {
      expect(repo.getStorageProductsMap().size).toBe(0);
    });
  });
});
