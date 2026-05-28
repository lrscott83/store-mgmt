import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { StatisticsAggregationService } from '../lib/services/statistics-aggregation-service';
import type { DailySalesPoint, DailyProfitPoint } from '../lib/services/statistics-aggregation-service';
import { SalesChart } from '../components/sales-chart';
import { ProfitChart } from '../components/profit-chart';

export const loader = featureLoader([EFeatures.Dashboard]);

export function DashboardPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [salesData, setSalesData] = useState<DailySalesPoint[]>([]);
  const [profitData, setProfitData] = useState<DailyProfitPoint[]>([]);

  useEffect(() => {
    const svc = new StatisticsAggregationService(storeId);
    setSalesData(svc.getDailySales());
    setProfitData(svc.getDailyProfit());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const loadingMsg = intl.formatMessage({ id: 'GENERAL.LOADING' });
  const emptyMsg = intl.formatMessage({ id: 'STATISTICS.EMPTY_STATE' });

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'STATISTICS.DASHBOARD.TITLE' })}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {intl.formatMessage({ id: 'STATISTICS.LAST_30_DAYS' })}
        </p>
      </div>

      {/* Sales Chart */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'STATISTICS.SALES.TITLE' })}
        </h2>
        <SalesChart
          data={salesData}
          loadingMessage={loadingMsg}
          emptyMessage={emptyMsg}
        />
      </section>

      {/* Profit Chart */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'STATISTICS.PROFIT.TITLE' })}
        </h2>
        <ProfitChart
          data={profitData}
          loadingMessage={loadingMsg}
          emptyMessage={emptyMsg}
        />
      </section>
    </div>
  );
}

export default DashboardPage;
