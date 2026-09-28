import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, type UserModel } from '@store-mgmt/domain';
import { ProductRepository } from '../../repositories/product-repository';
import { ProductCategoryRepository } from '../../repositories/product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { buildCatalogSnapshot } from '../catalog-snapshot';

const STORE_ID = 's1';

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
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: STORE_ID,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

/** Repositorios de la tienda de prueba (los mismos que lee `buildCatalogSnapshot`). */
function repositories(storeId = STORE_ID) {
  const categoryRepository = new ProductCategoryRepository(storeId);
  return { categoryRepository, productRepository: new ProductRepository(storeId, categoryRepository) };
}

describe('buildCatalogSnapshot — catálogo local del POS', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: makeUser(),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('SNAP-1: sin catálogo local devuelve listas vacías (nada que publicar)', () => {
    expect(buildCatalogSnapshot(STORE_ID)).toEqual({ categories: [], products: [] });
  });

  it('SNAP-2: arma categorías y productos con los hechos que el POS es dueño', () => {
    const { categoryRepository, productRepository } = repositories();
    const categoryId = categoryRepository.addProductCategoryByName('Ropa');
    productRepository.addProduct(categoryId, 'Camisa', 100, 'BIZ', 1, true, true, false);

    const snapshot = buildCatalogSnapshot(STORE_ID);

    expect(snapshot.categories).toEqual([{ id: categoryId, name: 'Ropa', order: 1, isActive: true }]);
    expect(snapshot.products).toEqual([
      {
        id: expect.any(String),
        categoryId,
        name: 'Camisa',
        price: 100,
        // La moneda del POS siempre existe (CUP por defecto) y viaja por valor del enum.
        currency: Currency.CUP,
        order: 1,
        availableToSale: true,
        isActive: true,
        businessId: 'BIZ',
        discountFromInventory: false,
      },
    ]);
  });

  it('SNAP-3: incluye inactivos y fuera de venta — el backend despublica, nunca borra (D6)', () => {
    const { categoryRepository, productRepository } = repositories();
    const activeCategoryId = categoryRepository.addProductCategoryByName('Ropa');
    const retiredCategoryId = categoryRepository.addProductCategoryByName('Verano');
    categoryRepository.deactivateProductCategory(retiredCategoryId, false);

    productRepository.addProductData('p-camisa', activeCategoryId, 'Camisa', 100, '', 1, true, true, true);
    productRepository.addProductData('p-gorra', activeCategoryId, 'Gorra', 50, '', 2, true, false, true);
    productRepository.addProductData('p-bufanda', activeCategoryId, 'Bufanda', 30, '', 3, true, true, true);
    productRepository.deleteProduct('p-bufanda');

    const snapshot = buildCatalogSnapshot(STORE_ID);

    expect(snapshot.categories).toContainEqual({
      id: retiredCategoryId,
      name: 'Verano',
      order: 2,
      isActive: false,
    });
    expect(snapshot.products.map((p) => [p.name, p.isActive, p.availableToSale])).toEqual([
      ['Camisa', true, true],
      ['Gorra', true, false],
      ['Bufanda', false, true],
    ]);
  });

  it('SNAP-4: `discountFromInvantory` viaja como `discountFromInventory` y la moneda por VALOR', () => {
    const { categoryRepository, productRepository } = repositories();
    const categoryId = categoryRepository.addProductCategoryByName('Bebidas');
    productRepository.addProduct(
      categoryId,
      'Cerveza',
      700,
      '',
      1,
      true,
      true,
      true,
      undefined,
      undefined,
      Currency.USD,
    );

    const [product] = buildCatalogSnapshot(STORE_ID).products;

    expect(product.discountFromInventory).toBe(true);
    expect(product.currency).toBe(Currency.USD);
  });

  it('SNAP-5: nunca viaja la galería — el POS no la tiene (D8)', () => {
    const { categoryRepository, productRepository } = repositories();
    const categoryId = categoryRepository.addProductCategoryByName('Ropa');
    productRepository.addProduct(categoryId, 'Camisa', 100, '', 1, true, true, true);

    expect(buildCatalogSnapshot(STORE_ID).products[0]).not.toHaveProperty('images');
  });

  it('SNAP-6: lee SOLO la tienda pedida (catálogos por dispositivo no se mezclan)', () => {
    const storeA = repositories('tienda-a');
    storeA.productRepository.addProduct(
      storeA.categoryRepository.addProductCategoryByName('Ropa'),
      'Camisa',
      100,
      '',
      1,
      true,
      true,
      true,
    );

    expect(buildCatalogSnapshot('tienda-b')).toEqual({ categories: [], products: [] });
    expect(buildCatalogSnapshot('tienda-a').products).toHaveLength(1);
  });
});
