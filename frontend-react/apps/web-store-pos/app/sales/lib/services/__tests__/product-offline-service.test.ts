import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseResponseModel, UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '../product-offline-service';
import { ProductRepository } from '../../repositories/product-repository';
import { ProductCategoryRepository } from '../../repositories/product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

// response-envelope-nullability: `data` only narrows to non-null on the succeeded
// branch. These tests only ever exercise the success path, so unwrap once instead of
// repeating an `if (!x.succeeded) throw` guard at every assertion site.
function unwrap<T>(response: BaseResponseModel<T>): T {
  if (!response.succeeded) throw new Error('expected succeeded response');
  return response.data;
}

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
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

describe('ProductOfflineService', () => {
  let service: ProductOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    service = new ProductOfflineService(storeId);
  });

  describe('PROD-08: storage key', () => {
    it('uses the correct localStorage key pattern', () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);

      const raw = localStorage.getItem('lizoft.store-products-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('PROD-10: getMaxOrderByCategoryId (async)', () => {
    it('resolves a success envelope with 0 when the category has no products', async () => {
      const result = await service.getMaxOrderByCategoryId('empty-cat');
      expect(result).toEqual({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] });
    });

    it('resolves the max order among all products (active+inactive) in the category', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'Fanta', 1.5, '', 5, false, true, true);

      const result = await service.getMaxOrderByCategoryId(categoryId);
      expect(result.data).toBe(5);
    });
  });

  describe('PROD-11: getAvailableProductsByCategoryId (catalog list — everything)', () => {
    // catalog-show-all-and-clear-data: sole consumer is the product catalog
    // (products.tsx:58), which must list inactive products too. The sale path
    // uses getProductsToSaleByCategoryId (PROD-17), untouched by this change.
    it('resolves every product of the category regardless of isActive/availableToSale, sorted by order', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      // Add in ascending order to avoid the repository's order-shift reordering the setup.
      productRepository.addProduct(categoryId, 'B', 1, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'A', 1, '', 2, true, false, true);
      productRepository.addProduct(categoryId, 'C', 1, '', 3, false, true, true);

      const result = await service.getAvailableProductsByCategoryId(categoryId);
      const data = unwrap(result);
      expect(data).toHaveLength(3);
      expect(data.map((p) => p.name)).toEqual(['B', 'A', 'C']);
      expect(data.map((p) => p.order)).toEqual([1, 2, 3]);
    });

    it('does not leak products from another category', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const bebidasId = categoryRepository.addProductCategoryByName('Bebidas');
      const snacksId = categoryRepository.addProductCategoryByName('Snacks');
      productRepository.addProduct(bebidasId, 'Coca Cola', 1, '', 1, false, false, true);

      const result = await service.getAvailableProductsByCategoryId(snacksId);
      expect(unwrap(result)).toEqual([]);
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
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
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
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      const created = productRepository.getProductsByCategoryId(categoryId)[0];

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
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true, 'ABC123');

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
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      const created = productRepository.getProductsByCategoryId(categoryId)[0];

      const result = await service.deleteProduct(created.id);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      expect(productRepository.getProductById(created.id)?.isActive).toBe(false);
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
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);
      productRepository.addProduct(categoryId, 'Fanta', 1.5, '', 2, true, false, true);

      const result = await service.getProductsToSaleByCategoryId(categoryId);
      const data = unwrap(result);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Coca Cola');
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
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
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
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, false);
      const created = productRepository.getProductsByCategoryId(categoryId)[0];

      const result = await service.setDiscountFromInvantory(created.id, true);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
      expect(productRepository.getProductById(created.id)?.discountFromInvantory).toBe(true);
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

      const bebidasId = categoryRepository.addProductCategoryByName('Bebidas');
      const snacksId = categoryRepository.addProductCategoryByName('Snacks');
      productRepository.addProduct(bebidasId, 'Fanta', 1, '', 2, true, true, true);
      productRepository.addProduct(bebidasId, 'Coca Cola', 1, '', 1, true, true, true);
      productRepository.addProduct(snacksId, 'Papas', 1, '', 1, true, true, true);

      const result = await service.getProductsToSelect();
      expect(unwrap(result).map((p) => p.fullName)).toEqual([
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
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');

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
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
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
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');

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
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');

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
    it('creates the category by name when absent, then the product with discountFromInvantory: true, and always resolves succeeded:true (ADR-1)', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);

      const result = await service.createCsvProducts([{ category: 'Snacks', name: 'Papas', price: 1.5 }]);
      if (!result.succeeded) throw new Error('expected succeeded response');
      expect(result.succeeded).toBe(true);
      expect(result.data.created).toHaveLength(1);
      expect(result.data.failed).toHaveLength(0);
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
      const existingId = categoryRepository.addProductCategoryByName('Bebidas');

      await service.createCsvProducts([{ category: 'Bebidas', name: 'Coca Cola', price: 1.5 }]);
      expect(categoryRepository.getProductCategories()).toHaveLength(1);
      expect(productRepository.getProductsByCategoryId(existingId)).toHaveLength(1);
    });

    it('created row carries a real generated id resolvable via productRepository.getProductById', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);

      const result = await service.createCsvProducts([{ category: 'Snacks', name: 'Papas', price: 1.5 }]);
      if (!result.succeeded) throw new Error('expected succeeded response');
      const createdRow = result.data.created[0];
      expect(createdRow.id).toBeTruthy();
      const persisted = productRepository.getProductById(createdRow.id);
      expect(persisted).not.toBeUndefined();
      expect(persisted!.name).toBe('Papas');
    });

    it('passes cost/quantity through unchanged onto the created row', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);

      const result = await service.createCsvProducts([
        { category: 'Snacks', name: 'Papas', price: 1.5, cost: 1, quantity: 20 },
      ]);
      if (!result.succeeded) throw new Error('expected succeeded response');
      expect(result.data.created[0]).toMatchObject({ cost: 1, quantity: 20 });
    });

    it('a duplicate name+category lands in failed and creates nothing', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);

      const result = await service.createCsvProducts([{ category: 'Bebidas', name: 'Coca Cola', price: 1.5 }]);
      if (!result.succeeded) throw new Error('expected succeeded response');
      expect(result.data.created).toHaveLength(0);
      expect(result.data.failed).toHaveLength(1);
      expect(result.data.failed[0]).toMatchObject({ category: 'Bebidas', name: 'Coca Cola' });
      expect(productRepository.getProductsByCategoryId(categoryId)).toHaveLength(1);
    });

    it('a mixed batch splits correctly between created and failed', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);

      const result = await service.createCsvProducts([
        { category: 'Bebidas', name: 'Coca Cola', price: 1.5 },
        { category: 'Bebidas', name: 'Fanta', price: 1.2 },
      ]);
      if (!result.succeeded) throw new Error('expected succeeded response');
      expect(result.data.created).toHaveLength(1);
      expect(result.data.created[0].name).toBe('Fanta');
      expect(result.data.failed).toHaveLength(1);
      expect(result.data.failed[0].name).toBe('Coca Cola');
    });

    it('resolves succeeded:true even when failed is non-empty (ADR-1)', async () => {
      const categoryRepository = new ProductCategoryRepository(storeId);
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductOfflineService(storeId, productRepository, categoryRepository);
      const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
      productRepository.addProduct(categoryId, 'Coca Cola', 1.5, '', 1, true, true, true);

      const result = await service.createCsvProducts([{ category: 'Bebidas', name: 'Coca Cola', price: 1.5 }]);
      expect(result.succeeded).toBe(true);
    });
  });
});
