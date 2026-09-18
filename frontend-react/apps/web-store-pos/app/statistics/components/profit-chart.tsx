// React.lazy — recharts is NOT imported here, only in chart-core.tsx (STAT-8, CC-6).
import { lazy, Suspense } from 'react';
import type { ChartSeriesPoint } from './chart-core';

const ProfitChartCore = lazy(() =>
  import('./chart-core').then((m) => ({ default: m.ProfitChartCore })),
);

interface ProfitChartProps {
  data: ChartSeriesPoint[];
  loadingMessage: string;
  emptyMessage: string;
  /** Formats Y-axis ticks and tooltip values (already currency-aware). */
  formatValue: (value: number) => string;
  seriesName: string;
}

export function ProfitChart({
  data,
  loadingMessage,
  emptyMessage,
  formatValue,
  seriesName,
}: ProfitChartProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10 text-sm text-gray-400">
          {loadingMessage}
        </div>
      }
    >
      <ProfitChartCore
        data={data}
        emptyMessage={emptyMessage}
        formatValue={formatValue}
        seriesName={seriesName}
      />
    </Suspense>
  );
}
