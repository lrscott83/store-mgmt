import { describe, it, expect } from 'vitest';
import type { ProductCategoryService } from '../product-category-service';
import type { ProductCategory } from '../../models/product';

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'c1',
    name: 'Bebidas',
    order: 1,
    isActive: true,
    ...overrides,
  };
}

class FakeProductCategoryService implements ProductCategoryService {
  private items: ProductCategory[] = [makeCategory()];

  getAll(): ProductCategory[] {
    return this.items;
  }

  getById(id: string): ProductCategory | undefined {
    return this.items.find((c) => c.id === id);
  }

  getByName(name: string): ProductCategory | undefined {
    return this.items.find((c) => c.name === name);
  }

  save(category: ProductCategory): ProductCategory {
    this.items = [...this.items.filter((c) => c.id !== category.id), category];
    return category;
  }

  delete(id: string): void {
    this.items = this.items.filter((c) => c.id !== id);
  }
}

describe('ProductCategoryService', () => {
  it('is implementable with getAll/getById/getByName/save/delete', () => {
    const svc: ProductCategoryService = new FakeProductCategoryService();
    expect(svc.getByName('Bebidas')?.id).toBe('c1');
    const saved = svc.save(makeCategory({ id: 'c2', name: 'Snacks' }));
    expect(saved.name).toBe('Snacks');
    svc.delete('c1');
    expect(svc.getAll().map((c) => c.id)).toEqual(['c2']);
  });
});
