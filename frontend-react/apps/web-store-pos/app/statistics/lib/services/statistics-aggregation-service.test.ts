import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock dependencies (must be before imports) ───────────────────────────────

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn(),
}));

// Spy to ensure InventoryOfflineService is NEVER called in statistics (STAT-5)
vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn(),
}));

// WU6: ExpenseOfflineService is injected for daily-profit expense-netting.
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn(),
}));

import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
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
  let mockExpenseService: { getActiveExpensesPriceBetweenDates: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrderService = {
      getByDateRange: vi.fn().mockReturnValue([]),
    };
    mockInventoryService = {
      getAll: vi.fn().mockReturnValue([]),
    };
    mockExpenseService = {
      getActiveExpensesPriceBetweenDates: vi.fn().mockReturnValue(0),
    };

    vi.mocked(OrderOfflineService).mockImplementation(() => mockOrderService as never);
    vi.mocked(InventoryOfflineService).mockImplementation(() => mockInventoryService as never);
    vi.mocked(ExpenseOfflineService).mockImplementation(() => mockExpenseService as never);
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

    // WU6: Daily Profit Nets Out Expenses (spec statistics-aggregation, ADR-6).
    describe('expense netting (WU6)', () => {
      it('nets orders and expenses for the day: profit = orderProfit(day) - expenses(day)', () => {
        const orderDate = makeDateAtDay(0, TODAY); // today
        mockOrderService.getByDateRange.mockReturnValue([
          makeOrder(orderDate, [
            { price: 20, quantity: 3, productCosts: [{ id: 'ic1', costPrice: 12, quantity: 3 }] },
          ]),
        ]);
        // orderProfit = (20*3) - (12*3) = 24
        mockExpenseService.getActiveExpensesPriceBetweenDates.mockReturnValue(10);

        const svc = new StatisticsAggregationService('store-1');
        const result = svc.getDailyProfit(TODAY);

        const todayStr = TODAY.toISOString().slice(0, 10);
        const todayPoint = result.find((p) => p.date === todayStr);
        // 24 - 10 = 14
        expect(todayPoint!.profit).toBe(14);
      });

      it('a day with only expenses (no orders) yields a negative profit', () => {
        mockExpenseService.getActiveExpensesPriceBetweenDates.mockReturnValue(30);

        const svc = new StatisticsAggregationService('store-1');
        const result = svc.getDailyProfit(TODAY);

        // Every bucket has 0 order profit and 30 in expenses -> -30 everywhere.
        for (const point of result) {
          expect(point.profit).toBe(-30);
        }
      });

      it('a day with 0 expenses is unaffected (matches Angular no-expense baseline)', () => {
        const orderDate = makeDateAtDay(0, TODAY);
        mockOrderService.getByDateRange.mockReturnValue([
          makeOrder(orderDate, [
            { price: 20, quantity: 3, productCosts: [{ id: 'ic1', costPrice: 12, quantity: 3 }] },
          ]),
        ]);
        mockExpenseService.getActiveExpensesPriceBetweenDates.mockReturnValue(0);

        const svc = new StatisticsAggregationService('store-1');
        const result = svc.getDailyProfit(TODAY);

        const todayStr = TODAY.toISOString().slice(0, 10);
        const todayPoint = result.find((p) => p.date === todayStr);
        expect(todayPoint!.profit).toBe(24);
      });

      it('queries expenses per-bucket with each day\'s OWN [dayStart, dayStart+1) window — NOT Angular\'s buggy always-today window (ADR-6)', () => {
        const svc = new StatisticsAggregationService('store-1');
        svc.getDailyProfit(TODAY);

        // 30 calls, one per bucket, each with a DIFFERENT start date (proves per-day windows,
        // not a single repeated "today" window like Angular's getLastMonthSaleProfits bug).
        expect(mockExpenseService.getActiveExpensesPriceBetweenDates).toHaveBeenCalledTimes(30);
        const callStarts = mockExpenseService.getActiveExpensesPriceBetweenDates.mock.calls.map(
          (args) => (args[0] as Date).getTime(),
        );
        const uniqueStarts = new Set(callStarts);
        expect(uniqueStarts.size).toBe(30);

        // Each call's end = start + 1 day.
        for (const [start, end] of mockExpenseService.getActiveExpensesPriceBetweenDates.mock.calls as [Date, Date][]) {
          const diffMs = end.getTime() - start.getTime();
          expect(diffMs).toBe(24 * 60 * 60 * 1000);
        }
      });

      it('nets expenses independently per bucket (per-bucket isolation)', () => {
        const day0 = makeDateAtDay(0, TODAY);
        const day5 = makeDateAtDay(5, TODAY);
        mockOrderService.getByDateRange.mockReturnValue([
          makeOrder(day0, [{ price: 10, quantity: 1, productCosts: [] }]), // profit 10
          makeOrder(day5, [{ price: 50, quantity: 1, productCosts: [] }]), // profit 50
        ]);
        mockExpenseService.getActiveExpensesPriceBetweenDates.mockImplementation((start: Date) => {
          // Only the day-5 bucket has an expense of 20; every other bucket has 0.
          const day5Start = new Date(day5);
          day5Start.setHours(0, 0, 0, 0);
          return start.getTime() === day5Start.getTime() ? 20 : 0;
        });

        const svc = new StatisticsAggregationService('store-1');
        const result = svc.getDailyProfit(TODAY);

        const todayStr = TODAY.toISOString().slice(0, 10);
        const day5Str = day5.toISOString().slice(0, 10);
        expect(result.find((p) => p.date === todayStr)!.profit).toBe(10); // unaffected
        expect(result.find((p) => p.date === day5Str)!.profit).toBe(30); // 50 - 20
      });
    });
  });
});
