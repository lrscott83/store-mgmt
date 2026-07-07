import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';

export interface ReportProductAvailable {
  productId: string;
  productName: string;
  available: number;
}

export interface ReportSummary {
  date: Date;
  orderCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  available: ReportProductAvailable[];
}

/**
 * ReportAggregationService — Approach B aggregation service.
 * Consumes OrderOfflineService + InventoryOfflineService to produce a
 * serializable ReportSummary view model for the today-report route.
 *
 * Read-only: makes zero mutations to any repository.
 * Spec: REP-1 through REP-15; Scenarios S-REP-1 to S-REP-11.
 */
export class ReportAggregationService {
  private readonly orderService: OrderOfflineService;
  private readonly inventoryService: InventoryOfflineService;

  constructor(storeId: string) {
    this.orderService = new OrderOfflineService(storeId);
    this.inventoryService = new InventoryOfflineService(storeId, new ProductRepository(storeId));
  }

  getTodayReport(date: Date = new Date()): ReportSummary {
    const orders = this.orderService.getActiveOrdersInDay(date);

    let totalRevenue = 0;
    let totalCost = 0;

    for (const order of orders) {
      for (const item of order.orderItems) {
        const result = calculateOrderProfit(item);
        totalRevenue += result.revenue;
        totalCost += result.cost;
      }
    }

    const totalProfit = totalRevenue - totalCost;

    // available = sum of InventoryEntry.available per productId (REP-5).
    // InventoryOfflineService.getAll() returns InventoryEntryView[] which
    // includes productName. We access the underlying available field via cast
    // since InventoryEntryView deliberately omits it (UI view only).
    type EntryWithAvailable = { productId: string; productName: string; available: number };
    const inventoryEntries = this.inventoryService.getAll() as unknown as EntryWithAvailable[];

    const availableMap = new Map<string, { productName: string; available: number }>();
    for (const entry of inventoryEntries) {
      const av = entry.available ?? 0;
      const existing = availableMap.get(entry.productId);
      if (existing) {
        existing.available += av;
      } else {
        availableMap.set(entry.productId, {
          productName: entry.productName,
          available: av,
        });
      }
    }

    // InventoryEntryView doesn't have productName reliably — use productId as fallback
    // Filter out products with zero available (REP-5: available = sum; zero-entry products excluded)
    const available: ReportProductAvailable[] = [];
    for (const [productId, data] of availableMap) {
      if (data.available > 0) {
        available.push({
          productId,
          productName: data.productName || productId,
          available: data.available,
        });
      }
    }

    return {
      date,
      orderCount: orders.length,
      totalRevenue,
      totalCost,
      totalProfit,
      available,
    };
  }
}
