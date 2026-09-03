import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { generateProductRows } from '~/reports/lib/pdf/generate-product-rows';
import { exportInventoryTodaySalePdf } from '~/reports/lib/pdf/inventory-today-sale-pdf';
import { round2 } from '~/shared/lib/money';
import { formatCurrency } from '~/shared/lib/format-currency';
import { Button } from '~/shared/components/ui/button';
import { DownloadIcon } from '~/shared/components/ui/icons';

export const clientLoader = featureLoader([EFeatures.TodayReports]);

// Local view-model types — Angular keeps this shape inline in the presentation
// components (today-orders.component.ts, inventory-today-sales-profit.component.ts,
// inventory-available.component.ts); no shared aggregation service/model exists on
// the Angular side, so React does not invent one either (rule 12).
interface TodayReportSummary {
  date: Date;
  orderCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
}

/**
 * Computes today's report summary from the offline services' existing public
 * methods. Mirrors the computations Angular keeps inline in
 * today-orders.component.ts (order count), inventory-today-sales-profit.component.ts
 * (revenue/cost/profit totals) and inventory-available.component.ts +
 * inventory-product-list.component.ts (per-product available table) — moved here
 * (not a data-layer service) since Angular has no shared aggregation service for
 * this route either.
 */
function computeTodayReport(storeId: string, date: Date = new Date()): TodayReportSummary {
  const orderService = new OrderOfflineService(storeId);

  const orders = orderService.getActiveOrdersInDay(date);

  let totalRevenue = 0;
  let totalCost = 0;

  for (const order of orders) {
    for (const item of order.orderItems) {
      const result = calculateOrderProfit(item);
      totalRevenue = round2(totalRevenue + result.revenue);
      totalCost = round2(totalCost + result.cost);
    }
  }

  const totalProfit = round2(totalRevenue - totalCost);

  return {
    date,
    orderCount: orders.length,
    totalRevenue,
    totalCost,
    totalProfit,
  };
}

export function TodayReportPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [report, setReport] = useState<TodayReportSummary | null>(null);

  const loadReport = useCallback(() => {
    setReport(computeTodayReport(storeId));
  }, [storeId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // presentation-parity-bucket-b WU3: 1:1 port of Angular's
  // InventoryTodaySaleComponent.generateReport() (inventory-today-sale.component.ts:44-99,
  // currently disabled — angular-bugs-policy #511) wired to the faithful React PDF port
  // (reports/lib/pdf/inventory-today-sale-pdf.ts). Rows are built by generateProductRows()
  // (reports/lib/pdf/generate-product-rows.ts, the ported inventory-today-sale.component.ts:176-226
  // aggregation) from the same offline services computeTodayReport already uses.
  const handleGenerateReport = useCallback(async () => {
    const categoryRepository = new ProductCategoryRepository(storeId);
    const productRepository = new ProductRepository(storeId, categoryRepository);
    const orderService = new OrderOfflineService(storeId);
    const inventoryService = new InventoryOfflineService(storeId, productRepository);

    const rows = generateProductRows(productRepository, orderService, inventoryService);
    await exportInventoryTodaySalePdf(rows);
  }, [storeId]);

  const summary = report ?? {
    date: new Date(),
    orderCount: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'REPORTS.TODAY.TITLE' })}
        </h1>
      </div>

      {/* presentation-parity-bucket-b WU3: mirrors Angular's inventory-today-sale.component.html
          mat-fab extended "Generar Reporte" PDF-export button — ABOVE the dashboard. */}
      <div className="flex justify-end">
        <Button type="button" variant="fab" onClick={handleGenerateReport}>
          <DownloadIcon />
          {intl.formatMessage({ id: 'REPORT.INVENTORY_TODAY_SALE' })}
        </Button>
      </div>

      {/* Sales Summary Section */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TITLE' })}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-gray-800">{summary.orderCount}</div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.ORDER_COUNT' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-green-700">
              {formatCurrency(summary.totalRevenue)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_REVENUE' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary.totalCost)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_COST' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">
              {formatCurrency(summary.totalProfit)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_PROFIT' })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default TodayReportPage;
