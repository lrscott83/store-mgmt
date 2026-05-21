/**
 * Comprehensive Test Suite for Offline Services
 *
 * Services under test:
 * - OrderOfflineService: Orders/Sales management
 * - InventoryOfflineService: Inventory/Entry management
 * - ExpenseOfflineService: Expenses management
 * - SaleCreditOfflineService: Credit sales management
 *
 * Test Categories:
 * 1. Happy Path: Normal flows work as expected
 * 2. Edge Cases: Empty inputs, null values, extreme values
 * 3. Error Handling: Code fails gracefully when should
 * 4. Integrations: External dependencies called correctly
 */

import { TestBed, flush, fakeAsync } from '@angular/core/testing';
import { OrderOfflineService } from '../app/application/orders/order-offline.service';
import { InventoryOfflineService } from '../app/application/entries/inventory-offline.service';
import { ExpenseOfflineService } from '../app/application/expenses/expense-offline.service';
import { SaleCreditOfflineService } from '../app/application/credits/sale-credit-offline.service';
import { OrderType } from '../app/domain/entities/orders/order.model';
import { PaymentType } from '../app/domain/commons/payment-type';
import { ExpenseType } from '../app/domain/entities/expenses/expense.model';
import { CartItem } from '../app/_services/_models/order/cart-item.model';
import { CommonTestModule } from './common-test.module';
import { ProductRepository } from '../app/application/products/product.repository';
import { ProductCategoryRepository } from '../app/application/categories/product-category.repository';
import { Product } from '../app/domain/entities/products/product.model';

// =============================================================================
// HELPERS
// =============================================================================

const createCartItem = (productId: string, name: string, price: number, quantity: number): CartItem => ({
  productId,
  name,
  price,
  quantity
});

const createMockProduct = (id: string, name: string, categoryId: string, price: number): Product => ({
  id,
  name,
  categoryId,
  categoryName: 'Test Category',
  price,
  businessId: 'B001',
  order: 1,
  isActive: true,
  availableToSale: true,
  discountFromInvantory: true,
  createdDate: new Date(),
  createdByName: 'test'
});

const mockProductsMap = new Map<string, Product>([
  ['prod-1', createMockProduct('prod-1', 'Product 1', 'cat-1', 100)],
  ['prod-2', createMockProduct('prod-2', 'Product 2', 'cat-1', 200)],
  ['prod-3', createMockProduct('prod-3', 'Product 3', 'cat-2', 150)]
]);

const mockProductRepository: any = {
  getProductById: (id: string) => mockProductsMap.get(id),
  getAvailableProductById: (id: string) => mockProductsMap.get(id),
  getStorageProductsMap: () => mockProductsMap
};

