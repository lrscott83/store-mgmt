import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock dependencies (must be before imports) ───────────────────────────────

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn(),
}));

// Spy to ensure InventoryOfflineService is NEVER called in statistics (STAT-5)
vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn(),
}));

import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import {
  StatisticsAggregationService,
} from './statistics-aggregation-service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDateAtDay(daysAgo: number, today: Date): Date {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(10, 0, 0, 0);
  return d;
}

function makeOrder(date: Date, items: Array<{
  price: number;
  quantity: number;
  productCosts: Array<{ id: string; costPrice: number; quantity: number }>;
}>) {
  return {
    id: crypto.randomUUID(),
    isActive: true,
    date,
    total: items.reduce((s, i) => s + i.price * i.quantity, 0),
    orderItems: items.map((item, idx) => ({
      productId: `p${idx}`,
      productName: `Product ${idx}`,
      categoryId: 'cat1',
      categoryName: 'Cat',
      name: `Product ${idx}`,
      quantity: item.quantity,
      price: item.price,
      productBusinessId: '',
      productCosts: item.productCosts,
      order: idx,
    })),
    itemsCount: items.reduce((s, i) => s + i.quantity, 0),
    isCredit: false,
    description: '',
    type: 1,
    paymentType: 1,
    createdDate: date,
    createdByName: '',
    updatedDate: date,
    updatedByName: '',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StatisticsAggregationService', () => {
  const TODAY = new Date('2026-05-28T12:00:00.000Z');

  let mockOrderService: { getByDateRange: ReturnType<typeof vi.fn> };
  let mockInventoryService: { getAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrderService = {
      getByDateRange: vi.fn().mockReturnValue([]),
    };
    mockInventoryService = {
      getAll: vi.fn().mockReturnValue([]),
    };

    vi.mocked(OrderOfflineService).mockImplementation(() => mockOrderService as never);
    vi.mocked(InventoryOfflineService).mockImplementation(() => mockInventoryService as never);
  });

  // ─── getDailySales ─────────────────────────────────────────────────────────

  describe('getDailySales', () => {
    it('returns exactly 30 entries even with no orders', () => {
      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailySales(TODAY);
      expect(result).toHaveLength(30);
    });

    it('all entries are zero when no orders exist', () => {
      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailySales(TODAY);
      for (const point of result) {
        expect(point.totalRevenue).toBe(0);
        expect(point.orderCount).toBe(0);
      }
    });

    it('each entry has a YYYY-MM-DD date string', () => {
      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailySales(TODAY);
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      for (const point of result) {
        expect(point.date).toMatch(dateRegex);
      }
    });

    it('dates span 30 days ending on today (index 29 = today)', () => {
      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailySales(TODAY);
      // First entry = 29 days ago, last = today
      const todayStr = TODAY.toISOString().slice(0, 10);
      expect(result[result.length - 1].date).toBe(todayStr);
    });

    it('aggregates totalRevenue correctly for a day with orders', () => {
      const orderDate = makeDateAtDay(0, TODAY); // today
      mockOrderService.getByDateRange.mockReturnValue([
        makeOrder(orderDate, [
          { price: 10, quantity: 3, productCosts: [] },
          { price: 5, quantity: 4, productCosts: [] },
        ]),
      ]);

      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailySales(TODAY);

      const todayStr = TODAY.toISOString().slice(0, 10);
      const todayPoint = result.find((p) => p.date === todayStr);
      expect(todayPoint).toBeDefined();
      // revenue = 10*3 + 5*4 = 50
      expect(todayPoint!.totalRevenue).toBe(50);
      expect(todayPoint!.orderCount).toBe(1);
    });

    it('groups multiple orders on the same day', () => {
      const orderDate = makeDateAtDay(1, TODAY); // yesterday
      mockOrderService.getByDateRange.mockReturnValue([
        makeOrder(orderDate, [{ price: 10, quantity: 2, productCosts: [] }]),
        makeOrder(orderDate, [{ price: 5, quantity: 4, productCosts: [] }]),
      ]);

      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailySales(TODAY);

      const d = new Date(TODAY);
      d.setDate(d.getDate() - 1);
      const yesterdayStr = d.toISOString().slice(0, 10);

      const point = result.find((p) => p.date === yesterdayStr);
      expect(point!.totalRevenue).toBe(40); // 20 + 20
      expect(point!.orderCount).toBe(2);
    });

    it('zero-fills days with no orders (STAT-6)', () => {
      const orderDate = makeDateAtDay(5, TODAY);
      mockOrderService.getByDateRange.mockReturnValue([
        makeOrder(orderDate, [{ price: 20, quantity: 1, productCosts: [] }]),
      ]);

      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailySales(TODAY);

      // Days other than day-5 should be 0
      const day5Str = orderDate.toISOString().slice(0, 10);
      const zeroPoints = result.filter((p) => p.date !== day5Str);
      for (const point of zeroPoints) {
        expect(point.totalRevenue).toBe(0);
        expect(point.orderCount).toBe(0);
      }
    });

    it('calls getByDateRange (STAT-2) and NOT InventoryOfflineService', () => {
      const svc = new StatisticsAggregationService('store-1');
      svc.getDailySales(TODAY);

      expect(mockOrderService.getByDateRange).toHaveBeenCalledOnce();
      // InventoryOfflineService constructor should NOT be called (STAT-5)
      expect(vi.mocked(InventoryOfflineService)).not.toHaveBeenCalled();
    });
  });

  // ─── getDailyProfit ────────────────────────────────────────────────────────

  describe('getDailyProfit', () => {
    it('returns exactly 30 entries', () => {
      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailyProfit(TODAY);
      expect(result).toHaveLength(30);
    });

    it('all entries are zero when no orders exist', () => {
      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailyProfit(TODAY);
      for (const point of result) {
        expect(point.profit).toBe(0);
      }
    });

    it('each entry has a YYYY-MM-DD date string', () => {
      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailyProfit(TODAY);
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      for (const point of result) {
        expect(point.date).toMatch(dateRegex);
      }
    });

    it('calculates profit via calculateOrderProfit (uses productCosts, not inventory)', () => {
      const orderDate = makeDateAtDay(0, TODAY);
      mockOrderService.getByDateRange.mockReturnValue([
        makeOrder(orderDate, [
          {
            price: 20,
            quantity: 3,
            productCosts: [{ id: 'ic1', costPrice: 12, quantity: 3 }],
          },
        ]),
      ]);

      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailyProfit(TODAY);

      const todayStr = TODAY.toISOString().slice(0, 10);
      const todayPoint = result.find((p) => p.date === todayStr);
      // profit = (20*3) - (12*3) = 60 - 36 = 24
      expect(todayPoint!.profit).toBe(24);
    });

    it('profit sums across multiple items in one order', () => {
      const orderDate = makeDateAtDay(0, TODAY);
      mockOrderService.getByDateRange.mockReturnValue([
        makeOrder(orderDate, [
          {
            price: 10,
            quantity: 2,
            productCosts: [{ id: 'ic1', costPrice: 6, quantity: 2 }],
          },
          {
            price: 5,
            quantity: 4,
            productCosts: [{ id: 'ic2', costPrice: 3, quantity: 4 }],
          },
        ]),
      ]);

      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailyProfit(TODAY);

      const todayStr = TODAY.toISOString().slice(0, 10);
      const todayPoint = result.find((p) => p.date === todayStr);
      // item1: 10*2 - 6*2 = 8; item2: 5*4 - 3*4 = 8; total = 16
      expect(todayPoint!.profit).toBe(16);
    });

    it('InventoryOfflineService is NEVER called (STAT-5 hard constraint)', () => {
      const orderDate = makeDateAtDay(0, TODAY);
      mockOrderService.getByDateRange.mockReturnValue([
        makeOrder(orderDate, [
          { price: 10, quantity: 1, productCosts: [{ id: 'ic1', costPrice: 5, quantity: 1 }] },
        ]),
      ]);

      const svc = new StatisticsAggregationService('store-1');
      svc.getDailyProfit(TODAY);

      expect(vi.mocked(InventoryOfflineService)).not.toHaveBeenCalled();
    });

    it('zero-fills days with no orders', () => {
      const orderDate = makeDateAtDay(3, TODAY);
      mockOrderService.getByDateRange.mockReturnValue([
        makeOrder(orderDate, [
          { price: 10, quantity: 1, productCosts: [{ id: 'ic1', costPrice: 4, quantity: 1 }] },
        ]),
      ]);

      const svc = new StatisticsAggregationService('store-1');
      const result = svc.getDailyProfit(TODAY);

      const day3Str = orderDate.toISOString().slice(0, 10);
      const zeroPoints = result.filter((p) => p.date !== day3Str);
      for (const point of zeroPoints) {
        expect(point.profit).toBe(0);
      }
    });
  });
});
