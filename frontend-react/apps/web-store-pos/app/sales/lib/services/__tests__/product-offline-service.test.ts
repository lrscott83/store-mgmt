import { beforeEach, describe, expect, it } from 'vitest';
import type { Product, UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '../product-offline-service';
import { ProductRepository } from '../../repositories/product-repository';
import { ProductCategoryRepository } from '../../repositories/product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

const makeProduct = (overrides: Partial<Product> = {}): Omit<Product, 'id'> & { id?: string } => ({
  name: 'Coca Cola',
  barcode: '123456',
  categoryId: 'cat-1',
  categoryName: 'Bebidas',
  price: 1.5,
  order: 1,
  availableToSale: true,
  discountFromInvantory: false,
  businessId: '',
  isActive: true,
  createdDate: new Date('2024-01-01T00:00:00.000Z'),
  createdByName: 'test',
  ...overrides,
});

describe('ProductOfflineService', () => {
  let service: ProductOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    service = new ProductOfflineService(storeId);
  });

  describe('PROD-01: create persists product to localStorage', () => {
    it('returns the created product with a generated id', () => {
      const product = service.create(makeProduct());
      expect(product.id).toBeTruthy();
      expect(product.name).toBe('Coca Cola');
    });

    it('persists the product to localStorage', () => {
      service.create(makeProduct());
      const raw = localStorage.getItem('lizoft.store-products-s1');
      expect(raw).not.toBeNull();
    });

    it('can retrieve the created product by id', () => {
      const created = service.create(makeProduct());
      const found = service.getById(created.id);
      expect(found?.name).toBe('Coca Cola');
    });

    it('creates two products with distinct ids', () => {
      const p1 = service.create(makeProduct({ name: 'Fanta' }));
      const p2 = service.create(makeProduct({ name: 'Sprite' }));
      expect(p1.id).not.toBe(p2.id);
    });

    // Angular parity (audit-user-threading-followup): create stamps createdByName
    // from the authenticated user's login, mirroring ExpenseOfflineService.create.
    it('stamps createdByName with the authenticated user login on create', () => {
      const created = service.create(makeProduct());
      expect(created.createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on create', () => {
      const created = service.create(makeProduct());
      expect(created.updatedByName).toBeUndefined();
      expect(created.updatedDate).toBeUndefined();
    });
  });

  describe('PROD-02: getByBarcode returns the correct product', () => {
    it('returns the product with matching barcode', () => {
      service.create(makeProduct({ barcode: 'ABC123' }));
      const found = service.getByBarcode('ABC123');
      expect(found).not.toBeUndefined();
      expect(found?.barcode).toBe('ABC123');
    });

    it('returns undefined for unknown barcode', () => {
      service.create(makeProduct({ barcode: 'ABC123' }));
      const found = service.getByBarcode('UNKNOWN');
      expect(found).toBeUndefined();
    });

    it('returns undefined when barcode is empty', () => {
      const found = service.getByBarcode('');
      expect(found).toBeUndefined();
    });
  });

  describe('PROD-04: getAll returns all products', () => {
    it('returns empty array when no products', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('returns all created products', () => {
      service.create(makeProduct({ name: 'Fanta' }));
      service.create(makeProduct({ name: 'Sprite' }));
      expect(service.getAll()).toHaveLength(2);
    });
  });

  describe('PROD-05: update', () => {
    it('updates a product field', () => {
      const created = service.create(makeProduct({ price: 1.0 }));
      service.update({ ...created, price: 5.0 });
      expect(service.getById(created.id)?.price).toBe(5.0);
    });

    // Angular parity (audit-user-threading-followup): update stamps updatedByName
    // from the authenticated user's login, mirroring ExpenseOfflineService.update.
    it('stamps updatedByName with the authenticated user login on update', () => {
      const created = service.create(makeProduct());
      const updated = service.update({ ...created, price: 9.0 });
      expect(updated.updatedByName).toBe('jdoe');
    });

    it('sets updatedDate to a Date instance on update', () => {
      const created = service.create(makeProduct());
      const updated = service.update({ ...created, price: 9.0 });
      expect(updated.updatedDate).toBeInstanceOf(Date);
    });

    it('does not change createdByName/createdDate on update', () => {
      const created = service.create(makeProduct());
      const updated = service.update({ ...created, price: 9.0 });
      expect(updated.createdByName).toBe(created.createdByName);
      expect(updated.createdDate).toEqual(created.createdDate);
    });
  });

  describe('PROD-06: delete', () => {
    // Angular parity (audit-user-threading-followup, ADR-3): deleteProduct
    // soft-deletes (isActive=false), it does NOT remove the record — required
    // for sync propagation, mirrors ExpenseOfflineService.delete.
    it('soft-deletes a product (isActive=false, record retained)', () => {
      const created = service.create(makeProduct());
      service.delete(created.id);
      const all = service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(created.id);
      expect(service.getById(created.id)?.isActive).toBe(false);
    });

    it('stamps updatedByName with the authenticated user login on delete', () => {
      const created = service.create(makeProduct());
      service.delete(created.id);
      expect(service.getById(created.id)?.updatedByName).toBe('jdoe');
    });

    it('sets updatedDate to a Date instance on delete', () => {
      const created = service.create(makeProduct());
      service.delete(created.id);
      expect(service.getById(created.id)?.updatedDate).toBeInstanceOf(Date);
    });

    it('is a no-op for a missing id (no throw)', () => {
      service.create(makeProduct());
      expect(() => service.delete('nonexistent-id')).not.toThrow();
      expect(service.getAll()).toHaveLength(1);
    });
  });

  describe('PROD-08: storage key', () => {
    it('uses the correct localStorage key pattern', () => {
      service.create(makeProduct());
      const raw = localStorage.getItem('lizoft.store-products-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('PROD-10: getMaxOrder (async)', () => {
    it('resolves a success envelope with 0 when the category has no products', async () => {
      const result = await service.getMaxOrder('empty-cat');
      expect(result).toEqual({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] });
    });

    it('resolves the max order among all products (active+inactive) in the category', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'Fanta', 1.5, '', 5, false, true, true);

      const result = await service.getMaxOrder(categoryId);
      expect(result.data).toBe(5);
    });
  });

  describe('PROD-11: getAvailableProductsByCategoryId (async)', () => {
    it('resolves only isActive products for the given category, regardless of availableToSale', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;
      // Add in ascending order to avoid the repository's order-shift reordering the setup.
      productRepository.addProduct(categoryId, 'B', 1, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'A', 1, '', 2, true, false, true);
      productRepository.addProduct(categoryId, 'C', 1, '', 3, false, true, true);

      const result = await service.getAvailableProductsByCategoryId(categoryId);
      expect(result.data).toHaveLength(2);
      expect(result.data.map((p) => p.name)).toEqual(['B', 'A']);
      expect(result.data.map((p) => p.order)).toEqual([1, 2]);
    });

    it('resolves an empty array when no products match', async () => {
      const result = await service.getAvailableProductsByCategoryId('none');
      expect(result.data).toEqual([]);
    });
  });

  describe('PROD-13: hasAnyAvailableToSaleProduct', () => {
    it('resolves true when an active category has an active+availableToSale product', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);

      const result = await service.hasAnyAvailableToSaleProduct();
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
    });

    it('resolves false when there is no active category or no available-to-sale product', async () => {
      const result = await service.hasAnyAvailableToSaleProduct();
      expect(result.data).toBe(false);
    });
  });

  describe('PROD-14: getProductById (async)', () => {
    it('resolves a success envelope with the product on found', async () => {
      const created = service.create(makeProduct());
      const result = await service.getProductById(created.id);
      expect(result.succeeded).toBe(true);
      expect(result.data?.name).toBe('Coca Cola');
    });

    it('resolves a failure envelope with ProductErrors.NotExists when missing', async () => {
      const result = await service.getProductById('missing-id');
      expect(result).toEqual({
        data: null,
        succeeded: false,
        message: '',
        actionCode: 400,
        errors: [{ code: 'Product.NotExists', description: 'El producto no existe.' }],
      });
    });
  });

  describe('PROD-15: getProductByBarcode (async)', () => {
    it('resolves a success envelope with the product on found', async () => {
      service.create(makeProduct({ barcode: 'ABC123' }));
      const result = await service.getProductByBarcode('ABC123');
      expect(result.succeeded).toBe(true);
      expect(result.data?.barcode).toBe('ABC123');
    });

    it('resolves a failure envelope with ProductErrors.NotExists when missing', async () => {
      const result = await service.getProductByBarcode('UNKNOWN');
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'Product.NotExists', description: 'El producto no existe.' }]);
    });
  });

  describe('PROD-16: deleteProduct (async)', () => {
    it('soft-deletes and resolves a success envelope with data: true', async () => {
      const created = service.create(makeProduct());
      const result = await service.deleteProduct(created.id);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      expect(service.getById(created.id)?.isActive).toBe(false);
    });

    it('resolves a success envelope with data: false for a missing id (repository never fails)', async () => {
      const result = await service.deleteProduct('missing-id');
      expect(result).toEqual({ data: false, succeeded: true, message: '', actionCode: 200, errors: [] });
    });
  });

  describe('PROD-17: getProductsToSaleByCategoryId', () => {
    it('resolves only isActive+availableToSale products for the category', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'Fanta', 1.5, '', 2, true, false, true);

      const result = await service.getProductsToSaleByCategoryId(categoryId);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Coca Cola');
    });

    it('resolves an empty array when no products match', async () => {
      const result = await service.getProductsToSaleByCategoryId('none');
      expect(result.data).toEqual([]);
    });
  });

  describe('PROD-18: getProductsByCategoryId (offline-only, not on the interface)', () => {
    it('resolves ALL products for a category regardless of active/availableToSale state', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, false, false, true);

      const result = await service.getProductsByCategoryId(categoryId);
      expect(result.data).toHaveLength(1);
    });

    it('resolves an empty array (never fails) when no products match', async () => {
      const result = await service.getProductsByCategoryId('none');
      expect(result).toEqual({ data: [], succeeded: true, message: '', actionCode: 200, errors: [] });
    });
  });

  describe('PROD-19: setDiscountFromInvantory (offline-only, not on the interface)', () => {
    it('updates the flag and resolves a success envelope', async () => {
      const created = service.create(makeProduct({ discountFromInvantory: false }));
      const result = await service.setDiscountFromInvantory(created.id, true);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      expect(service.getById(created.id)?.discountFromInvantory).toBe(true);
    });

    it('resolves a failure envelope with ProductErrors.NotExists for a missing id', async () => {
      const result = await service.setDiscountFromInvantory('missing-id', true);
      expect(result).toEqual({
        data: null,
        succeeded: false,
        message: '',
        actionCode: 400,
        errors: [{ code: 'Product.NotExists', description: 'El producto no existe.' }],
      });
    });
  });

  describe('PROD-20: getProductsToSelect', () => {
    it('groups products by category (category order), sorted by product order within category, mapped to id/fullName', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);

      const bebidasId = categoryRepository.addProductCategoryByName('Bebidas') as string;
      const snacksId = categoryRepository.addProductCategoryByName('Snacks') as string;
      productRepository.addProduct(bebidasId, 'Fanta', 1, '', 2, true, true, true);
      productRepository.addProduct(bebidasId, 'Coca Cola', 1, '', 1, true, true, true);
      productRepository.addProduct(snacksId, 'Papas', 1, '', 1, true, true, true);

      const result = await service.getProductsToSelect();
      expect(result.data.map((p) => p.fullName)).toEqual([
        'Bebidas - Coca Cola',
        'Bebidas - Fanta',
        'Snacks - Papas',
      ]);
    });

    it('resolves an empty array when there are no products', async () => {
      const result = await service.getProductsToSelect();
      expect(result.data).toEqual([]);
    });
  });

  describe('PROD-21: createProduct (async, delegates addProduct)', () => {
    it('creates the product and resolves a success envelope with data: true', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;

      const result = await service.createProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, false, '123');
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      expect(productRepository.getProductsByCategoryId(categoryId)).toHaveLength(1);
    });

    it('resolves a failure envelope with the repository errors when the category does not exist', async () => {
      const result = await service.createProduct('missing-cat', 'X', 1, '', 1, true, true, false);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NotExists', description: 'La categoría no existe.' }]);
    });
  });

  describe('PROD-22: updateProduct (async, delegates updateProduct)', () => {
    it('updates the product and resolves a success envelope with data: true', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      const id = productRepository.getProductsByCategoryId(categoryId)[0].id;

      const result = await service.updateProduct(id, categoryId, 'Coca Cola Zero', 2.0, '', 1, true, true, true);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      expect(productRepository.getProductById(id)?.name).toBe('Coca Cola Zero');
    });

    it('resolves a failure envelope with the repository errors when the product does not exist', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;

      const result = await service.updateProduct('missing-id', categoryId, 'X', 1, '', 1, true, true, true);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'Product.NotExists', description: 'El producto no existe.' }]);
    });
  });

  describe('PROD-23: createProducts (async, bulk under one category)', () => {
    it('creates every item with increasing order and hardcoded flags, resolving success', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas') as string;

      const result = await service.createProducts(categoryId, [
        { name: 'Coca Cola', price: 1.5 },
        { name: 'Fanta', price: 1.2 },
      ]);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      const products = productRepository.getProductsByCategoryId(categoryId);
      expect(products).toHaveLength(2);
      expect(products.every((p) => p.discountFromInvantory === true)).toBe(true);
    });

    it('resolves a failure envelope with an empty errors array when any item fails', async () => {
      const result = await service.createProducts('missing-cat', [{ name: 'X', price: 1 }]);
      expect(result).toEqual({ data: null, succeeded: false, message: '', actionCode: 400, errors: [] });
    });
  });

  describe('PROD-24: createCsvProducts (async, resolves/creates category per row)', () => {
    it('creates the category by name when absent, then the product with discountFromInvantory: true', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);

      const result = await service.createCsvProducts([{ category: 'Snacks', name: 'Papas', price: 1.5 }]);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      const category = categoryRepository.getProductCategoryByName('Snacks');
      expect(category).not.toBeUndefined();
      const products = productRepository.getProductsByCategoryId(category!.id);
      expect(products).toHaveLength(1);
      expect(products[0].discountFromInvantory).toBe(true);
    });

    it('reuses an existing category with the same name', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const existingId = categoryRepository.addProductCategoryByName('Bebidas') as string;

      await service.createCsvProducts([{ category: 'Bebidas', name: 'Coca Cola', price: 1.5 }]);
      expect(categoryRepository.getProductCategories()).toHaveLength(1);
      expect(productRepository.getProductsByCategoryId(existingId)).toHaveLength(1);
    });
  });
});
