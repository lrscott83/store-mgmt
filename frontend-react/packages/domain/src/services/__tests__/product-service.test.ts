import { describe, it, expect } from 'vitest';
import type { ProductService } from '../product-service';
import type { Product, ProductSelectView } from '../../models/product';
import type { CsvProduct } from '../../models/csv-product';
import type { BaseResponseModel } from '../../models/base';
import { success, failure } from '../../commons/envelope';

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

  async hasAnyAvailableToSaleProduct(): Promise<BaseResponseModel<boolean>> {
    return success(this.items.some((p) => p.isActive && p.availableToSale));
  }

  async getProductById(id: string): Promise<BaseResponseModel<Product>> {
    const product = this.items.find((p) => p.id === id);
    return product
      ? success(product)
      : failure([{ code: 'Product.NotExists', description: 'not found' }]);
  }

  async getProductByBarcode(barcode: string): Promise<BaseResponseModel<Product>> {
    const product = this.items.find((p) => p.barcode === barcode);
    return product
      ? success(product)
      : failure([{ code: 'Product.NotExists', description: 'not found' }]);
  }

  async getProductsToSelect(): Promise<BaseResponseModel<ProductSelectView[]>> {
    return success(
      this.items.map((p) => ({ id: p.id, fullName: `${p.categoryName} - ${p.name}` })),
    );
  }

  async getAvailableProductsByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    return success(
      this.items
        .filter((p) => p.categoryId === categoryId && p.isActive)
        .sort((a, b) => a.order - b.order),
    );
  }

  async deleteProduct(id: string): Promise<BaseResponseModel<boolean>> {
    this.items = this.items.filter((p) => p.id !== id);
    return success(true);
  }

  async createCsvProducts(csvProducts: CsvProduct[]): Promise<BaseResponseModel<boolean>> {
    csvProducts.forEach((row, index) => {
      this.items.push(
        makeProduct({ id: `csv-${index}`, name: row.name, price: row.price, categoryName: row.category }),
      );
    });
    return success(true);
  }

  async getProductsToSaleByCategoryId(categoryId: string): Promise<BaseResponseModel<Product[]>> {
    return success(
      this.items.filter((p) => p.categoryId === categoryId && p.isActive && p.availableToSale),
    );
  }

  async createProduct(
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
  ): Promise<BaseResponseModel<boolean>> {
    this.items.push(
      makeProduct({
        id: `new-${this.items.length}`,
        categoryId,
        name,
        price,
        businessId,
        order,
        isActive,
        availableToSale,
        discountFromInvantory,
        barcode,
      }),
    );
    return success(true);
  }

  async updateProduct(
    id: string,
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
  ): Promise<BaseResponseModel<boolean>> {
    const existing = this.items.find((p) => p.id === id);
    if (!existing) return failure([{ code: 'Product.NotExists', description: 'not found' }]);
    Object.assign(existing, {
      categoryId,
      name,
      price,
      businessId,
      order,
      isActive,
      availableToSale,
      discountFromInvantory,
      barcode,
    });
    return success(true);
  }

  async getMaxOrder(categoryId: string): Promise<BaseResponseModel<number>> {
    const orders = this.items.filter((p) => p.categoryId === categoryId).map((p) => p.order);
    return success(orders.length > 0 ? Math.max(...orders) : 0);
  }

  async createProducts(
    categoryId: string,
    items: { name: string; price: number }[],
  ): Promise<BaseResponseModel<boolean>> {
    items.forEach((item, index) => {
      this.items.push(makeProduct({ id: `bulk-${index}`, categoryId, name: item.name, price: item.price }));
    });
    return success(true);
  }
}

describe('ProductService', () => {
  it('is implementable with exactly the standalone async 12-method surface: hasAnyAvailableToSaleProduct/getProductById/getProductByBarcode/getProductsToSelect/getAvailableProductsByCategoryId/deleteProduct/createCsvProducts/getProductsToSaleByCategoryId/createProduct/updateProduct/getMaxOrder/createProducts', async () => {
    const svc: ProductService = new FakeProductService();

    const hasAny = await svc.hasAnyAvailableToSaleProduct();
    expect(hasAny.data).toBe(true);

    const byId = await svc.getProductById('p1');
    expect(byId.data?.name).toBe('Coca Cola');

    const byBarcode = await svc.getProductByBarcode('123');
    expect(byBarcode.data?.id).toBe('p1');

    const toSelect = await svc.getProductsToSelect();
    expect(toSelect.data[0]).toEqual({ id: 'p1', fullName: 'Bebidas - Coca Cola' });

    const availableByCategory = await svc.getAvailableProductsByCategoryId('cat1');
    expect(availableByCategory.data).toHaveLength(1);

    const created = await svc.createProduct('cat1', 'Fanta', 3, 'biz1', 2, true, true, true, '999');
    expect(created).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });

    const maxOrder = await svc.getMaxOrder('cat1');
    expect(maxOrder.data).toBe(2);

    const toSale = await svc.getProductsToSaleByCategoryId('cat1');
    expect(toSale.data).toHaveLength(2);

    const csvResult = await svc.createCsvProducts([{ category: 'Snacks', name: 'Papas', price: 1.5 }]);
    expect(csvResult.succeeded).toBe(true);

    const bulkResult = await svc.createProducts('cat1', [{ name: 'Sprite', price: 2 }]);
    expect(bulkResult.succeeded).toBe(true);

    const updated = await svc.updateProduct('p1', 'cat1', 'Coca Cola Zero', 6, 'biz1', 1, true, true, false, '123');
    expect(updated.succeeded).toBe(true);

    const deleted = await svc.deleteProduct('p1');
    expect(deleted.succeeded).toBe(true);
  });

  it('rejects getProductById for a missing id via a failure envelope, not undefined', async () => {
    const svc: ProductService = new FakeProductService();
    const result = await svc.getProductById('missing');
    expect(result).toEqual({
      data: null,
      succeeded: false,
      message: '',
      actionCode: 400,
      errors: [{ code: 'Product.NotExists', description: 'not found' }],
    });
  });
});
