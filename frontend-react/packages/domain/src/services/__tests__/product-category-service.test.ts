import { describe, it, expect } from 'vitest';
import type { ProductCategoryService } from '../product-category-service';
import type { ProductCategory, ProductCategoryView } from '../../models/product';
import type { BaseResponseModel } from '../../models/base';
import { success, failure } from '../../commons/envelope';

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

  delete(id: string): void {
    this.items = this.items.filter((c) => c.id !== id);
  }

  async createProductCategory(name: string, order: number, isActive: boolean): Promise<BaseResponseModel<boolean>> {
    if (this.items.some((c) => c.name === name)) {
      return failure([{ code: 'ProductCategory.NameExists', description: 'exists' }]);
    }
    this.items.push({ id: `c${this.items.length + 1}`, name, order, isActive });
    return success(true);
  }

  async updateProductCategory(
    id: string,
    name: string,
    order: number,
    isActive: boolean,
  ): Promise<BaseResponseModel<boolean>> {
    const existing = this.items.find((c) => c.id === id);
    if (!existing) {
      return failure([{ code: 'ProductCategory.NotExists', description: 'not found' }]);
    }
    existing.name = name;
    existing.order = order;
    existing.isActive = isActive;
    return success(true);
  }

  async getMaxOrder(): Promise<BaseResponseModel<number>> {
    return success(this.items.length > 0 ? Math.max(...this.items.map((c) => c.order)) : 0);
  }

  async getAvailableProductCategories(): Promise<BaseResponseModel<ProductCategory[]>> {
    return success(this.items.filter((c) => c.isActive).sort((a, b) => a.order - b.order));
  }

  async getProductCategoriesView(): Promise<BaseResponseModel<ProductCategoryView[]>> {
    const available = await this.getAvailableProductCategories();
    return success(available.data.map((c) => ({ ...c, productsCount: 0 })));
  }
}

describe('ProductCategoryService', () => {
  it('is implementable with getAll/getById/delete (BaseService, retained through Phase 2 step 8)', () => {
    const svc: ProductCategoryService = new FakeProductCategoryService();
    expect(svc.getAll()).toHaveLength(1);
    expect(svc.getById('c1')?.name).toBe('Bebidas');
    svc.delete('c1');
    expect(svc.getAll()).toEqual([]);
  });

  it('is implementable with the async category-C surface: createProductCategory/updateProductCategory/getMaxOrder/getAvailableProductCategories/getProductCategoriesView', async () => {
    const svc: ProductCategoryService = new FakeProductCategoryService();

    const created = await svc.createProductCategory('Snacks', 2, true);
    expect(created).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });

    const maxOrder = await svc.getMaxOrder();
    expect(maxOrder.data).toBe(2);

    const updated = await svc.updateProductCategory('c1', 'Bebidas Updated', 1, true);
    expect(updated.succeeded).toBe(true);

    const available = await svc.getAvailableProductCategories();
    expect(available.data.map((c) => c.name)).toEqual(['Bebidas Updated', 'Snacks']);

    const view = await svc.getProductCategoriesView();
    expect(view.data).toHaveLength(2);
    expect(view.data[0]).toHaveProperty('productsCount', 0);
  });

  it('rejects create on a duplicate name via a failure envelope, not a thrown error', async () => {
    const svc: ProductCategoryService = new FakeProductCategoryService();
    const result = await svc.createProductCategory('Bebidas', 2, true);
    expect(result).toEqual({
      data: null,
      succeeded: false,
      message: '',
      actionCode: 400,
      errors: [{ code: 'ProductCategory.NameExists', description: 'exists' }],
    });
  });
});
