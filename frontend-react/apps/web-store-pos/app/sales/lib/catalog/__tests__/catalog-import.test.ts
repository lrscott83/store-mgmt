import { describe, expect, it, vi } from 'vitest';
import { Currency, DEFAULT_CURRENCY, Result } from '@store-mgmt/domain';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import type { CatalogProductView } from '../../services/catalog-http-service';
import { importCatalogProducts } from '../catalog-import';

function makeView(overrides: Partial<CatalogProductView> = {}): CatalogProductView {
  return {
    id: 'p-new',
    categoryId: 'c-new',
    categoryName: 'Bebidas',
    name: 'Coca Cola',
    price: 1.5,
    currency: 'CUP',
    order: 3,
    categoryOrder: 2,
    availableToSale: true,
    isActive: true,
    description: '',
    percentDiscountPrice: 0,
    discountPrice: 0,
    isNew: false,
    image: null,
    images: [],
    finalPrice: 1.5,
    hasDiscount: false,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'c-1', name: 'Bebidas', order: 1, isActive: true, ...overrides };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    name: 'Coca Cola',
    categoryId: 'c-1',
    categoryName: 'Bebidas',
    price: 1.5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: '',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

function makeRepositories(options: {
  categories?: ProductCategory[];
  products?: Product[];
  insertCategoryResult?: Result;
  insertProductResult?: Result;
} = {}) {
  const categories = new Map((options.categories ?? []).map((c) => [c.id, c]));
  const products = new Map((options.products ?? []).map((p) => [p.id, p]));

  return {
    categoryRepository: {
      getProductCategoryById: vi.fn((id: string) => categories.get(id)),
      addImportedProductCategory: vi.fn((category: ProductCategory) => {
        const result = options.insertCategoryResult ?? Result.Success();
        if (result.succeeded) categories.set(category.id, category);
        return result;
      }),
    },
    productRepository: {
      getProductById: vi.fn((id: string) => products.get(id)),
      addProductData: vi.fn(() => options.insertProductResult ?? Result.Success()),
    },
  };
}

describe('importCatalogProducts — identidad por id', () => {
  it('no inserta ni toca nada cuando el id del producto ya existe localmente', () => {
    const view = makeView({ id: 'p-1', categoryId: 'c-absent', name: 'Coca Cola' });
    const repositories = makeRepositories({ products: [makeProduct({ id: 'p-1' })] });

    const summary = importCatalogProducts([view], repositories);

    expect(repositories.productRepository.addProductData).not.toHaveBeenCalled();
    // Ni siquiera la categoría del producto existente se crea: el id ya está, no se toca nada.
    expect(repositories.categoryRepository.addImportedProductCategory).not.toHaveBeenCalled();
    expect(summary).toEqual({
      importedCount: 0,
      existingCount: 1,
      failedCategories: [],
      failedProducts: [],
    });
  });

  it('reutiliza la categoría existente sin volver a insertarla', () => {
    const repositories = makeRepositories({ categories: [makeCategory({ id: 'c-1' })] });

    const summary = importCatalogProducts([makeView({ categoryId: 'c-1' })], repositories);

    expect(repositories.categoryRepository.addImportedProductCategory).not.toHaveBeenCalled();
    expect(summary.importedCount).toBe(1);
  });
});

describe('importCatalogProducts — producto nuevo', () => {
  it('inserta con el order del servidor y la moneda parseada por nombre', () => {
    const repositories = makeRepositories({ categories: [makeCategory({ id: 'c-1' })] });

    const summary = importCatalogProducts(
      [
        makeView({
          id: 'p-new',
          categoryId: 'c-1',
          name: 'Coca Cola',
          price: 1.75,
          order: 7,
          currency: 'USD',
        }),
      ],
      repositories,
    );

    expect(repositories.productRepository.addProductData).toHaveBeenCalledWith(
      'p-new',
      'c-1',
      'Coca Cola',
      1.75,
      '',
      7,
      true,
      true,
      true,
      undefined,
      undefined,
      Currency.USD,
    );
    expect(summary).toEqual({
      importedCount: 1,
      existingCount: 0,
      failedCategories: [],
      failedProducts: [],
    });
  });

  it('cae en DEFAULT_CURRENCY cuando el nombre de la moneda no se reconoce', () => {
    const repositories = makeRepositories({ categories: [makeCategory({ id: 'c-1' })] });

    importCatalogProducts([makeView({ categoryId: 'c-1', currency: 'XYZ' })], repositories);

    expect(repositories.productRepository.addProductData).toHaveBeenCalledWith(
      'p-new',
      'c-1',
      'Coca Cola',
      1.5,
      '',
      3,
      true,
      true,
      true,
      undefined,
      undefined,
      DEFAULT_CURRENCY,
    );
  });
});

describe('importCatalogProducts — categoría nueva', () => {
  it('crea la categoría con id y order del servidor y después inserta su producto', () => {
    const repositories = makeRepositories();

    const summary = importCatalogProducts(
      [
        makeView({
          id: 'p-new',
          categoryId: 'c-server',
          categoryName: 'Snacks',
          categoryOrder: 9,
          order: 4,
        }),
      ],
      repositories,
    );

    expect(repositories.categoryRepository.addImportedProductCategory).toHaveBeenCalledWith({
      id: 'c-server',
      name: 'Snacks',
      order: 9,
      isActive: true,
    });
    expect(repositories.productRepository.addProductData).toHaveBeenCalledWith(
      'p-new',
      'c-server',
      'Coca Cola',
      1.5,
      '',
      4,
      true,
      true,
      true,
      undefined,
      undefined,
      DEFAULT_CURRENCY,
    );
    expect(summary.importedCount).toBe(1);
  });

  it('crea la categoría UNA sola vez para varios productos del mismo id', () => {
    const repositories = makeRepositories();

    importCatalogProducts(
      [
        makeView({ id: 'p-1', categoryId: 'c-server' }),
        makeView({ id: 'p-2', categoryId: 'c-server' }),
        makeView({ id: 'p-3', categoryId: 'c-server' }),
      ],
      repositories,
    );

    expect(repositories.categoryRepository.addImportedProductCategory).toHaveBeenCalledTimes(1);
    expect(repositories.productRepository.addProductData).toHaveBeenCalledTimes(3);
  });

  it('no importa los productos de una categoría que no se pudo insertar y la reporta', () => {
    const repositories = makeRepositories({
      categories: [makeCategory({ id: 'c-ok', name: 'Bebidas' })],
      insertCategoryResult: Result.Failure([]),
    });

    const summary = importCatalogProducts(
      [
        makeView({ id: 'p-bad-1', categoryId: 'c-bad', categoryName: 'Rota' }),
        makeView({ id: 'p-bad-2', categoryId: 'c-bad', categoryName: 'Rota' }),
        makeView({ id: 'p-ok', categoryId: 'c-ok', categoryName: 'Bebidas' }),
      ],
      repositories,
    );

    // El producto de la categoría que sí resolvió se importa; los de la categoría rota no.
    expect(repositories.productRepository.addProductData).toHaveBeenCalledTimes(1);
    expect(repositories.productRepository.addProductData).toHaveBeenCalledWith(
      'p-ok',
      'c-ok',
      'Coca Cola',
      1.5,
      '',
      3,
      true,
      true,
      true,
      undefined,
      undefined,
      DEFAULT_CURRENCY,
    );
    expect(summary.importedCount).toBe(1);
    expect(summary.failedCategories).toEqual([
      { id: 'c-bad', name: 'Rota', skippedProductsCount: 2 },
    ]);
    expect(summary.failedProducts).toEqual([]);
  });
});

describe('importCatalogProducts — producto que no se pudo insertar', () => {
  it('lo reporta y sigue contando los ya existentes', () => {
    const repositories = makeRepositories({
      categories: [makeCategory({ id: 'c-1' })],
      products: [makeProduct({ id: 'p-old' })],
      insertProductResult: Result.Failure([]),
    });

    const summary = importCatalogProducts(
      [
        makeView({ id: 'p-old', categoryId: 'c-1' }),
        makeView({ id: 'p-bad', categoryId: 'c-1', name: 'Fanta' }),
      ],
      repositories,
    );

    expect(repositories.productRepository.addProductData).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({
      importedCount: 0,
      existingCount: 1,
      failedCategories: [],
      failedProducts: [{ id: 'p-bad', name: 'Fanta' }],
    });
  });
});
