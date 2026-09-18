// React.lazy — recharts is NOT imported here, only in chart-core.tsx (STAT-8, CC-6).
import { lazy, Suspense } from 'react';

const DonutChartCore = lazy(() =>
  import('./chart-core').then((m) => ({ default: m.DonutChartCore })),
);

interface DonutChartProps {
  slices: { id: string; name: string; value: number }[];
  loadingMessage: string;
  emptyMessage: string;
  /** Formats amounts (already currency-aware). */
  formatValue: (value: number) => string;
  testId?: string;
}

/** Donut with its percentage legend, lazily loaded (recharts stays in chart-core). */
export function DonutChart({
  slices,
  loadingMessage,
  emptyMessage,
  formatValue,
  testId,
}: DonutChartProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10 text-sm text-gray-400">
          {loadingMessage}
        </div>
      }
    >
      <DonutChartCore
        slices={slices}
        emptyMessage={emptyMessage}
        formatValue={formatValue}
        testId={testId}
      />
    </Suspense>
  );
}
