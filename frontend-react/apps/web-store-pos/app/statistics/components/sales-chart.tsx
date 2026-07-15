// React.lazy — recharts is NOT imported here, only in chart-core.tsx (STAT-8, CC-6).
import { lazy, Suspense } from 'react';
import type { ChartData } from '~/sales/lib/services/order-offline-service';

const SalesChartCore = lazy(() =>
  import('./chart-core').then((m) => ({ default: m.SalesChartCore })),
);

interface SalesChartProps {
  data: ChartData[];
  loadingMessage: string;
  emptyMessage: string;
}

export function SalesChart({ data, loadingMessage, emptyMessage }: SalesChartProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10 text-sm text-gray-400">
          {loadingMessage}
        </div>
      }
    >
      <SalesChartCore data={data} emptyMessage={emptyMessage} />
    </Suspense>
  );
}
