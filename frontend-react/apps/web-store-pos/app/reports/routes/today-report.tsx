import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ReportAggregationService } from '../lib/services/report-aggregation-service';
import type { ReportSummary } from '../lib/services/report-aggregation-service';

export const loader = featureLoader([EFeatures.TodayReports]);

export function TodayReportPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [report, setReport] = useState<ReportSummary | null>(null);

  const loadReport = useCallback(() => {
    const svc = new ReportAggregationService(storeId);
    setReport(svc.getTodayReport());
  }, [storeId]);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const summary = report ?? {
    date: new Date(),
    orderCount: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    available: [],
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'REPORTS.TODAY.TITLE' })}
        </h1>
        <button
          type="button"
          onClick={loadReport}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {intl.formatMessage({ id: 'REPORTS.REFRESH' })}
        </button>
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
              ${summary.totalRevenue.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_REVENUE' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-600">
              ${summary.totalCost.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_COST' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">
              ${summary.totalProfit.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_PROFIT' })}
            </div>
          </div>
        </div>
      </section>

      {/* Inventory Status Section */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'REPORTS.INVENTORY.TITLE' })}
        </h2>

        {summary.available.length === 0 ? (
          <div className="py-6 text-center text-gray-400">
            {intl.formatMessage({ id: 'REPORTS.INVENTORY.EMPTY_STATE' })}
          </div>
        ) : (
          <div className="rounded border">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    {intl.formatMessage({ id: 'REPORTS.INVENTORY.PRODUCT' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">
                    {intl.formatMessage({ id: 'REPORTS.INVENTORY.AVAILABLE' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.available.map((item) => (
                  <tr key={item.productId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{item.productName}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{item.available}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default TodayReportPage;
