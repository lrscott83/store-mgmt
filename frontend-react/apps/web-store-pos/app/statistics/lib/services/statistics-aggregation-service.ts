import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { startOfDay, addDays } from '~/shared/lib/date-utils';

/**
 * DailySalesPoint — view model for the 30-day sales chart.
 * date: YYYY-MM-DD string; totalRevenue is the primary Y axis; orderCount shown in tooltip.
 * Spec: STAT-3.
 */
export interface DailySalesPoint {
  date: string;
  totalRevenue: number;
  orderCount: number;
}

/**
 * DailyProfitPoint — view model for the 30-day profit chart.
 * profit = sum(calculateOrderProfit(item).profit) for all items in all orders that day.
 * InventoryOfflineService is NEVER read here (STAT-5).
 * Spec: STAT-4.
 */
export interface DailyProfitPoint {
  date: string;
  profit: number;
}

/**
 * StatisticsAggregationService — Approach B aggregation service for the Statistics module.
 * Consumes OrderOfflineService only; calculates profit via calculateOrderProfit(orderItem).
 * Returns exactly 30 DailySalesPoint / DailyProfitPoint entries (zero-filled gaps — STAT-6).
 *
 * Hard constraints:
 * - InventoryOfflineService is NEVER instantiated or called (STAT-5).
 * - calculateOrderProfit is the sole cost source.
 * - Cancelled orders (isActive===false) excluded by OrderOfflineService.getByDateRange.
 *
 * Spec: STAT-1 through STAT-8.
 */
export class StatisticsAggregationService {
  private readonly orderService: OrderOfflineService;

  constructor(storeId: string) {
    this.orderService = new OrderOfflineService(storeId);
  }

  /**
   * Returns 30 DailySalesPoint entries (oldest → newest, last entry = today).
   * today param defaults to new Date() — injectable for testing.
   */
  getDailySales(today: Date = new Date()): DailySalesPoint[] {
    const { days, orders } = this.loadLast30Days(today);

    // Group orders by day string
    const byDay = new Map<string, { totalRevenue: number; orderCount: number }>();
    for (const order of orders) {
      const dayStr = this.toDateStr(order.date);
      const existing = byDay.get(dayStr);
      let revenue = 0;
      for (const item of order.orderItems) {
        revenue += item.price * item.quantity;
      }
      if (existing) {
        existing.totalRevenue += revenue;
        existing.orderCount += 1;
      } else {
        byDay.set(dayStr, { totalRevenue: revenue, orderCount: 1 });
      }
    }

    return days.map((dayStr) => {
      const data = byDay.get(dayStr);
      return {
        date: dayStr,
        totalRevenue: data?.totalRevenue ?? 0,
        orderCount: data?.orderCount ?? 0,
      };
    });
  }

  /**
   * Returns 30 DailyProfitPoint entries (oldest → newest, last entry = today).
   * Profit is derived exclusively from calculateOrderProfit(orderItem).
   * today param defaults to new Date() — injectable for testing.
   */
  getDailyProfit(today: Date = new Date()): DailyProfitPoint[] {
    const { days, orders } = this.loadLast30Days(today);

    // Group profit by day string
    const byDay = new Map<string, number>();
    for (const order of orders) {
      const dayStr = this.toDateStr(order.date);
      let dayProfit = 0;
      for (const item of order.orderItems) {
        dayProfit += calculateOrderProfit(item).profit;
      }
      byDay.set(dayStr, (byDay.get(dayStr) ?? 0) + dayProfit);
    }

    return days.map((dayStr) => ({
      date: dayStr,
      profit: byDay.get(dayStr) ?? 0,
    }));
  }

  /**
   * Builds the array of 30 date strings (YYYY-MM-DD) covering the last 30 days
   * and fetches all active orders in that range via OrderOfflineService.getByDateRange.
   *
   * Index 0 = 29 days ago; index 29 = today (STAT-3, STAT-4).
   */
  private loadLast30Days(today: Date): { days: string[]; orders: ReturnType<OrderOfflineService['getByDateRange']> } {
    const todayStart = startOfDay(today);
    const from = addDays(todayStart, -29);    // 29 days ago at midnight
    const to = today;                         // now — inclusive end captures all of today's orders

    // OrderOfflineService.getByDateRange already filters isActive === true (STAT-7)
    const orders = this.orderService.getByDateRange(from, to);

    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = addDays(from, i);
      days.push(this.toDateStr(d));
    }

    return { days, orders };
  }

  /** Formats a Date as YYYY-MM-DD using UTC-safe local-date arithmetic. */
  private toDateStr(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
