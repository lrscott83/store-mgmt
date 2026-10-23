import { describe, expect, it, vi } from 'vitest';
import { Currency, Result } from '@store-mgmt/domain';
import type { Product, ProductCategory, WholesaleConfig } from '@store-mgmt/domain';
import type { CatalogProductView } from '../../services/catalog-http-service';
import { importCatalogProducts } from '../catalog-import';

function view(o: Partial<CatalogProductView> = {}): CatalogProductView {
  return { id: 'p-new', categoryId: 'c-1', categoryName: 'Bebidas', name: 'Nuevo', price: 10,
    currency: 'CUP', order: 0, categoryOrder: 0, availableToSale: true, isActive: true,
    description: '', percentDiscountPrice: 0, discountPrice: 0, isNew: false, image: null,
    images: [], finalPrice: 10, hasDiscount: false, ...o };
}
const cat = (id: string, name = 'Bebidas', order = 0): ProductCategory => ({ id, name, order, isActive: true });
const prod = (id: string, categoryId = 'c-1', name = 'Viejo', order = 0): Product => ({
  id, name, categoryId, categoryName: 'Bebidas', price: 1, order, availableToSale: true,
  discountFromInvantory: true, businessId: '', isActive: true,
  createdDate: new Date('2025-01-01'), createdByName: 'test' });

function repos(cs: ProductCategory[], ps: Product[]) {
  const categories = new Map(cs.map((c) => [c.id, c]));
  const products = new Map(ps.map((p) => [p.id, p]));
  return {
    products,
    categoryRepository: {
      getProductCategoryById: (id: string) => categories.get(id),
      addImportedProductCategory: vi.fn((c: ProductCategory) => {
        if ([...categories.values()].some((x) => x.name === c.name)) return Result.Failure([]);
        categories.forEach((x) => { if (x.order >= c.order) x.order += 1; });
        categories.set(c.id, c);
        return Result.Success();
      }),
    },
    productRepository: {
      getProductById: (id: string) => products.get(id),
      addProductData: vi.fn((id: string, categoryId: string, name: string, price: number,
        businessId: string, order: number, isActive: boolean, availableToSale: boolean,
        discountFromInvantory: boolean, _barcode?: string, _wholesale?: WholesaleConfig,
        currency?: Currency) => {
        if (!categories.has(categoryId)) return Result.Failure([]);
        if ([...products.values()].some((p) => p.categoryId === categoryId && p.name === name))
          return Result.Failure([]);
        products.forEach((p) => { if (p.categoryId === categoryId && p.order >= order) p.order += 1; });
        products.set(id, { id, name, categoryId, categoryName: categories.get(categoryId)!.name,
          price, currency: currency ?? Currency.CUP, businessId, isActive, createdDate: new Date(),
          createdByName: 'test', order, availableToSale, discountFromInvantory });
        return Result.Success();
      }),
    },
  };
}

describe('web-catalog-to-pos-import — contract regressions', () => {
  it('S2: an existing id is skipped even when its name differs', () => {
    const r = repos([cat('c-1')], [prod('p-1', 'c-1', 'Nombre local', 5)]);
    const s = importCatalogProducts([view({ id: 'p-1', categoryId: 'c-1', name: 'Otro nombre' })], r);
    expect(s.existingCount).toBe(1);
    expect(s.importedCount).toBe(0);
    expect(r.productRepository.addProductData).not.toHaveBeenCalled();
  });

  it('S2: a new id with an existing name is attempted and reported', () => {
    const r = repos([cat('c-1')], [prod('p-1', 'c-1', 'Coca Cola', 0)]);
    const s = importCatalogProducts([view({ id: 'p-2', categoryId: 'c-1', name: 'Coca Cola' })], r);
    expect(s.existingCount).toBe(0);
    expect(s.failedProducts).toEqual([{ id: 'p-2', name: 'Coca Cola' }]);
  });

  it('S3: a new category id with an existing name is attempted and reported', () => {
    const r = repos([cat('c-1', 'Bebidas')], []);
    const s = importCatalogProducts([view({ id: 'p-1', categoryId: 'c-2', categoryName: 'Bebidas' })], r);
    expect(s.failedCategories).toEqual([{ id: 'c-2', name: 'Bebidas', skippedProductsCount: 1 }]);
    expect(r.products.size).toBe(0);
  });

  it('S4: does not copy availability, activity, business id or barcode from the server', () => {
    const r = repos([cat('c-1')], []);
    importCatalogProducts([view({ id: 'p-1', categoryId: 'c-1', availableToSale: false, isActive: false })], r);
    const a = r.productRepository.addProductData.mock.calls[0]!;
    expect(a[4]).toBe(''); expect(a[6]).toBe(true); expect(a[7]).toBe(true);
    expect(a[8]).toBe(true); expect(a[9]).toBeUndefined();
  });

  it('S5: an insert keeps the server order and renumbers the existing sibling (owner-accepted)', () => {
    const r = repos([cat('c-1')], [prod('p-1', 'c-1', 'Viejo', 5)]);
    const s = importCatalogProducts(
      [view({ id: 'p-2', categoryId: 'c-1', name: 'Nuevo', order: 5 })],
      r,
    );
    expect(s.importedCount).toBe(1);
    expect(r.products.get('p-2')?.order).toBe(5);
    expect(r.products.get('p-1')?.order).toBe(6);
  });
});
