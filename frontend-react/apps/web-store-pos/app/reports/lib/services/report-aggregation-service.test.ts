import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn(),
}));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn(),
}));

import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ReportAggregationService } from './report-aggregation-service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<{
  id: string;
  isActive: boolean;
  total: number;
  orderItems: Array<{ productId: string; productName: string; price: number; quantity: number; productCosts: Array<{ id: string; costPrice: number; quantity: number }> }>;
}> = {}) {
  return {
    id: overrides.id ?? 'order-1',
    isActive: overrides.isActive ?? true,
    total: overrides.total ?? 100,
    orderItems: overrides.orderItems ?? [
      {
        productId: 'p1',
        productName: 'Product 1',
        price: 10,
        quantity: 5,
        productCosts: [{ id: 'ic1', costPrice: 6, quantity: 5 }],
      },
    ],
    date: new Date(),
    paymentType: 1,
    itemsCount: 5,
    isCredit: false,
    description: '',
    type: 1,
    createdDate: new Date(),
    createdByName: '',
    updatedDate: new Date(),
    updatedByName: '',
  };
}

function makeInventoryEntry(productId: string, available: number, id: string = 'e1') {
  return {
    id,
    productId,
    categoryId: 'cat1',
    quantity: available,
    available,
    costPrice: 5,
    date: new Date(),
    order: 0,
    isActive: true,
    createdDate: new Date(),
    createdByName: '',
    updatedDate: new Date(),
    updatedByName: '',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReportAggregationService', () => {
  let mockOrderService: { getActiveOrdersInDay: ReturnType<typeof vi.fn> };
  let mockInventoryService: { getAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrderService = {
      getActiveOrdersInDay: vi.fn().mockReturnValue([]),
    };
    mockInventoryService = {
      getAll: vi.fn().mockReturnValue([]),
    };

    vi.mocked(OrderOfflineService).mockImplementation(() => mockOrderService as never);
    vi.mocked(InventoryOfflineService).mockImplementation(() => mockInventoryService as never);
  });

  describe('getTodayReport', () => {
    it('returns zero values when there are no orders', () => {
      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      expect(report.orderCount).toBe(0);
      expect(report.totalRevenue).toBe(0);
      expect(report.totalCost).toBe(0);
      expect(report.totalProfit).toBe(0);
    });

    it('returns the correct date (today)', () => {
      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();
      const today = new Date();

      expect(report.date.getFullYear()).toBe(today.getFullYear());
      expect(report.date.getMonth()).toBe(today.getMonth());
      expect(report.date.getDate()).toBe(today.getDate());
    });

    it('counts only active orders', () => {
      const activeOrder = makeOrder({ id: 'a1', isActive: true });
      // getActiveOrdersInDay already filters by isActive — simulate correct behavior
      mockOrderService.getActiveOrdersInDay.mockReturnValue([activeOrder]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      expect(report.orderCount).toBe(1);
    });

    it('aggregates totalRevenue from all active order items', () => {
      const order = makeOrder({
        orderItems: [
          { productId: 'p1', productName: 'P1', price: 10, quantity: 3, productCosts: [] },
          { productId: 'p2', productName: 'P2', price: 5, quantity: 4, productCosts: [] },
        ],
        total: 50,
      });
      mockOrderService.getActiveOrdersInDay.mockReturnValue([order]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      // revenue = 10*3 + 5*4 = 30 + 20 = 50
      expect(report.totalRevenue).toBe(50);
    });

    it('aggregates totalCost from productCosts', () => {
      const order = makeOrder({
        orderItems: [
          {
            productId: 'p1',
            productName: 'P1',
            price: 10,
            quantity: 2,
            productCosts: [{ id: 'ic1', costPrice: 4, quantity: 2 }],
          },
        ],
        total: 20,
      });
      mockOrderService.getActiveOrdersInDay.mockReturnValue([order]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      // cost = 4 * 2 = 8
      expect(report.totalCost).toBe(8);
      // profit = 20 - 8 = 12
      expect(report.totalProfit).toBe(12);
    });

    it('totalProfit = totalRevenue - totalCost', () => {
      const order = makeOrder({
        orderItems: [
          {
            productId: 'p1',
            productName: 'P1',
            price: 20,
            quantity: 3,
            productCosts: [{ id: 'ic1', costPrice: 12, quantity: 3 }],
          },
        ],
        total: 60,
      });
      mockOrderService.getActiveOrdersInDay.mockReturnValue([order]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      expect(report.totalRevenue).toBe(60);
      expect(report.totalCost).toBe(36);
      expect(report.totalProfit).toBe(24);
    });

    it('available is empty array when no inventory entries exist', () => {
      mockInventoryService.getAll.mockReturnValue([]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      expect(report.available).toEqual([]);
    });

    it('available sums InventoryEntry.available per productId (NOT product field)', () => {
      // Two entries for the same product with different available quantities
      mockInventoryService.getAll.mockReturnValue([
        { id: 'e1', productId: 'p1', productName: 'Product 1', quantity: 10, available: 7, costPrice: 5, date: new Date(), order: 0, isActive: true, createdDate: new Date(), createdByName: '', updatedDate: new Date(), updatedByName: '' },
        { id: 'e2', productId: 'p1', productName: 'Product 1', quantity: 5, available: 3, costPrice: 5, date: new Date(), order: 1, isActive: true, createdDate: new Date(), createdByName: '', updatedDate: new Date(), updatedByName: '' },
      ]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      // available = 7 + 3 = 10 for p1
      expect(report.available).toHaveLength(1);
      expect(report.available[0].productId).toBe('p1');
      expect(report.available[0].available).toBe(10);
    });

    it('available groups multiple products correctly', () => {
      mockInventoryService.getAll.mockReturnValue([
        { id: 'e1', productId: 'p1', productName: 'Product 1', quantity: 10, available: 5, costPrice: 5, date: new Date(), order: 0, isActive: true, createdDate: new Date(), createdByName: '', updatedDate: new Date(), updatedByName: '' },
        { id: 'e2', productId: 'p2', productName: 'Product 2', quantity: 8, available: 8, costPrice: 3, date: new Date(), order: 0, isActive: true, createdDate: new Date(), createdByName: '', updatedDate: new Date(), updatedByName: '' },
      ]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      expect(report.available).toHaveLength(2);
      const p1 = report.available.find((a) => a.productId === 'p1');
      const p2 = report.available.find((a) => a.productId === 'p2');
      expect(p1?.available).toBe(5);
      expect(p2?.available).toBe(8);
    });

    it('available entries have productId and productName', () => {
      mockInventoryService.getAll.mockReturnValue([
        { id: 'e1', productId: 'prod-abc', productName: 'Manzana', quantity: 10, available: 4, costPrice: 2, date: new Date(), order: 0, isActive: true, createdDate: new Date(), createdByName: '', updatedDate: new Date(), updatedByName: '' },
      ]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      expect(report.available[0].productId).toBe('prod-abc');
      expect(report.available[0].productName).toBe('Manzana');
    });

    it('excludes products with zero available from the list', () => {
      mockInventoryService.getAll.mockReturnValue([
        { id: 'e1', productId: 'p1', productName: 'Product 1', quantity: 10, available: 0, costPrice: 5, date: new Date(), order: 0, isActive: true, createdDate: new Date(), createdByName: '', updatedDate: new Date(), updatedByName: '' },
        { id: 'e2', productId: 'p2', productName: 'Product 2', quantity: 5, available: 3, costPrice: 3, date: new Date(), order: 0, isActive: true, createdDate: new Date(), createdByName: '', updatedDate: new Date(), updatedByName: '' },
      ]);

      const svc = new ReportAggregationService('store-1');
      const report = svc.getTodayReport();

      expect(report.available).toHaveLength(1);
      expect(report.available[0].productId).toBe('p2');
    });
  });
});
