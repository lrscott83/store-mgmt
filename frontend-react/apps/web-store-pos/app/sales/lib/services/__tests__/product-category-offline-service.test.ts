import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseResponseModel, UserModel } from '@store-mgmt/domain';
import { ProductCategoryOfflineService } from '../product-category-offline-service';
import { ProductCategoryRepository } from '../../repositories/product-category-repository';
import { ProductRepository } from '../../repositories/product-repository';
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

describe('ProductCategoryOfflineService — async category-C surface (Angular parity, Phase 2 slice 5)', () => {
  let service: ProductCategoryOfflineService;
  let categoryRepository: ProductCategoryRepository;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true, isLoading: false, error: null });
    categoryRepository = new ProductCategoryRepository(storeId);
    service = new ProductCategoryOfflineService(storeId, categoryRepository);
  });

  describe('CAT-01: createProductCategory', () => {
    it('resolves a success envelope with data: true on create', async () => {
      const result = await service.createProductCategory('Bebidas', 1, true);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });
    });

    it('persists the category, retrievable via the repository', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      const all = categoryRepository.getProductCategories();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Bebidas');
      expect(all[0].isActive).toBe(true);
    });

    it('resolves a failure envelope (never rejects) on a duplicate name', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      const result = await service.createProductCategory('Bebidas', 2, true);
      expect(result.succeeded).toBe(false);
      expect(result.data).toBeNull();
      expect(result.errors).toEqual([{ code: 'ProductCategory.NameExists', description: 'El nombre de la categoría ya existe.' }]);
    });
  });

  describe('CAT-02: updateProductCategory', () => {
    it('resolves a success envelope and persists the change', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      const [existing] = categoryRepository.getProductCategories();

      const result = await service.updateProductCategory(existing.id, 'Bebidas Frías', 2, false);
      expect(result).toEqual({ data: true, succeeded: true, message: '', actionCode: 200, errors: [] });

      const updated = categoryRepository.getProductCategoryById(existing.id);
      expect(updated?.name).toBe('Bebidas Frías');
      expect(updated?.order).toBe(2);
      expect(updated?.isActive).toBe(false);
    });

    it('resolves a failure envelope for a non-existent id', async () => {
      const result = await service.updateProductCategory('missing-id', 'X', 1, true);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'ProductCategory.NotExists', description: 'La categoría no existe.' }]);
    });
  });

  describe('CAT-06: storage key', () => {
    it('uses the correct localStorage key pattern', async () => {
      await service.createProductCategory('Test', 1, true);
      const raw = localStorage.getItem('lizoft.store-product-categories-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('CAT-09: getMaxOrder (global, distinct from Product per-category getMaxOrder)', () => {
    it('resolves 0 when there are no categories', async () => {
      const result = await service.getMaxOrder();
      expect(result).toEqual({ data: 0, succeeded: true, message: '', actionCode: 200, errors: [] });
    });

    it('resolves the global max order across all categories', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      await service.createProductCategory('Snacks', 2, true);
      await service.createProductCategory('Galletas', 3, true);
      const result = await service.getMaxOrder();
      expect(result.data).toBe(3);
    });

    // The catalog sorts by category.order (products.tsx), and an inactive category still
    // occupies its slot. If the max ignored inactive rows, a new category could be created
    // with an order that collides with a deactivated one.
    it('includes INACTIVE categories in the max', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      await service.createProductCategory('Snacks', 7, false);
      const result = await service.getMaxOrder();
      expect(result.data).toBe(7);
    });

    // Guards the rename in ProductService: this method reads ProductCategory.order, NOT the
    // order of any product inside a category. A product at order 99 must not raise it.
    it('reads category.order, never a contained product order', async () => {
      const productRepository = new ProductRepository(storeId, categoryRepository);
      service = new ProductCategoryOfflineService(storeId, categoryRepository, productRepository);
      await service.createProductCategory('Bebidas', 2, true);
      const [bebidas] = categoryRepository.getProductCategories();
      productRepository.addProduct(bebidas.id, 'Coca Cola', 1.5, '', 99, true, true, true);

      const result = await service.getMaxOrder();
      expect(result.data).toBe(2);
    });
  });

  describe('CAT-10: getAvailableProductCategories', () => {
    it('resolves only active categories, sorted ascending by order', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      await service.createProductCategory('Snacks', 2, true);
      await service.createProductCategory('Galletas', 3, true);
      const [, snacks] = categoryRepository.getProductCategories();
      await service.updateProductCategory(snacks.id, snacks.name, snacks.order, false);

      const result = await service.getAvailableProductCategories();
      expect(result.succeeded).toBe(true);
      const data = unwrap(result);
      expect(data.map((c) => c.name)).toEqual(['Bebidas', 'Galletas']);
      expect(data.every((c) => c.isActive)).toBe(true);
    });
  });

  describe('CAT-11: getProductCategories sort — sorted ascending by order regardless of insertion order', () => {
    it('returns categories sorted ascending by order', async () => {
      // Seed via `updateCategories` (raw positional write, no order-shift business rule) to
      // isolate the repository's SORT behavior from addProductCategoryData's order-shift-on-insert
      // rule (covered separately by CAT-01 above / product-category-repository.test.ts).
      categoryRepository.updateCategories(
        new Map([
          ['c-c', { id: 'c-c', name: 'C', order: 3, isActive: true }],
          ['c-a', { id: 'c-a', name: 'A', order: 1, isActive: true }],
          ['c-b', { id: 'c-b', name: 'B', order: 2, isActive: true }],
        ]),
      );

      const all = categoryRepository.getProductCategories();
      expect(all.map((c) => c.order)).toEqual([1, 2, 3]);
      expect(all.map((c) => c.name)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('CAT-12: getProductCategoriesView (catalog view — everything)', () => {
    // catalog-show-all-and-clear-data: this view feeds the product catalog and
    // nothing else, and the catalog must show every category and count every
    // product. The sale path keeps its own stricter methods (CAT-10,
    // PROD-17), which this change does not touch.
    it('counts EVERY product of the category, including inactive and non-sellable ones', async () => {
      await service.createProductCategory('Bebidas', 1, true);
      await service.createProductCategory('Snacks', 2, true);
      const [bebidas, snacks] = categoryRepository.getProductCategories();

      const productRepository = new ProductRepository(storeId, categoryRepository);
      // isActive && availableToSale
      productRepository.addProduct(bebidas.id, 'Coca Cola', 1, 'biz', 1, true, true, false, '1');
      // isActive but NOT availableToSale — counted now, excluded before
      productRepository.addProduct(bebidas.id, 'Fanta', 1, 'biz', 2, true, false, false, '2');
      // not active at all — counted now, excluded before
      productRepository.addProduct(bebidas.id, 'Sprite', 1, 'biz', 3, false, true, false, '3');

      const view = await service.getProductCategoriesView();
      expect(view.succeeded).toBe(true);
      const viewData = unwrap(view);
      const bebidasView = viewData.find((v) => v.id === bebidas.id)!;
      expect(bebidasView.productsCount).toBe(3);
      const snacksView = viewData.find((v) => v.id === snacks.id)!;
      expect(snacksView.productsCount).toBe(0);
    });

    it('includes inactive categories in the view result, flagged by isActive', async () => {
      await service.createProductCategory('ActiveCat', 1, true);
      await service.createProductCategory('InactiveCat', 2, true);
      const [active, inactive] = categoryRepository.getProductCategories();
      await service.updateProductCategory(inactive.id, inactive.name, inactive.order, false);

      const view = await service.getProductCategoriesView();
      const viewData = unwrap(view);
      expect(viewData.map((v) => v.id)).toEqual([active.id, inactive.id]);
      expect(viewData.find((v) => v.id === active.id)!.isActive).toBe(true);
      expect(viewData.find((v) => v.id === inactive.id)!.isActive).toBe(false);
    });

    it('resolves an empty array when there are no categories at all', async () => {
      const view = await service.getProductCategoriesView();
      expect(view).toEqual({ data: [], succeeded: true, message: '', actionCode: 200, errors: [] });
    });
  });

  describe('getProductCategories (offline-only, NOT on the abstract interface)', () => {
    it('resolves all categories including inactive ones, never fails', async () => {
      await service.createProductCategory('Active', 1, true);
      await service.createProductCategory('Inactive', 2, true);
      const [, inactive] = categoryRepository.getProductCategories();
      await service.updateProductCategory(inactive.id, inactive.name, inactive.order, false);

      const result = await service.getProductCategories();
      expect(result.succeeded).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('constructor accepts optional categoryRepository/productRepository (Angular 3-arg parity)', () => {
    it('delegates to an explicitly-injected ProductCategoryRepository instance', async () => {
      const injectedRepository = new ProductCategoryRepository(storeId);
      const injected = new ProductCategoryOfflineService(storeId, injectedRepository);

      await injected.createProductCategory('Injected', 1, true);
      // Reading through the SAME repository instance confirms delegation, not a fresh one.
      expect(injectedRepository.getProductCategories().map((c) => c.name)).toContain('Injected');
    });
  });

  describe('removed methods (Exact-Surface Rule — no Angular category-SERVICE correlate)', () => {
    it('does not expose save/addByName/getByName/hasAnyCategory/hasAnyAvailableCategory', () => {
      const svc = service as unknown as Record<string, unknown>;
      expect(svc.save).toBeUndefined();
      expect(svc.addByName).toBeUndefined();
      expect(svc.getByName).toBeUndefined();
      expect(svc.hasAnyCategory).toBeUndefined();
      expect(svc.hasAnyAvailableCategory).toBeUndefined();
    });

    it('does not expose the retired getAll/getById/delete sync surface (Phase 2 step 8 cleanup)', () => {
      const svc = service as unknown as Record<string, unknown>;
      expect(svc.getAll).toBeUndefined();
      expect(svc.getById).toBeUndefined();
      expect(svc.delete).toBeUndefined();
    });
  });
});
