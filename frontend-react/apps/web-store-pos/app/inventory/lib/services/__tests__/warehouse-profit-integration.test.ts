import { beforeEach, describe, expect, it } from 'vitest';
import { EModules, OrderType, PaymentType } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { WarehouseOfflineService } from '~/inventory/lib/services/warehouse-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';

/**
 * I-3f (Fase 4): ganancia multi-tramo. Una salida de 15 hecha de 10@$5 + 5@$10
 * llega a la tienda como DOS entradas; una venta de 12 consume FIFO 10@$5 + 2@$10
 * → `productCosts` con DOS tramos y `calculateOrderProfit` los suma.
 *
 * Integración REAL (sin mocks): warehouse + inventory + orders comparten storage.
 */

const storeId = 'store-i3f';

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
    expiresIn: Date.now() + 1_000_000,
    roles: [],
    featureIds: [],
    storeModuleIds: [EModules.Inventory],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: storeId,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function seedProduct(): ProductRepository {
  const categoryRepo = new ProductCategoryRepository(storeId);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  categoryRepo.addImportedProductCategory({
    id: 'cat-1',
    name: 'Cerveza',
    order: 1,
    isActive: true,
  });
  productRepo.addImportedProduct({
    id: 'prod-1',
    name: 'Cerveza X',
    categoryId: 'cat-1',
    categoryName: 'Cerveza',
    price: 100,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: storeId,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
  });
  return productRepo;
}

describe('I-3f — ganancia multi-tramo (FIFO por lote)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: makeUser(),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('una salida de 15 (10@$5 + 5@$10) y una venta de 12 → dos tramos en productCosts', async () => {
    const productRepo = seedProduct();
    const inventoryService = new InventoryOfflineService(storeId, productRepo);
    const warehouse = new WarehouseOfflineService(storeId, productRepo, inventoryService);

    const wh = warehouse.createWarehouse('A').data!;
    warehouse.recordMovement({
      type: 'purchase_in',
      warehouseId: wh.id,
      productId: 'prod-1',
      quantity: 10,
      costPrice: 5,
    });
    warehouse.recordMovement({
      type: 'purchase_in',
      warehouseId: wh.id,
      productId: 'prod-1',
      quantity: 5,
      costPrice: 10,
    });
    // Salida de 15: 10@$5 + 5@$10 → dos entradas espejo.
    const sale = warehouse.recordMovement({
      type: 'sale_out',
      warehouseId: wh.id,
      productId: 'prod-1',
      quantity: 15,
      toStoreId: 'store-1',
    });
    expect(sale.succeeded).toBe(true);
    expect(sale.data).toHaveLength(2);

    const product = productRepo.getProductById('prod-1')!;
    const orders = new OrderOfflineService(storeId);
    const created = await orders.createOrder(
      [{ product, quantity: 12 }],
      OrderType.Normal,
      false,
      PaymentType.Efectivo,
    );
    expect(created.succeeded).toBe(true);

    const item = created.data!.orderItems[0];
    // DOS tramos, en orden FIFO: 10@$5 y 2@$10.
    expect(item.productCosts).toHaveLength(2);
    expect(item.productCosts[0]).toMatchObject({ costPrice: 5, quantity: 10 });
    expect(item.productCosts[1]).toMatchObject({ costPrice: 10, quantity: 2 });

    // La ganancia usa ambos tramos: revenue=1200, cost=10*5+2*10=70, profit=1130.
    const profit = calculateOrderProfit(item);
    expect(profit.revenue).toBe(1200);
    expect(profit.cost).toBe(70);
    expect(profit.profit).toBe(1130);
  });
});
