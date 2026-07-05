import { describe, it, expect } from 'vitest';
import type { ProductService } from '../product-service';
import type { Product } from '../../models/product';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Coca Cola',
    barcode: '123',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    price: 5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz1',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

class FakeProductService implements ProductService {
  private items: Product[] = [makeProduct()];

  getAll(): Product[] {
    return this.items;
  }

  getById(id: string): Product | undefined {
    return this.items.find((p) => p.id === id);
  }

  getByBarcode(barcode: string): Product | undefined {
    return this.items.find((p) => p.barcode === barcode);
  }

  update(product: Product): Product {
    this.items = this.items.map((p) => (p.id === product.id ? product : p));
    return product;
  }

  delete(id: string): void {
    this.items = this.items.filter((p) => p.id !== id);
  }
}

describe('ProductService', () => {
  it('is implementable with getAll/getById/getByBarcode/update/delete', () => {
    const svc: ProductService = new FakeProductService();
    expect(svc.getByBarcode('123')?.id).toBe('p1');
    const updated = svc.update(makeProduct({ price: 9 }));
    expect(updated.price).toBe(9);
    svc.delete('p1');
    expect(svc.getAll()).toHaveLength(0);
  });
});
