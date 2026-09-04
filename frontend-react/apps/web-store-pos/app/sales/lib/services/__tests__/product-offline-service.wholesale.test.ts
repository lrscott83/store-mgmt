import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseResponseModel, UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '../product-offline-service';
import { ProductCategoryRepository } from '../../repositories/product-category-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

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

describe('ProductOfflineService — roundtrip de la config mayorista', () => {
  let service: ProductOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    service = new ProductOfflineService(storeId);
  });

  it('createProduct con wholesale persiste y getProductById lo devuelve', async () => {
    const categoryId = new ProductCategoryRepository(storeId).addProductCategoryByName('Bebidas');
    const created = await service.createProduct(
      categoryId,
      'Cerveza',
      700,
      '',
      0,
      true,
      true,
      true,
      undefined,
      { packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] },
    );
    expect(created.succeeded).toBe(true);

    // Buscar por nombre para obtener el id generado (sin acceso directo al repositorio).
    const all = await service.getProductsByCategoryId(categoryId);
    const product = unwrap(all).find((p) => p.name === 'Cerveza');
    expect(product).toBeDefined();
    expect(product!.wholesaleEnabled).toBe(true);
    expect(product!.wholesalePackSize).toBe(24);
    expect(product!.wholesaleTiers).toEqual([{ minPacks: 1, pricePerUnit: 680 }]);
  });

  it('updateProduct con wholesale actualiza la config del producto existente', async () => {
    const categoryId = new ProductCategoryRepository(storeId).addProductCategoryByName('Bebidas');
    await service.createProduct(categoryId, 'Ron', 800, '', 0, true, true, true);
    const all1 = await service.getProductsByCategoryId(categoryId);
    const product = unwrap(all1).find((p) => p.name === 'Ron')!;

    const updated = await service.updateProduct(
      product.id,
      product.categoryId,
      product.name,
      800,
      product.businessId,
      product.order,
      product.isActive,
      product.availableToSale,
      product.discountFromInvantory,
      undefined,
      { packSize: 6, tiers: [{ minPacks: 1, pricePerUnit: 780 }] },
    );
    expect(updated.succeeded).toBe(true);

    const fetched = unwrap(await service.getProductById(product.id));
    expect(fetched.wholesaleEnabled).toBe(true);
    expect(fetched.wholesalePackSize).toBe(6);
    expect(fetched.wholesaleTiers).toEqual([{ minPacks: 1, pricePerUnit: 780 }]);
  });

  it('producto sin config mayorista no expone los campos', async () => {
    const categoryId = new ProductCategoryRepository(storeId).addProductCategoryByName('Bebidas');
    await service.createProduct(categoryId, 'Pan', 50, '', 0, true, true, true);
    const all = await service.getProductsByCategoryId(categoryId);
    const product = unwrap(all).find((p) => p.name === 'Pan')!;
    expect(product.wholesaleEnabled).toBeUndefined();
    expect(product.wholesaleTiers).toBeUndefined();
  });
});