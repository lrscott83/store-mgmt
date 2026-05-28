// React.lazy — recharts is NOT imported here, only in chart-core.tsx (STAT-8, CC-6).
import { lazy, Suspense } from 'react';
import type { DailyProfitPoint } from '../lib/services/statistics-aggregation-service';

const ProfitChartCore = lazy(() =>
  import('./chart-core').then((m) => ({ default: m.ProfitChartCore })),
);

interface ProfitChartProps {
  data: DailyProfitPoint[];
  loadingMessage: string;
  emptyMessage: string;
}

export function ProfitChart({ data, loadingMessage, emptyMessage }: ProfitChartProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10 text-sm text-gray-400">
          {loadingMessage}
        </div>
      }
    >
      <ProfitChartCore data={data} emptyMessage={emptyMessage} />
    </Suspense>
  );
}
