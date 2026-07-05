import { describe, it, expect } from 'vitest';
import type { ProductCategoryService } from '../product-category-service';
import type { ProductCategory, ProductCategoryView } from '../../models/product';

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

  hasAnyCategory(): boolean {
    return this.items.length > 0;
  }

  hasAnyAvailableCategory(): boolean {
    return this.items.some((c) => c.isActive);
  }

  getMaxOrder(): number {
    return this.items.length > 0 ? Math.max(...this.items.map((c) => c.order)) : 0;
  }

  getAvailableProductCategories(): ProductCategory[] {
    return this.items.filter((c) => c.isActive).sort((a, b) => a.order - b.order);
  }

  getProductCategoriesView(): ProductCategoryView[] {
    return this.getAvailableProductCategories().map((c) => ({ ...c, productsCount: 0 }));
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

  it('is implementable with hasAnyCategory/hasAnyAvailableCategory/getMaxOrder/getAvailableProductCategories/getProductCategoriesView', () => {
    const svc: ProductCategoryService = new FakeProductCategoryService();
    expect(svc.hasAnyCategory()).toBe(true);
    expect(svc.hasAnyAvailableCategory()).toBe(true);
    expect(svc.getMaxOrder()).toBe(1);
    expect(svc.getAvailableProductCategories()).toHaveLength(1);
    expect(svc.getProductCategoriesView()).toHaveLength(1);
  });
});