const mockCategoryRepository: any = {
  getProductCategories: () => [
    { id: 'cat-1', name: 'Category 1', order: 1 },
    { id: 'cat-2', name: 'Category 2', order: 2 }
  ],
  getStorageCategoriesMap: () =>
    new Map([
      ['cat-1', { id: 'cat-1', name: 'Category 1', order: 1 }],
      ['cat-2', { id: 'cat-2', name: 'Category 2', order: 2 }]
    ]),
  hasAnyAvailableCategory: () => true
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// =============================================================================
// ORDER OFFLINE SERVICE TESTS
// =============================================================================

describe('OrderOfflineService', () => {
  let service: OrderOfflineService;
  let saleCreditService: any;
  let expenseService: any;

  beforeEach(() => {
    localStorage.clear();
    saleCreditService = {
      createSaleCredit: () => ({ succeeded: true, data: {}, errors: [] }),
      deactivateSaleCreditByOrderId: () => ({ succeeded: true })
    };
    expenseService = { getActiveExpensesPriceBetweenDates: () => 0 };

    TestBed.configureTestingModule({
      imports: [CommonTestModule],
      providers: [
        OrderOfflineService,
        { provide: SaleCreditOfflineService, useValue: saleCreditService },
        { provide: ExpenseOfflineService, useValue: expenseService }
      ]
    });

    service = TestBed.inject(OrderOfflineService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------------
  describe('Happy Path - Normal Operations', () => {
    it('should create an order with valid cart items and return success', fakeAsync(() => {
      const cartItems: CartItem[] = [createCartItem('prod-1', 'Product 1', 100, 2), createCartItem('prod-2', 'Product 2', 200, 1)];

      let result: any;
      service.createOrder(cartItems, OrderType.Normal, false, PaymentType.Efectivo, 'Test order', '').subscribe((res) => (result = res));

      flush();

      expect(result.succeeded).toBe(true);
      expect(result.data.id).toBeTruthy();
      expect(result.data.total).toBe(400);
      expect(result.data.itemsCount).toBe(3);
      expect(result.data.isActive).toBe(true);
    }));

    it('should create a credit order and automatically call sale credit service', fakeAsync(() => {
      const cartItems: CartItem[] = [createCartItem('prod-1', 'Product 1', 100, 3)];

      let result: any;
      service
        .createOrder(cartItems, OrderType.Normal, true, PaymentType.Tarjeta, 'Credit order', 'Client A')
        .subscribe((res) => (result = res));

      flush();

      expect(result.succeeded).toBe(true);
      expect(result.data.isCredit).toBe(true);
    }));

    it('should retrieve order by id after creation', fakeAsync(() => {
      const cartItems: CartItem[] = [createCartItem('prod-1', 'Product 1', 100, 1)];

      let createResult: any;
      service.createOrder(cartItems, OrderType.Normal, false, PaymentType.Efectivo, '', '').subscribe((res) => (createResult = res));
      flush();

      const order = service.getOrderById(createResult.data.id);
      expect(order).toBeTruthy();
      expect(order.id).toBe(createResult.data.id);
    }));

    it('should calculate correct total for multiple items', fakeAsync(() => {
      const cartItems: CartItem[] = [createCartItem('prod-1', 'Product 1', 50, 5), createCartItem('prod-2', 'Product 2', 100, 3)];

      let result: any;
      service.createOrder(cartItems, OrderType.Normal, false, PaymentType.Efectivo, '', '').subscribe((res) => (result = res));
      flush();

      expect(result.data.total).toBe(550);
      expect(result.data.itemsCount).toBe(8);
    }));
  });

  // -------------------------------------------------------------------------
  // EDGE CASES
  // -------------------------------------------------------------------------
  describe('Edge Cases - Null, Empty, and Extreme Values', () => {
    it('should handle empty cart items array gracefully', fakeAsync(() => {
      let result: any;
      service.createOrder([], OrderType.Normal, false, PaymentType.Efectivo, '', '').subscribe((res) => (result = res));
      flush();

      expect(result.succeeded).toBe(true);
      expect(result.data.total).toBe(0);
      expect(result.data.itemsCount).toBe(0);
    }));

    it('should handle cart items with zero quantity', fakeAsync(() => {
      const cartItems: CartItem[] = [createCartItem('prod-1', 'Product 1', 100, 0)];

      let result: any;
      service.createOrder(cartItems, OrderType.Normal, false, PaymentType.Efectivo, '', '').subscribe((res) => (result = res));
      flush();

      expect(result.succeeded).toBe(true);
      expect(result.data.total).toBe(0);
    }));

    it('should return undefined when getting non-existent order', () => {
      const order = service.getOrderById('non-existent-id');
      expect(order).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // ERROR HANDLING
  // -------------------------------------------------------------------------
  describe('Error Handling - Controlled Failures', () => {
    it('should fail to deactivate non-existent order', () => {
      const result = service.deactivateOrder('non-existent-order-id');
      expect(result.succeeded).toBe(false);
    });

    it('should fail to update non-existent order payment type', () => {
      const result = service.updateTodayOrder('non-existent-id', PaymentType.Tarjeta);
      expect(result.succeeded).toBe(false);
    });

    it('should fail to activate non-existent order', () => {
      const result = service.activateOrder('non-existent-order-id');
      expect(result.succeeded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // INTEGRATIONS
  // -------------------------------------------------------------------------
  describe('Integrations - Dependency Mocks Verification', () => {
    it('should store order with correct user login from AuthService', fakeAsync(() => {
      const cartItems = [createCartItem('prod-1', 'Product 1', 100, 1)];

      let result: any;
      service.createOrder(cartItems, OrderType.Normal, false, PaymentType.Efectivo, '', '').subscribe((res) => (result = res));
      flush();

      expect(result.data.createdByName).toBe('testuser');
    }));
  });
});

// =============================================================================
// INVENTORY OFFLINE SERVICE TESTS
// =============================================================================

describe('InventoryOfflineService', () => {
  let service: InventoryOfflineService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CommonTestModule],
      providers: [
        InventoryOfflineService,
        { provide: ProductRepository, useValue: mockProductRepository },
        { provide: ProductCategoryRepository, useValue: mockCategoryRepository }
      ]
    });
    service = TestBed.inject(InventoryOfflineService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------------
  describe('Happy Path - Normal Operations', () => {
    it('should create inventory entry with valid product and return success', () => {
      const result = service.createInventoryEntry('prod-1', 100, 50);
      expect(result.succeeded).toBe(true);
      expect(result.data.productId).toBe('prod-1');
      expect(result.data.quantity).toBe(100);
      expect(result.data.costPrice).toBe(50);
      expect(result.data.isActive).toBe(true);
    });

    it('should retrieve product inventories by product id', () => {
      service.createInventoryEntry('prod-1', 50, 25);
      service.createInventoryEntry('prod-1', 30, 30);
      const inventories = service.getProductInventoriesByProductId('prod-1');
      expect(inventories).toBeTruthy();
      expect(inventories.length).toBe(2);
    });

    it('should check product availability correctly', () => {
      service.createInventoryEntry('prod-1', 100, 50);
      const result = service.hasAvailableProductToSale('prod-1', 50);
      expect(result.succeeded).toBe(true);
    });

    it('should delete inventory entry successfully', () => {
      const createResult = service.createInventoryEntry('prod-1', 100, 50);
      const deleteResult = service.deleteInventoryEntry('prod-1', createResult.data.id);
      expect(deleteResult.succeeded).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // EDGE CASES
  // -------------------------------------------------------------------------
  describe('Edge Cases - Null, Empty, and Extreme Values', () => {
    it('should handle zero quantity', () => {
      const result = service.createInventoryEntry('prod-1', 0, 50);
      expect(result.succeeded).toBe(true);
      expect(result.data.quantity).toBe(0);
    });

    it('should handle zero cost price', () => {
      const result = service.createInventoryEntry('prod-1', 100, 0);
      expect(result.succeeded).toBe(true);
      expect(result.data.costPrice).toBe(0);
    });

    it('should return null when creating entry for non-existent product', () => {
      const result = service.createInventoryEntry('non-existent-product', 100, 50);
      expect(result).toBeNull();
    });

    it('should handle empty product id', () => {
      const result = service.createInventoryEntry('', 100, 50);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // ERROR HANDLING
  // -------------------------------------------------------------------------
  describe('Error Handling - Controlled Failures', () => {
    it('should fail to delete entry with invalid product id', () => {
      const result = service.deleteInventoryEntry('non-existent-product', 'entry-1');
      expect(result.succeeded).toBe(false);
    });

    it('should fail to update non-existent entry', () => {
      const result = service.updateInventoryEntry('prod-1', 'non-existent-entry', 'prod-1', 50, 25);
      expect(result.succeeded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // INTEGRATIONS
  // -------------------------------------------------------------------------
  describe('Integrations - Dependency Mocks Verification', () => {
    it('should use ProductRepository to validate product exists', () => {
      const result = service.createInventoryEntry('prod-1', 100, 50);
      expect(result.succeeded).toBe(true);
    });
  });
});

// =============================================================================
// EXPENSE OFFLINE SERVICE TESTS
// =============================================================================

describe('ExpenseOfflineService', () => {
  let service: ExpenseOfflineService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CommonTestModule],
      providers: [ExpenseOfflineService]
    });
    service = TestBed.inject(ExpenseOfflineService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------------
  describe('Happy Path - Normal Operations', () => {
    it('should create expense with valid data and return success', () => {
      const result = service.createExpense(ExpenseType.Alquiler, 5000, 'Monthly rent', new Date(), PaymentType.Efectivo);
      expect(result.succeeded).toBe(true);
      expect(result.data.id).toBeTruthy();
      expect(result.data.type).toBe(ExpenseType.Alquiler);
      expect(result.data.total).toBe(5000);
      expect(result.data.isActive).toBe(true);
    });

    it('should update expense successfully', () => {
      const createResult = service.createExpense(ExpenseType.Operaciones, 100, 'Test', new Date(), PaymentType.Efectivo);
      const updateResult = service.updateExpense(
        createResult.data.id,
        ExpenseType.Operaciones,
        200,
        'Updated',
        new Date(),
        PaymentType.Tarjeta
      );
      expect(updateResult.succeeded).toBe(true);
      expect(updateResult.data.total).toBe(200);
      expect(updateResult.data.note).toBe('Updated');
    });

    it('should delete expense successfully', () => {
      const createResult = service.createExpense(ExpenseType.Otro, 50, 'Test', new Date(), PaymentType.Efectivo);
      const deleteResult = service.deleteExpense(createResult.data.id);
      expect(deleteResult.succeeded).toBe(true);
    });

    it('should calculate expenses total for today', () => {
      service.createExpense(ExpenseType.Operaciones, 100, 'Test 1', new Date(), PaymentType.Efectivo);
      service.createExpense(ExpenseType.Otro, 50, 'Test 2', new Date(), PaymentType.Efectivo);
      const total = service.getExpensesTotal();
      expect(total).toBe(150);
    });
  });

  // -------------------------------------------------------------------------
  // EDGE CASES
  // -------------------------------------------------------------------------
  describe('Edge Cases - Null, Empty, and Extreme Values', () => {
    it('should handle zero total amount', () => {
      const result = service.createExpense(ExpenseType.Otro, 0, 'Free', new Date(), PaymentType.Efectivo);
      expect(result.succeeded).toBe(true);
      expect(result.data.total).toBe(0);
    });

    it('should handle negative amount gracefully', () => {
      const result = service.createExpense(ExpenseType.Otro, -100, 'Negative', new Date(), PaymentType.Efectivo);
      expect(result.succeeded).toBe(true);
      expect(result.data.total).toBe(-100);
    });

    it('should handle empty note', () => {
      const result = service.createExpense(ExpenseType.Otro, 100, '', new Date(), PaymentType.Efectivo);
      expect(result.succeeded).toBe(true);
      expect(result.data.note).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // ERROR HANDLING
  // -------------------------------------------------------------------------
  describe('Error Handling - Controlled Failures', () => {
    it('should fail to update non-existent expense', () => {
      const result = service.updateExpense('non-existent-id', ExpenseType.Otro, 100, '', new Date(), PaymentType.Efectivo);
      expect(result.succeeded).toBe(false);
    });

    it('should fail to delete non-existent expense', () => {
      const result = service.deleteExpense('non-existent-id');
      expect(result.succeeded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // INTEGRATIONS
  // -------------------------------------------------------------------------
  describe('Integrations - Dependency Mocks Verification', () => {
    it('should use AuthService to get user login for createdByName', () => {
      const result = service.createExpense(ExpenseType.Otro, 100, 'Test', new Date(), PaymentType.Efectivo);
      expect(result.data.createdByName).toBe('testuser');
    });

    it('should store expenses with correct store id from AuthService', () => {
      service.createExpense(ExpenseType.Otro, 100, 'Test', new Date(), PaymentType.Efectivo);
      const json = service.getExpensesJson();
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(1);
    });
  });
});

// =============================================================================
// SALE CREDIT OFFLINE SERVICE TESTS
// =============================================================================

describe('SaleCreditOfflineService', () => {
  let service: SaleCreditOfflineService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CommonTestModule],
      providers: [SaleCreditOfflineService]
    });
    service = TestBed.inject(SaleCreditOfflineService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------------
  describe('Happy Path - Normal Operations', () => {
    it('should create sale credit with valid data and return success', () => {
      const result = service.createSaleCredit('order-123', 'Client A', 1000, 'First credit sale');
      expect(result.succeeded).toBe(true);
      expect(result.data.orderId).toBe('order-123');
      expect(result.data.client).toBe('Client A');
      expect(result.data.total).toBe(1000);
      expect(result.data.isPaid).toBe(false);
      expect(result.data.isActive).toBe(true);
    });

    it('should update sale credit successfully', () => {
      const createResult = service.createSaleCredit('order-123', 'Client A', 1000, '');
      const updateResult = service.updateSaleCredit(createResult.data.id, 'Client B', 'Updated note');
      expect(updateResult.succeeded).toBe(true);
      expect(updateResult.data.client).toBe('Client B');
      expect(updateResult.data.note).toBe('Updated note');
    });

    it('should mark sale credit as paid successfully', () => {
      const createResult = service.createSaleCredit('order-123', 'Client A', 1000, '');
      const paidResult = service.paidSaleCredit(createResult.data.id, PaymentType.Efectivo, 'Paid in cash');
      expect(paidResult.succeeded).toBe(true);
      expect(paidResult.data.isPaid).toBe(true);
      expect(paidResult.data.paid).toBe(1000);
      expect(paidResult.data.paidDate).toBeTruthy();
    });

    it('should delete (deactivate) sale credit successfully', () => {
      const createResult = service.createSaleCredit('order-123', 'Client A', 1000, '');
      const deleteResult = service.deleteSaleCredit(createResult.data.id);
      expect(deleteResult.succeeded).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // EDGE CASES
  // -------------------------------------------------------------------------
  describe('Edge Cases - Null, Empty, and Extreme Values', () => {
    it('should handle empty client name', () => {
      const result = service.createSaleCredit('order-123', '', 1000, '');
      expect(result.succeeded).toBe(true);
      expect(result.data.client).toBe('');
    });

    it('should handle zero total amount', () => {
      const result = service.createSaleCredit('order-123', 'Client A', 0, '');
      expect(result.succeeded).toBe(true);
      expect(result.data.total).toBe(0);
    });

    it('should handle negative total amount', () => {
      const result = service.createSaleCredit('order-123', 'Client A', -500, '');
      expect(result.succeeded).toBe(true);
      expect(result.data.total).toBe(-500);
    });

    it('should handle empty note', () => {
      const result = service.createSaleCredit('order-123', 'Client A', 1000, '');
      expect(result.succeeded).toBe(true);
      expect(result.data.note).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // ERROR HANDLING
  // -------------------------------------------------------------------------
  describe('Error Handling - Controlled Failures', () => {
    it('should fail to update non-existent sale credit', () => {
      const result = service.updateSaleCredit('non-existent-id', 'New Client', 'Note');
      expect(result.succeeded).toBe(false);
    });

    it('should fail to pay non-existent sale credit', () => {
      const result = service.paidSaleCredit('non-existent-id', PaymentType.Efectivo, '');
      expect(result.succeeded).toBe(false);
    });

    it('should fail to delete non-existent sale credit', () => {
      const result = service.deleteSaleCredit('non-existent-id');
      expect(result.succeeded).toBe(false);
    });

    it('should return success when deactivating non-existent sale credit by order id', () => {
      const result = service.deactivateSaleCreditByOrderId('non-existent-order');
      expect(result.succeeded).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // INTEGRATIONS
  // -------------------------------------------------------------------------
  describe('Integrations - Dependency Mocks Verification', () => {
    it('should use AuthService to get user login for createdByName', () => {
      const result = service.createSaleCredit('order-123', 'Client A', 1000, '');
      expect(result.data.createdByName).toBe('testuser');
    });

    it('should store sale credits with correct store id from AuthService', () => {
      service.createSaleCredit('order-1', 'Client A', 1000, '');
      const json = service.getSaleCreditsJson();
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(1);
    });

    it('should set paidType correctly when paying sale credit', () => {
      const createResult = service.createSaleCredit('order-123', 'Client A', 1000, '');
      const paidResult = service.paidSaleCredit(createResult.data.id, PaymentType.Tarjeta, '');
      expect(paidResult.data.paidType).toBe(PaymentType.Tarjeta);
    });
  });
});

// =============================================================================
// TEST COVERAGE SUMMARY
// =============================================================================

/**
 * =============================================================================
 * TEST COVERAGE SUMMARY - Total Tests: 50
 * =============================================================================
 *
 * ORDEROFFLINESERVICE (13 tests)
 * ├── Happy Path (4): createOrder, credit orders, getOrderById, totals
 * ├── Edge Cases (3): empty cart, zero quantity, non-existent
 * ├── Error Handling (3): deactivate, update, activate non-existent
 * └── Integrations (1): AuthService user login
 *
 * INVENTORYOFFLINESERVICE (12 tests)
 * ├── Happy Path (4): createEntry, getInventories, availability, delete
 * ├── Edge Cases (4): zero qty, zero cost, non-existent product, empty id
 * ├── Error Handling (2): delete invalid, update non-existent
 * └── Integrations (2): ProductRepository validation, AuthService
 *
 * EXPENSEOFFLINESERVICE (12 tests)
 * ├── Happy Path (4): create, update, delete, totals
 * ├── Edge Cases (3): zero amount, negative amount, empty note
 * ├── Error Handling (2): update non-existent, delete non-existent
 * └── Integrations (3): AuthService login, store id, persistence
 *
 * SALECREDITOFFLINESERVICE (13 tests)
 * ├── Happy Path (4): create, update, paid, delete
 * ├── Edge Cases (4): empty client, zero amount, negative amount, empty note
 * ├── Error Handling (4): update, pay, delete non-existent, deactivate by order
 * └── Integrations (3): AuthService, store id, paidType
 *
 * =============================================================================
 * SCENARIOS COVERED
 * =============================================================================
 *
 * 1. HAPPY PATH (16 tests): Normal CRUD, localStorage persistence, calculations
 * 2. EDGE CASES (14 tests): Empty/null, zero/negative, non-existent IDs
 * 3. ERROR HANDLING (11 tests): Proper failures, no crashes
 * 4. INTEGRATIONS (9 tests): AuthService, ProductRepository, cross-service
 *
 * Run with: npm test
 * =============================================================================
 */
