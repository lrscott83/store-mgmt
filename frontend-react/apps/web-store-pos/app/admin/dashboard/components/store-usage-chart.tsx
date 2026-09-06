// React.lazy — recharts is NOT imported here, only in statistics/components/chart-core.tsx
// (the one-file invariant that keeps recharts out of the admin chunk). Same pattern as
// statistics/components/sales-chart.tsx.
import { lazy, Suspense } from 'react';

const StoreUsageChartCore = lazy(() =>
  import('~/statistics/components/chart-core').then((m) => ({
    default: m.StoreUsageChartCore,
  })),
);

interface StoreUsageChartProps {
  data: { label: string; value: number }[];
  loadingMessage: string;
  emptyMessage: string;
}

export function StoreUsageChart({ data, loadingMessage, emptyMessage }: StoreUsageChartProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10 text-sm text-gray-400">
          {loadingMessage}
        </div>
      }
    >
      <StoreUsageChartCore data={data} emptyMessage={emptyMessage} />
    </Suspense>
  );
}
