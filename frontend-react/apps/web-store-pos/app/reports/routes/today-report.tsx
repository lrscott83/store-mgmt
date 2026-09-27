import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import type { Currency } from '@store-mgmt/domain';
import { DEFAULT_CURRENCY, EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { CurrencyFilter } from '~/shared/components/multimonedas/currency-filter';
import { useCurrencyFilter } from '~/shared/components/multimonedas/use-currency-filter';
import { presentCurrencies, resolveCurrency } from '~/shared/lib/currency-totals';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { generateProductRows } from '~/reports/lib/pdf/generate-product-rows';
import { exportInventoryTodaySalePdf } from '~/reports/lib/pdf/inventory-today-sale-pdf';
import { round2 } from '~/shared/lib/money';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
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
 *
 * `currency` (currency-filter-per-view): when given, only orders of that currency
 * contribute — the summary never mixes currencies. Absent = the legacy mixed sum
 * (module OFF / filter hidden), byte-identical to the previous behaviour.
 */
function computeTodayReport(
  storeId: string,
  date: Date = new Date(),
  currency?: Currency,
): TodayReportSummary {
  const orderService = new OrderOfflineService(storeId);

  const orders = orderService
    .getActiveOrdersInDay(date)
    .filter((order) => currency === undefined || resolveCurrency(order.currency) === currency);

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

/**
 * Currency options for the filter, derived from the UNFILTERED set (today's active
 * orders) so the filter never disappears once a currency is selected. Reuses the
 * shared `presentCurrencies` (USD → EUR → CUP → rest by amount DESC).
 */
function getTodayReportCurrencies(storeId: string, date: Date = new Date()): Currency[] {
  const orders = new OrderOfflineService(storeId).getActiveOrdersInDay(date);
  return presentCurrencies(orders.map((order) => ({ amount: order.total, currency: order.currency })));
}

export function TodayReportPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const multiMonedas = hasMultiMonedasAvailable(user);
  const [report, setReport] = useState<TodayReportSummary | null>(null);
  const [currencyOptions, setCurrencyOptions] = useState<Currency[]>([]);

  // Filtro de moneda (currency-filter-per-view): las opciones salen del conjunto
  // SIN filtrar (las órdenes activas de hoy) para que al elegir una moneda el
  // filtro no desaparezca. Con el módulo MultiMonedas inactivo o una sola moneda
  // no se filtra nada.
  const { visible: currencyFilterVisible, currency, setCurrency } =
    useCurrencyFilter(currencyOptions);
  const selectedCurrency = currencyFilterVisible && currency !== null ? currency : undefined;
  // Moneda del display: la elegida con el filtro visible; con el módulo activo y
  // una sola moneda, esa moneda (el arreglo, sin filtro); si no, CUP (el total
  // mezclado del gate OFF conserva su rótulo actual).
  const displayCurrency: Currency = currencyFilterVisible && currency !== null
    ? currency
    : multiMonedas
      ? (currencyOptions[0] ?? DEFAULT_CURRENCY)
      : DEFAULT_CURRENCY;

  useEffect(() => {
    setCurrencyOptions(getTodayReportCurrencies(storeId));
  }, [storeId]);

  const loadReport = useCallback(() => {
    setReport(computeTodayReport(storeId, new Date(), selectedCurrency));
  }, [storeId, selectedCurrency]);

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
    // Decision 8 (el PDF respeta el filtro): con el filtro visible, el PDF lleva
    // SOLO las filas de la moneda elegida. Nunca se convierte: cada fila tiene su
    // moneda real y una fila de otra moneda se descarta.
    const pdfRows = selectedCurrency
      ? rows.filter((row) => row.currency === selectedCurrency)
      : rows;
    await exportInventoryTodaySalePdf(pdfRows);
  }, [storeId, selectedCurrency]);

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

      {/* Fila propia de moneda debajo del botón/filtros existentes (se auto-oculta):
          gobierna el resumen y el PDF descargado. */}
      <div>
        <CurrencyFilter
          currencies={currencyOptions}
          value={currency ?? currencyOptions[0] ?? DEFAULT_CURRENCY}
          onChange={setCurrency}
        />
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
            <div className="text-2xl font-bold text-green-700 whitespace-nowrap">
              {formatMoneyWithCurrency(summary.totalRevenue, displayCurrency)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_REVENUE' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-600 whitespace-nowrap">
              {formatMoneyWithCurrency(summary.totalCost, displayCurrency)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_COST' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700 whitespace-nowrap">
              {formatMoneyWithCurrency(summary.totalProfit, displayCurrency)}
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
