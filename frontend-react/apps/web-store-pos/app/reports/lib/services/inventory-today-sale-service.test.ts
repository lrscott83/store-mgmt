import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { Order, OrderItem, Product, InventoryEntry, InventoryEntryView } from '@store-mgmt/domain';

// ─── Mock dependencies (report-aggregation-service.test.ts precedent) ────────

// WU4 (product-service-parity Phase 1): InventoryTodaySaleService now depends on
// ProductRepository directly (Angular's inventory-today-sale.component.ts:39,178 injects the
// REPOSITORY, not the service) — mock the repository's getAvailableProducts(), not
// ProductOfflineService.getAll().
vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn(),
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn(),
}));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn(),
}));

import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { InventoryTodaySaleService } from './inventory-today-sale-service';

// WU3 (service-return-shape-parity Slice 1, category B): getInventoryEntriesInDay now returns sync
// BaseResponseModel<InventoryEntryView[]> (was a bare array).
function bm<T>(data: T): { data: T; succeeded: true; message: ''; actionCode: 200; errors: [] } {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Ron',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    price: 10,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: '',
    ...overrides,
  };
}

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'Ron',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    name: 'Ron',
    quantity: 1,
    price: 10,
    productBusinessId: '',
    productCosts: [],
    order: 0,
    ...overrides,
  };
}

function makeOrder(orderItems: OrderItem[], overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderItems,
    total: 0,
    itemsCount: orderItems.length,
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: '',
    ...overrides,
  };
}

function makeInventoryEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: 'e1',
    productId: 'p1',
    categoryId: 'cat1',
    quantity: 1,
    available: 1,
    costPrice: 1,
    date: new Date(),
    order: 0,
    isActive: true,
    createdDate: new Date(),
    createdByName: '',
    ...overrides,
  };
}

function makeEntryView(overrides: Partial<InventoryEntryView> = {}): InventoryEntryView {
  return {
    id: 'e1',
    productId: 'p1',
    productName: 'Ron',
    quantity: 1,
    costPrice: 1,
    date: new Date(),
    isActive: true,
    ...overrides,
  };
}

describe('InventoryTodaySaleService', () => {
  let mockProductRepository: { getAvailableProducts: ReturnType<typeof vi.fn> };
  let mockOrderService: { getActiveOrdersInDay: ReturnType<typeof vi.fn> };
  let mockInventoryService: {
    getInventoryEntriesInDay: ReturnType<typeof vi.fn>;
    getAvailableQuantity: ReturnType<typeof vi.fn>;
    getProductInventoriesByProductId: ReturnType<typeof vi.fn>;
    getAvailableInventoryCosts: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockProductRepository = { getAvailableProducts: vi.fn().mockReturnValue([]) };
    mockOrderService = { getActiveOrdersInDay: vi.fn().mockReturnValue([]) };
    mockInventoryService = {
      getInventoryEntriesInDay: vi.fn().mockReturnValue(bm([])),
      getAvailableQuantity: vi.fn().mockReturnValue({ hasEntries: false, available: 0 }),
      getProductInventoriesByProductId: vi.fn().mockReturnValue([]),
      getAvailableInventoryCosts: vi.fn().mockReturnValue([]),
    };

    vi.mocked(ProductRepository).mockImplementation(() => mockProductRepository as never);
    vi.mocked(OrderOfflineService).mockImplementation(() => mockOrderService as never);
    vi.mocked(InventoryOfflineService).mockImplementation(() => mockInventoryService as never);
  });

  // ─── Row composition / product filtering ──────────────────────────────────

  // WU4 (product-service-parity Phase 1): the active-only filter now lives in
  // ProductRepository.getAvailableProducts() itself (tested at the repository level) — this
  // service simply composes whatever the repository returns, one row per product.
  it('IT-01: returns exactly one row per product returned by ProductRepository.getAvailableProducts()', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([
      makeProduct({ id: 'p1', isActive: true }),
      makeProduct({ id: 'p3', isActive: true }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.productId).sort()).toEqual(['p1', 'p3']);
  });

  it('IT-02: Producto column carries the product name', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1', name: 'Vodka Premium' })]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].productName).toBe('Vodka Premium');
  });

  it('IT-03: U column is the hardcoded literal "U" (not a product unit-of-measure field)', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].unit).toBe('U');
  });

  // ─── Stock-movement columns (spec scenario: available=10, entry qty=5, sold qty=3) ──

  it('IT-04: Entrada = sum of today\'s inventory entry quantities for the product', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockInventoryService.getInventoryEntriesInDay.mockReturnValue(bm([
      makeEntryView({ productId: 'p1', quantity: 2 }),
      makeEntryView({ productId: 'p1', quantity: 3 }),
      makeEntryView({ productId: 'other', quantity: 100 }),
    ]));

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].entrada).toBe(5);
  });

  it('IT-05: Vendido = sum of today\'s order-item quantities for the product', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockOrderService.getActiveOrdersInDay.mockReturnValue([
      makeOrder([makeOrderItem({ productId: 'p1', quantity: 2 })]),
      makeOrder([makeOrderItem({ productId: 'p1', quantity: 1 })]),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].vendido).toBe(3);
  });

  it('IT-06: Disponible = available + Vendido; Inicio = Disponible - Entrada (spec scenario: available=10, entry=5, sold=3 -> Disponible=13, Inicio=8)', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockInventoryService.getAvailableQuantity.mockReturnValue({ hasEntries: true, available: 10 });
    mockInventoryService.getInventoryEntriesInDay.mockReturnValue(bm([makeEntryView({ productId: 'p1', quantity: 5 })]));
    mockOrderService.getActiveOrdersInDay.mockReturnValue([
      makeOrder([makeOrderItem({ productId: 'p1', quantity: 3 })]),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].disponible).toBe(13);
    expect(rows[0].inicio).toBe(8);
  });

  // ─── Sale-valuation columns ────────────────────────────────────────────────

  it('IT-07: Precio Venta and Importe Venta are 0.00 when there are no sales today', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].precioVenta).toBe(0);
    expect(rows[0].importeVenta).toBe(0);
  });

  it('IT-08: Precio Venta = avg(order-item prices); Importe Venta = Vendido x Precio Venta', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockOrderService.getActiveOrdersInDay.mockReturnValue([
      makeOrder([
        makeOrderItem({ productId: 'p1', price: 12, quantity: 2 }),
        makeOrderItem({ productId: 'p1', price: 8, quantity: 1 }),
      ]),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    // precioVenta = (12 + 8) / 2 = 10; vendido = 3; importeVenta = 30
    expect(rows[0].precioVenta).toBe(10);
    expect(rows[0].importeVenta).toBe(30);
  });

  // ─── Cost-valuation columns (spec scenario: entries {qty2,cost10},{qty3,cost20} -> 16.00) ──

  it('IT-09: Costo Unitario = quantity-weighted avg costPrice across active (available>0) entries', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([
      makeInventoryEntry({ id: 'e1', quantity: 2, available: 2, costPrice: 10 }),
      makeInventoryEntry({ id: 'e2', quantity: 3, available: 3, costPrice: 20 }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    // (2*10 + 3*20) / (2+3) = 80/5 = 16
    expect(rows[0].costoUnitario).toBe(16);
  });

  it('IT-10: Costo Unitario is 0 (guard) when the product has no active entries', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].costoUnitario).toBe(0);
  });

  it('IT-11: Costo Total = Vendido x Costo Unitario', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockOrderService.getActiveOrdersInDay.mockReturnValue([
      makeOrder([makeOrderItem({ productId: 'p1', price: 20, quantity: 3 })]),
    ]);
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([
      makeInventoryEntry({ quantity: 2, available: 2, costPrice: 10 }),
      makeInventoryEntry({ quantity: 3, available: 3, costPrice: 20 }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    // costoUnitario = 16; vendido = 3; costoTotal = 48
    expect(rows[0].costoTotal).toBe(48);
  });

  it('IT-12: C.P Venta = Costo Total / Importe Venta when Importe Venta > 0, else 0 (guard)', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockOrderService.getActiveOrdersInDay.mockReturnValue([
      makeOrder([makeOrderItem({ productId: 'p1', price: 10, quantity: 3 })]),
    ]);
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([
      makeInventoryEntry({ quantity: 2, available: 2, costPrice: 10 }),
      makeInventoryEntry({ quantity: 3, available: 3, costPrice: 20 }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    // importeVenta = 30, costoTotal = 48 -> cpVenta = 1.6
    expect(rows[0].cpVenta).toBeCloseTo(1.6, 5);
  });

  it('IT-12b: C.P Venta guard is 0 when Importe Venta is 0 (no sales, entries still exist)', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([
      makeInventoryEntry({ quantity: 2, available: 2, costPrice: 10 }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    expect(rows[0].cpVenta).toBe(0);
  });

  // ─── Closing-balance columns (spec scenario: Disponible=13, Vendido=3, CostoUnitario=16 -> Final=10, ImporteFinal=160.00) ──

  it('IT-13: Final = Disponible - Vendido; Importe Final = Final x Costo Unitario', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockInventoryService.getAvailableQuantity.mockReturnValue({ hasEntries: true, available: 10 });
    mockOrderService.getActiveOrdersInDay.mockReturnValue([
      makeOrder([makeOrderItem({ productId: 'p1', price: 10, quantity: 3 })]),
    ]);
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([
      makeInventoryEntry({ quantity: 2, available: 2, costPrice: 10 }),
      makeInventoryEntry({ quantity: 3, available: 3, costPrice: 20 }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    // disponible = 10 + 3 = 13; final = 13 - 3 = 10; costoUnitario = 16; importeFinal = 160
    expect(rows[0].disponible).toBe(13);
    expect(rows[0].final).toBe(10);
    expect(rows[0].importeFinal).toBe(160);
  });

  // ─── Col-9 divergence guard (design ADR-2 / CRITICAL) ─────────────────────

  it('DIVERGENCE GUARD: Costo Unitario is quantity-weighted, NOT available-weighted — diverges for a partially-sold entry', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    // Entry received 10 units @ cost 2, 8 already sold -> only 2 still available.
    // Quantity-weighted (Angular's live behavior, what col 9 MUST use): weight = quantity = 10.
    // Available-weighted (getInventoryCategoriesView's avgCostPrice, must NOT be used): weight = available = 2.
    // A second entry received 10 @ cost 5, none sold (quantity == available == 10).
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([
      makeInventoryEntry({ id: 'e1', quantity: 10, available: 2, costPrice: 2 }),
      makeInventoryEntry({ id: 'e2', quantity: 10, available: 10, costPrice: 5 }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    const rows = svc.getProductRows();

    // Quantity-weighted (CORRECT): (10*2 + 10*5) / (10+10) = 70/20 = 3.5
    const quantityWeighted = 3.5;
    // Available-weighted (WRONG — must NOT be produced): (2*2 + 10*5) / (2+10) = 54/12 = 4.5
    const availableWeighted = 4.5;

    expect(rows[0].costoUnitario).toBe(quantityWeighted);
    expect(rows[0].costoUnitario).not.toBe(availableWeighted);
  });

  it('MUTATION SAFETY: getProductRows never calls getAvailableInventoryCosts (which mutates/deducts stock via FIFO)', () => {
    mockProductRepository.getAvailableProducts.mockReturnValue([makeProduct({ id: 'p1' })]);
    mockInventoryService.getProductInventoriesByProductId.mockReturnValue([
      makeInventoryEntry({ quantity: 5, available: 5, costPrice: 3 }),
    ]);

    const svc = new InventoryTodaySaleService('store-1');
    svc.getProductRows();

    expect(mockInventoryService.getAvailableInventoryCosts).not.toHaveBeenCalled();
  });
});
